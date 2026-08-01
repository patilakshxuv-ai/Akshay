import { Router } from "express";
import { supabase } from "../config/supabase";
import { asyncHandler } from "../middleware/errorHandler";
import { Lead, Message } from "../types";

export const conversationsRouter = Router();

/**
 * GET /api/conversations
 * Returns one "thread" per lead that has at least one message, most
 * recently active first — powers the Outreach screen's inbox-style view.
 *
 * GET /api/conversations/:leadId
 * Returns the full message thread for a single lead.
 */
conversationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    // Leads that have messages, newest message activity first.
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("*")
      .neq("status", "new") // "new" leads have no messages yet by definition
      .order("updated_at", { ascending: false })
      .limit(200);

    if (leadsErr) throw new Error(leadsErr.message);

    const leadList = (leads ?? []) as Lead[];
    const leadIds = leadList.map((l) => l.id);

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("*")
      .in("lead_id", leadIds.length > 0 ? leadIds : ["00000000-0000-0000-0000-000000000000"])
      .order("sent_at", { ascending: true });

    if (msgErr) throw new Error(msgErr.message);

    const messagesByLead = new Map<string, Message[]>();
    for (const m of (messages ?? []) as Message[]) {
      const list = messagesByLead.get(m.lead_id) ?? [];
      list.push(m);
      messagesByLead.set(m.lead_id, list);
    }

    const threads = leadList
      .map((lead) => {
        const msgs = messagesByLead.get(lead.id) ?? [];
        return {
          lead,
          last_message: msgs[msgs.length - 1] ?? null,
          message_count: msgs.length,
        };
      })
      .filter((t) => t.message_count > 0);

    res.json({ threads });
  })
);

conversationsRouter.get(
  "/:leadId",
  asyncHandler(async (req, res) => {
    const { leadId } = req.params;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr) throw new Error(leadErr.message);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true });

    if (msgErr) throw new Error(msgErr.message);

    res.json({ lead, messages: messages ?? [] });
  })
);
