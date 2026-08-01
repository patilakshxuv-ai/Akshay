export interface ClassifierInput {
  businessName: string;
  originalOutreachBody: string;
  replyBody: string;
}

/**
 * Builds the prompt used to classify an inbound email reply into a small
 * fixed set of intents, plus a suggested draft reply for the human to review.
 */
export function buildClassifierPrompt(input: ClassifierInput): { system: string; user: string } {
  const system = `You classify inbound replies to cold outreach emails for a web design agency.

Output ONLY a JSON object, no markdown fences, no commentary, in this exact shape:
{
  "intent": "interested" | "not_interested" | "question" | "meeting_request" | "unsubscribe" | "auto_reply" | "other",
  "suggested_reply": "a short, friendly draft reply (under 80 words), or empty string if intent is unsubscribe",
  "confidence": 0.0 to 1.0
}

Classification guidance:
- "unsubscribe": ANY indication they want no further contact — "stop", "remove me",
  "not interested, please stop emailing", "unsubscribe", hostility asking to stop, etc.
  When in doubt between unsubscribe and not_interested, prefer "unsubscribe" — it is
  always safe to stop contacting someone who might want that.
- "auto_reply": out-of-office / vacation autoresponders, mailer-daemon bounces.
- "meeting_request": they want to schedule a call/meeting.
- "interested": positive engagement, asking to learn more, asking for pricing, etc.
- "not_interested": polite decline, no request to stop future unrelated contact.
- "question": they asked something without clear positive/negative signal.
- "other": anything that doesn't fit cleanly above.

Never invent facts about the agency's pricing, availability, or portfolio in suggested_reply.
Keep suggested_reply generic enough for a human to personalize before sending — it is a
DRAFT for human review, never sent automatically.`;

  const user = `Business: ${input.businessName}

Original outreach email we sent:
"""
${input.originalOutreachBody}
"""

Their reply:
"""
${input.replyBody}
"""`;

  return { system, user };
}
