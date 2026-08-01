import { env } from "../config/env";

export interface OutreachInput {
  businessName: string;
  category: string;
  area: string;
}

/**
 * Builds the system + user prompt used to draft a single cold outreach email.
 * Kept deliberately strict: short, no false claims, no pressure tactics,
 * and always returns machine-parseable JSON.
 */
export function buildOutreachPrompt(input: OutreachInput): { system: string; user: string } {
  const system = `You are ${env.SENDER_NAME}, a freelance web designer at ${env.AGENCY_NAME}.
You write brief, genuinely useful, non-pushy cold emails to small local businesses that
currently have NO website, offering to build them one.

Rules:
- Under 120 words in the body.
- Plain, conversational tone. No hype, no exclamation-point stacking, no false urgency.
- Reference the business by name and what they do, in one natural sentence — don't
  pretend to have researched them deeply.
- Make ONE clear, low-friction ask (e.g. "worth a quick chat?"), never a hard sell.
- Never fabricate facts, reviews, traffic numbers, or claims about the business.
- Do not use the words "guarantee", "limited time", or "act now".
- Output ONLY a JSON object, no markdown fences, no commentary, in this exact shape:
  {"subject": "...", "body": "..."}
- The body must NOT include a signature block, unsubscribe link, or postal address —
  those are appended automatically by the sending system.`;

  const user = `Write a cold outreach email to this business:
- Name: ${input.businessName}
- Category: ${input.category}
- Area: ${input.area}

They do not currently have a website. Offer to build one, briefly explain the value
(more customers finding them online), and ask if they're open to a short chat.`;

  return { system, user };
}
