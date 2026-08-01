import { supabase } from "../config/supabase";
import { env } from "../config/env";

/** Returns how many outbound sends have logged in the last rolling 24 hours. */
export async function getSendsInLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("send_log")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", since);

  if (error) throw new Error(`Failed to read send_log: ${error.message}`);
  return count ?? 0;
}

/** True if sending one more email would stay within DAILY_SEND_CAP. */
export async function canSendMore(): Promise<boolean> {
  const sent = await getSendsInLast24h();
  return sent < env.DAILY_SEND_CAP;
}

/** Records that an email was sent, for rate-cap accounting. */
export async function recordSend(leadId: string): Promise<void> {
  const { error } = await supabase.from("send_log").insert({ lead_id: leadId });
  if (error) throw new Error(`Failed to record send: ${error.message}`);
}

/**
 * Sleeps a randomized duration between SEND_DELAY_MIN_SECONDS and
 * SEND_DELAY_MAX_SECONDS, so outbound emails within a batch don't fire in an
 * obviously robotic, fixed-interval pattern.
 */
export async function randomizedDelay(): Promise<void> {
  const minMs = env.SEND_DELAY_MIN_SECONDS * 1000;
  const maxMs = env.SEND_DELAY_MAX_SECONDS * 1000;
  const delay = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
  await new Promise((resolve) => setTimeout(resolve, delay));
}
