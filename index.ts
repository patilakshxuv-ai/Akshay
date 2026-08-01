export type LeadStatus =
  | "new"
  | "pitched"
  | "replied"
  | "interested"
  | "meeting"
  | "closed"
  | "unsubscribed";

export interface Lead {
  id: string;
  place_id: string | null;
  name: string;
  area: string;
  category: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  has_website: boolean;
  status: LeadStatus;
  source: string;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = "outbound" | "inbound";
export type MessageChannel = "email" | "sms";

export interface Message {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  provider_message_id: string | null;
  sent_at: string;
}

export type EventType =
  | "lead_discovered"
  | "email_sent"
  | "email_delivered"
  | "email_bounced"
  | "reply_received"
  | "classified"
  | "status_changed"
  | "unsubscribed"
  | "suppressed_skip"
  | "rate_limit_hit"
  | "error";

export interface LeadEvent {
  id: string;
  lead_id: string | null;
  type: EventType;
  detail: Record<string, unknown>;
  created_at: string;
}

/** Output contract for the reply-classification model. */
export interface ClassificationResult {
  intent:
    | "interested"
    | "not_interested"
    | "question"
    | "meeting_request"
    | "unsubscribe"
    | "auto_reply"
    | "other";
  suggested_reply: string;
  confidence: number; // 0-1
}

export interface GooglePlaceSummary {
  place_id: string;
  name: string;
}

export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  // NOTE: Google Places does NOT return a business email address — see
  // src/lib/places.ts for how we handle that gap.
}
