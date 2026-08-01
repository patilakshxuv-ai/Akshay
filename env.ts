import "dotenv/config";
import { z } from "zod";

/**
 * All environment variables are validated once at startup. If anything is
 * missing/malformed the process exits immediately with a clear error,
 * instead of failing confusingly later inside a cron job at 3am.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_BASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default(""),
  DASHBOARD_API_KEY: z.string().min(16, "DASHBOARD_API_KEY should be a long random string"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_WRITER_MODEL: z.string().default("claude-opus-5"),
  CLAUDE_CLASSIFIER_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  GOOGLE_PLACES_API_KEY: z.string().min(1),
  DISCOVERY_TARGETS: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  RESEND_REPLY_TO: z.string().email(),
  RESEND_WEBHOOK_SECRET: z.string().min(1),

  SENDER_NAME: z.string().min(1),
  AGENCY_NAME: z.string().min(1),
  AGENCY_URL: z.string().url(),

  DAILY_SEND_CAP: z.coerce.number().int().positive().default(40),
  SEND_DELAY_MIN_SECONDS: z.coerce.number().int().nonnegative().default(20),
  SEND_DELAY_MAX_SECONDS: z.coerce.number().int().nonnegative().default(180),
  COMPLIANCE_POSTAL_ADDRESS: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

/** Parses "category|area,category|area" into structured discovery targets. */
export function parseDiscoveryTargets(): { category: string; area: string }[] {
  return env.DISCOVERY_TARGETS.split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [category, area] = pair.split("|").map((s) => s.trim());
      return { category, area };
    });
}
