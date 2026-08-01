import { getNewLeads, updateLeadStatus } from "../services/leadsService";
import { hasAnyOutboundMessage, saveMessage } from "../services/messagesService";
import { isSuppressed } from "../services/suppressionService";
import { logEvent } from "../services/eventsService";
import { canSendMore, recordSend, randomizedDelay } from "../lib/rateLimiter";
import { generateOutreachEmail } from "../lib/claude";
import { sendOutreachEmail } from "../lib/resend";
import { env } from "../config/env";

/**
 * Hourly job: pulls a batch of `status = new` leads and, for each one that
 * has an email address and is not suppressed and has never been messaged
 * before, drafts a personalized email with Claude and sends it via Resend.
 *
 * Compliance is enforced at every step:
 *  - suppression list checked immediately before send (not just at discovery time)
 *  - global rolling 24h send cap checked before EVERY send, not just at batch start
 *  - randomized delay between sends
 *  - exactly one outbound message per lead, ever (unless they reply — reply
 *    handling lives in the webhook, this job never re-sends to a `pitched` lead)
 */
export async function runSendOutreachJob(batchSize = 25): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const candidates = await getNewLeads(batchSize);

  for (const lead of candidates) {
    // Only email is a supported send channel today; phone-only leads wait for a
    // future SMS/call-based channel rather than being silently dropped.
    if (!lead.email) {
      skipped += 1;
      continue;
    }

    if (await isSuppressed({ email: lead.email, phone: lead.phone })) {
      skipped += 1;
      await logEvent({ leadId: lead.id, type: "suppressed_skip", detail: { email: lead.email } });
      continue;
    }

    if (await hasAnyOutboundMessage(lead.id)) {
      // Defensive guard: a `new` lead should never already have a message,
      // but if status update failed after a previous send, this stops a duplicate.
      skipped += 1;
      continue;
    }

    if (!(await canSendMore())) {
      await logEvent({ type: "rate_limit_hit", detail: { cap: env.DAILY_SEND_CAP } });
      break; // stop the whole batch — cap reached for the rolling 24h window
    }

    try {
      const draft = await generateOutreachEmail({
        businessName: lead.name,
        category: lead.category,
        area: lead.area,
      });

      const result = await sendOutreachEmail({
        to: lead.email,
        subject: draft.subject,
        text: draft.body,
        leadUnsubscribeToken: lead.unsubscribe_token,
      });

      await saveMessage({
        leadId: lead.id,
        direction: "outbound",
        subject: draft.subject,
        body: draft.body,
        providerMessageId: result.id,
      });

      await updateLeadStatus(lead.id, "pitched");
      await recordSend(lead.id);
      await logEvent({ leadId: lead.id, type: "email_sent", detail: { subject: draft.subject } });

      sent += 1;
    } catch (err) {
      await logEvent({ leadId: lead.id, type: "error", detail: { stage: "send_outreach", message: String(err) } });
      skipped += 1;
    }

    // Randomized human-like pacing between sends within the batch.
    await randomizedDelay();
  }

  return { sent, skipped };
}
