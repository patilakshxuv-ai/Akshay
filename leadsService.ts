import { supabase } from "../config/supabase";
import { Lead, LeadStatus } from "../types";
import { GooglePlaceDetails } from "../types";

/** Returns true if a lead with this place_id already exists (dedupe guard). */
export async function leadExistsByPlaceId(placeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("place_id", placeId)
    .maybeSingle();

  if (error) throw new Error(`leadExistsByPlaceId failed: ${error.message}`);
  return data !== null;
}

/**
 * Inserts a new lead ONLY if it passes the qualification rule:
 * no website AND at least one public contact channel (phone or email).
 * Returns the inserted lead, or null if it was disqualified/duplicate.
 */
export async function insertQualifiedLead(params: {
  details: GooglePlaceDetails;
  category: string;
  area: string;
}): Promise<Lead | null> {
  const { details, category, area } = params;

  const hasWebsite = Boolean(details.website && details.website.trim().length > 0);
  const phone = details.formatted_phone_number ?? details.international_phone_number ?? null;
  // See src/lib/places.ts — Google Places has no email field. Left null unless
  // a future enrichment source populates it before this function is called.
  const email: string | null = null;

  const isQualified = !hasWebsite && (phone !== null || email !== null);
  if (!isQualified) return null;

  if (await leadExistsByPlaceId(details.place_id)) return null;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      place_id: details.place_id,
      name: details.name,
      area,
      category,
      phone,
      email,
      address: details.formatted_address ?? null,
      has_website: hasWebsite,
      status: "new",
      source: "google_places",
    })
    .select()
    .single();

  if (error) {
    // Unique constraint race (two workers inserting the same place_id) is fine to swallow.
    if (error.code === "23505") return null;
    throw new Error(`insertQualifiedLead failed: ${error.message}`);
  }

  return data as Lead;
}

export async function getNewLeads(limit: number): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`getNewLeads failed: ${error.message}`);
  return (data ?? []) as Lead[];
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(`updateLeadStatus failed: ${error.message}`);
}

export async function getLeadByEmail(email: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLeadByEmail failed: ${error.message}`);
  return data as Lead | null;
}

export async function getLeadByUnsubscribeToken(token: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error) throw new Error(`getLeadByUnsubscribeToken failed: ${error.message}`);
  return data as Lead | null;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getLeadById failed: ${error.message}`);
  return data as Lead | null;
}
