import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/errorHandler";
import { getLeadByEmail, getLeadByUnsubscribeToken, updateLeadStatus } from "../services/leadsService";
import { getLastOutboundMessage, saveMessage } from "../services/messagesService";
import { logEvent } from "../services/eventsService";
import { addToSuppressionList } from "../services/suppressionService";
import { classifyReply } from "../lib/claude";

export const webhooksRouter = Router();

/**
 * Verifies the Resend webhook signature (Svix format: HMAC-SHA256 over
 * `${id}.${timestamp}.${body}`, base64-encoded, compared with the
 * `whsec_...` signing secret). This prevents spoofed requests from
 * fabricating "replies" that could trigger fake unsubscribes or status
 * changes.
 */
function verifyResendSignature(rawBody: string, headers: Record<string, string | undefined>): boolean {
  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = Buffer.from(env.RESEND_WEBHOOK_SECRET.split("_").pop() ?? "", "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature header can contain multiple space-separated "v1,<sig>" values.
  const candidates = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  return candidates.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/webhooks/resend-inbound
 * Handles inbound email replies. Resend must be configured (Settings ->
 * Webhooks) to POST `email.received` / inbound events to this URL, and the
 * receiving domain's MX records set up per Resend's inbound docs.
 *
 * Flow: verify signature -> find the lead by sender email -> classify the
 * reply with Claude -> update status + save message + log event ->
 * if intent is "unsubscribe", suppress the lead permanently.
 */
webhooksRouter.post(
  "/resend-inbound",
  asyncHandler(async (req, res) => {
    const rawBody = JSON.stringify(req.body);
    const signatureOk = verifyResendSignature(rawBody, {
      "svix-id": req.header("svix-id") ?? undefined,
      "svix-timestamp": req.header("svix-timestamp") ?? undefined,
      "svix-signature": req.header("svix-signature") ?? undefined,
    });

    if (!signatureOk) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    // Resend's inbound payload shape: { type, data: { from, subject, text, ... } }
    const payload = req.body as {
      type: string;
      data?: { from?: string; subject?: string; text?: string };
    };

    const fromEmail = extractEmailAddress(payload.data?.from ?? "");
    const replyBody = payload.data?.text ?? "";

    if (!fromEmail) {
      res.status(200).json({ ok: true, note: "no sender email parsed, ignored" });
      return;
    }

    const lead = await getLeadByEmail(fromEmail);
    if (!lead) {
      // Reply from someone not in our leads table (e.g. a forwarded thread) — ignore safely.
      res.status(200).json({ ok: true, note: "no matching lead" });
      return;
    }

    // Save the inbound message first so it's never lost even if classification fails.
    await saveMessage({
      leadId: lead.id,
      direction: "inbound",
      subject: payload.data?.subject ?? null,
      body: replyBody,
    });
    await logEvent({ leadId: lead.id, type: "reply_received", detail: { from: fromEmail } });

    const lastOutbound = await getLastOutboundMessage(lead.id);

    const classification = await classifyReply({
      businessName: lead.name,
      originalOutreachBody: lastOutbound?.body ?? "",
      replyBody,
    });

    await logEvent({
      leadId: lead.id,
      type: "classified",
      detail: { intent: classification.intent, confidence: classification.confidence },
    });

    if (classification.intent === "unsubscribe") {
      await addToSuppressionList({ email: lead.email, phone: lead.phone, reason: "unsubscribe" });
      await updateLeadStatus(lead.id, "unsubscribed");
      await logEvent({ leadId: lead.id, type: "unsubscribed", detail: { via: "reply" } });
    } else {
      const nextStatus =
        classification.intent === "meeting_request"
          ? "meeting"
          : classification.intent === "interested"
          ? "interested"
          : "replied";
      await updateLeadStatus(lead.id, nextStatus);
      await logEvent({ leadId: lead.id, type: "status_changed", detail: { status: nextStatus } });
    }

    res.status(200).json({ ok: true, intent: classification.intent });
  })
);

/**
 * GET /api/unsubscribe/:token
 * One-click unsubscribe link included in every outreach email. Public
 * (no API key) by design — it must work directly from an email client.
 * Honored instantly: suppression list + status update happen synchronously
 * before responding.
 */
webhooksRouter.get(
  "/unsubscribe/:token",
  asyncHandler(async (req, res) => {
    const lead = await getLeadByUnsubscribeToken(req.params.token);

    if (!lead) {
      res.status(404).send("Link not found or already processed.");
      return;
    }

    await addToSuppressionList({ email: lead.email, phone: lead.phone, reason: "unsubscribe" });
    await updateLeadStatus(lead.id, "unsubscribed");
    await logEvent({ leadId: lead.id, type: "unsubscribed", detail: { via: "link" } });

    res
      .status(200)
      .send("You have been unsubscribed and will not receive further emails from us. Sorry for the intrusion.");
  })
);

/** Pulls a bare email address out of a "Name <email@x.com>" style From header. */
function extractEmailAddress(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromHeader.trim())) return fromHeader.trim().toLowerCase();
  return null;
}
