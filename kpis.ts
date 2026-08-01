import { Router } from "express";
import { supabase } from "../config/supabase";
import { asyncHandler } from "../middleware/errorHandler";

export const kpisRouter = Router();

/**
 * GET /api/kpis
 * Returns headline dashboard numbers: total revenue from closed deals,
 * total leads found, deals closed, and reply rate (replied+ / pitched+).
 */
kpisRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [{ count: leadsFound }, { count: dealsClosed }, { data: deals }, { count: pitchedCount }, { count: repliedCount }] =
      await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("amount_cents"),
        supabase.from("leads").select("id", { count: "exact", head: true }).in("status", [
          "pitched",
          "replied",
          "interested",
          "meeting",
          "closed",
        ]),
        supabase.from("leads").select("id", { count: "exact", head: true }).in("status", [
          "replied",
          "interested",
          "meeting",
          "closed",
        ]),
      ]);

    const revenueCents = (deals ?? []).reduce((sum, d) => sum + (d.amount_cents ?? 0), 0);
    const replyRate = pitchedCount && pitchedCount > 0 ? (repliedCount ?? 0) / pitchedCount : 0;

    res.json({
      revenue: revenueCents / 100,
      leads_found: leadsFound ?? 0,
      deals_closed: dealsClosed ?? 0,
      reply_rate: Number(replyRate.toFixed(3)),
    });
  })
);
