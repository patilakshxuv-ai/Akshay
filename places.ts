import { env } from "../config/env";
import { GooglePlaceDetails, GooglePlaceSummary } from "../types";

const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Text Search for "<category> in <area>". Google returns up to 20 results per
 * page (3 pages max / ~60 results) — for a daily job that's plenty per target.
 */
export async function searchPlaces(category: string, area: string): Promise<GooglePlaceSummary[]> {
  const results: GooglePlaceSummary[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(TEXT_SEARCH_URL);
    url.searchParams.set("query", `${category} in ${area}`);
    url.searchParams.set("key", env.GOOGLE_PLACES_API_KEY);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status: string;
      results: { place_id: string; name: string }[];
      next_page_token?: string;
      error_message?: string;
    };

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Places Text Search failed: ${data.status} ${data.error_message ?? ""}`);
    }

    for (const r of data.results ?? []) {
      results.push({ place_id: r.place_id, name: r.name });
    }

    pageToken = data.next_page_token;
    // Google requires a short delay before a next_page_token becomes valid.
    if (pageToken) await sleep(2000);
  } while (pageToken);

  return results;
}

/**
 * Fetches details for a single place, requesting only the fields we need
 * (keeps Places Details billing to the "Basic" + a couple "Contact" fields).
 *
 * IMPORTANT LIMITATION: Google Places does not expose a business email
 * address field at all — Places only ever returns phone/website/address.
 * Businesses with no website (our exact target segment) therefore very
 * often have no publicly machine-readable email through this API. We store
 * `email: null` in that case rather than fabricate one; the outreach job
 * requires phone to be present as the minimum contactable channel, and
 * email remains an optional enrichment field for future data sources
 * (e.g. a manual CSV import or a compliant business-directory API).
 */
export async function getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
  const url = new URL(DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    ["place_id", "name", "formatted_address", "formatted_phone_number", "international_phone_number", "website"].join(",")
  );
  url.searchParams.set("key", env.GOOGLE_PLACES_API_KEY);

  const res = await fetch(url.toString());
  const data = (await res.json()) as { status: string; result: GooglePlaceDetails; error_message?: string };

  if (data.status !== "OK") {
    throw new Error(`Places Details failed for ${placeId}: ${data.status} ${data.error_message ?? ""}`);
  }

  return data.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
