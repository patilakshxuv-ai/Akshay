import { supabase } from "../config/supabase";
import { Message, MessageDirection } from "../types";

export async function saveMessage(params: {
  leadId: string;
  direction: MessageDirection;
  subject: string | null;
  body: string;
  providerMessageId?: string | null;
}): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      lead_id: params.leadId,
      direction: params.direction,
      channel: "email",
      subject: params.subject,
      body: params.body,
      provider_message_id: params.providerMessageId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`saveMessage failed: ${error.message}`);
  return data as Message;
}

export async function getMessagesForLead(leadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (error) throw new Error(`getMessagesForLead failed: ${error.message}`);
  return (data ?? []) as Message[];
}

export async function getLastOutboundMessage(leadId: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLastOutboundMessage failed: ${error.message}`);
  return data as Message | null;
}

/** Used by the outreach job to enforce "one message per lead unless they reply". */
export async function hasAnyOutboundMessage(leadId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "outbound");

  if (error) throw new Error(`hasAnyOutboundMessage failed: ${error.message}`);
  return (count ?? 0) > 0;
}
