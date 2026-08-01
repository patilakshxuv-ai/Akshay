import { parseDiscoveryTargets } from "../config/env";
import { searchPlaces, getPlaceDetails } from "../lib/places";
import { insertQualifiedLead } from "../services/leadsService";
import { logEvent } from "../services/eventsService";

/**
 * Daily job: for each configured {category, area} pair, run a Places Text
 * Search, fetch Details for each result, and insert only leads that have
 * NO website and at least one public contact channel. Dedupes by place_id
 * (both via an in-memory pass and a DB unique constraint as a safety net).
 */
export async function runDiscoverLeadsJob(): Promise<{ inserted: number; scanned: number }> {
  const targets = parseDiscoveryTargets();
  let scanned = 0;
  let inserted = 0;

  for (const target of targets) {
    try {
      const summaries = await searchPlaces(target.category, target.area);
      scanned += summaries.length;

      // De-dupe within this run in case a business appears in multiple result pages.
      const seen = new Set<string>();

      for (const summary of summaries) {
        if (seen.has(summary.place_id)) continue;
        seen.add(summary.place_id);

        try {
          const details = await getPlaceDetails(summary.place_id);
          const lead = await insertQualifiedLead({
            details,
            category: target.category,
            area: target.area,
          });

          if (lead) {
            inserted += 1;
            await logEvent({
              leadId: lead.id,
              type: "lead_discovered",
              detail: { name: lead.name, category: target.category, area: target.area },
            });
          }
        } catch (err) {
          await logEvent({
            type: "error",
            detail: { stage: "place_details", place_id: summary.place_id, message: String(err) },
          });
        }
      }
    } catch (err) {
      await logEvent({
        type: "error",
        detail: { stage: "text_search", category: target.category, area: target.area, message: String(err) },
      });
    }
  }

  return { inserted, scanned };
}
