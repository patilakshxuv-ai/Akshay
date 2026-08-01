import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { buildOutreachPrompt, OutreachInput } from "../prompts/outreach";
import { buildClassifierPrompt, ClassifierInput } from "../prompts/classifier";
import { ClassificationResult } from "../types";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * Generates a short, personalized outreach email using the higher-quality
 * "writer" model. Returns structured {subject, body} by asking the model
 * for a strict JSON object and validating it before use.
 */
export async function generateOutreachEmail(
  input: OutreachInput
): Promise<{ subject: string; body: string }> {
  const prompt = buildOutreachPrompt(input);

  const response = await anthropic.messages.create({
    model: env.CLAUDE_WRITER_MODEL,
    max_tokens: 700,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = safeParseJson<{ subject: string; body: string }>(text);
  if (!parsed || !parsed.subject || !parsed.body) {
    throw new Error(`Claude outreach response was not valid JSON: ${text.slice(0, 300)}`);
  }
  return parsed;
}

/**
 * Classifies an inbound reply using a small/cheap model. Always returns a
 * conservative fallback ("other", low confidence) if parsing fails, so a
 * malformed model response never crashes the webhook or mis-fires an
 * unsubscribe/interested transition.
 */
export async function classifyReply(input: ClassifierInput): Promise<ClassificationResult> {
  const prompt = buildClassifierPrompt(input);

  const response = await anthropic.messages.create({
    model: env.CLAUDE_CLASSIFIER_MODEL,
    max_tokens: 400,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = safeParseJson<ClassificationResult>(text);
  if (!parsed || !parsed.intent) {
    return {
      intent: "other",
      suggested_reply:
        "Thanks for your reply — a member of our team will follow up with you shortly.",
      confidence: 0,
    };
  }
  return parsed;
}

function safeParseJson<T>(text: string): T | null {
  // Models occasionally wrap JSON in markdown fences despite instructions; strip them.
  const cleaned = text.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
