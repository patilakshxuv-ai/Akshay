import { Router } from "express";
import { supabase } from "../config/supabase";
import { asyncHandler } from "../middleware/errorHandler";
import { Lead } from "../types";

export const pipelineRouter = Router();

/**
 * GET /api/pipeline
 * Buckets active (non-closed, non-unsubscribed) leads into hot/warm/cold
 * so the dashboard can render a simple pipeline view.
 *
 * hot  = interested | meeting
 * warm = replied
 * cold = new | pitched
 */
pipelineRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .not("status", "in", "(closed,unsubscribed)")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    const leads = (data ?? []) as Lead[];
    const bucket = { hot: [] as Lead[], warm: [] as Lead[], cold: [] as Lead[] };

    for (const lead of leads) {
      if (lead.status === "interested" || lead.status === "meeting") bucket.hot.push(lead);
      else if (lead.status === "replied") bucket.warm.push(lead);
      else bucket.cold.push(lead); // new | pitched
    }

    res.json(bucket);
  })
);
