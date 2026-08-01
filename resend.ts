import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);

/** Builds the one-click unsubscribe URL embedded in every outbound email. */
export function buildUnsubscribeUrl(unsubscribeToken: string): string {
  return `${env.APP_BASE_URL}/api/unsubscribe/${unsubscribeToken}`;
}

/**
 * Appends the legally-required footer (CAN-SPAM: physical address + a clear
 * way to opt out) to every outreach email body. This is done in code, not
 * left to the AI-generated draft, so compliance can never be skipped by a
 * prompt-following mistake.
 */
export function appendComplianceFooter(body: string, unsubscribeToken: string): string {
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);
  return `${body}

—
${env.SENDER_NAME}
${env.AGENCY_NAME}
${env.AGENCY_URL}

${env.COMPLIANCE_POSTAL_ADDRESS}
Don't want to hear from us again? Unsubscribe: ${unsubscribeUrl}`;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  leadUnsubscribeToken: string;
}

/** Sends a single outreach email via Resend and returns the provider message id. */
export async function sendOutreachEmail(params: SendEmailParams): Promise<{ id: string | null }> {
  const finalBody = appendComplianceFooter(params.text, params.leadUnsubscribeToken);

  const { data, error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    reply_to: env.RESEND_REPLY_TO,
    subject: params.subject,
    text: finalBody,
    headers: {
      // List-Unsubscribe header enables one-click unsubscribe in Gmail/Outlook
      // in addition to the link in the body.
      "List-Unsubscribe": `<${buildUnsubscribeUrl(params.leadUnsubscribeToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { id: data?.id ?? null };
}
