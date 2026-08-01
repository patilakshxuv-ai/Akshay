import { supabase } from "../config/supabase";
import { EventType, LeadEvent } from "../types";

export async function logEvent(params: {
  leadId?: string | null;
  type: EventType;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("events").insert({
    lead_id: params.leadId ?? null,
    type: params.type,
    detail: params.detail ?? {},
  });

  if (error) {
    // Events are best-effort telemetry — never let a logging failure break
    // the calling business logic. Log to console for observability instead.
    // eslint-disable-next-line no-console
    console.error(`logEvent failed (type=${params.type}):`, error.message);
  }
}

export async function getRecentEvents(limit = 50): Promise<LeadEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentEvents failed: ${error.message}`);
  return (data ?? []) as LeadEvent[];
}
