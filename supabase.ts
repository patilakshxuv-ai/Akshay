import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * This bypasses Row Level Security, which is expected — this client only
 * ever runs inside our trusted backend (cron jobs + REST API), never in a browser.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
