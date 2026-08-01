import { supabase } from "../config/supabase";

/**
 * Adds an email (and/or phone) to the permanent suppression list.
 * Idempotent — safe to call multiple times for the same contact.
 */
export async function addToSuppressionList(params: {
  email?: string | null;
  phone?: string | null;
  reason?: string;
}): Promise<void> {
  if (!params.email && !params.phone) return;

  const { error } = await supabase.from("suppression_list").upsert(
    {
      email: params.email ?? null,
      phone: params.phone ?? null,
      reason: params.reason ?? "unsubscribe",
    },
    { onConflict: params.email ? "email" : "phone" }
  );

  if (error) throw new Error(`addToSuppressionList failed: ${error.message}`);
}

/** Checks BOTH email and phone — a lead is suppressed if either is on the list. */
export async function isSuppressed(params: { email?: string | null; phone?: string | null }): Promise<boolean> {
  if (params.email) {
    const { data } = await supabase
      .from("suppression_list")
      .select("id")
      .eq("email", params.email)
      .maybeSingle();
    if (data) return true;
  }
  if (params.phone) {
    const { data } = await supabase
      .from("suppression_list")
      .select("id")
      .eq("phone", params.phone)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}
