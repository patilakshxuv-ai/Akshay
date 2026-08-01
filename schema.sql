-- =============================================================================
-- LeadFinder AI — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) once per project.
-- =============================================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------- enums ----------
do $$ begin
  create type lead_status as enum (
    'new', 'pitched', 'replied', 'interested', 'meeting', 'closed', 'unsubscribed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_channel as enum ('email', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum (
    'lead_discovered', 'email_sent', 'email_delivered', 'email_bounced',
    'reply_received', 'classified', 'status_changed', 'unsubscribed',
    'suppressed_skip', 'rate_limit_hit', 'error'
  );
exception when duplicate_object then null; end $$;

-- ---------- leads ----------
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  place_id      text unique,                 -- Google Places place_id, used for dedupe
  name          text not null,
  area          text not null,
  category      text not null,
  phone         text,
  email         text,
  address       text,
  has_website   boolean not null default false,
  status        lead_status not null default 'new',
  source        text not null default 'google_places',
  unsubscribe_token uuid not null default gen_random_uuid(), -- used to build unsubscribe links
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_created_at on leads(created_at desc);
create unique index if not exists idx_leads_unsub_token on leads(unsubscribe_token);

-- ---------- messages ----------
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  direction   message_direction not null,
  channel     message_channel not null default 'email',
  subject     text,
  body        text not null,
  provider_message_id text,      -- Resend email id, for tracing
  sent_at     timestamptz not null default now()
);

create index if not exists idx_messages_lead_id on messages(lead_id);
create index if not exists idx_messages_sent_at on messages(sent_at desc);

-- ---------- events (activity feed) ----------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  type        event_type not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_events_created_at on events(created_at desc);
create index if not exists idx_events_lead_id on events(lead_id);

-- ---------- suppression list (compliance: never contact again) ----------
create table if not exists suppression_list (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  phone       text unique,
  reason      text not null default 'unsubscribe', -- unsubscribe | bounce | manual | complaint
  created_at  timestamptz not null default now()
);

create index if not exists idx_suppression_email on suppression_list(email);
create index if not exists idx_suppression_phone on suppression_list(phone);

-- ---------- send log (compliance: daily rate cap accounting) ----------
create table if not exists send_log (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete set null,
  sent_at     timestamptz not null default now()
);

create index if not exists idx_send_log_sent_at on send_log(sent_at desc);

-- ---------- simple "deals" tracking for KPI revenue (optional, manual updates) ----------
create table if not exists deals (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete set null,
  amount_cents bigint not null default 0,
  closed_at   timestamptz not null default now()
);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
-- The backend talks to Supabase using the SERVICE ROLE key, which bypasses RLS,
-- so these policies mainly protect against an anon/public key ever being used
-- against this project by mistake.
alter table leads enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table suppression_list enable row level security;
alter table send_log enable row level security;
alter table deals enable row level security;

-- No policies are created for the anon role -> anon has zero access by default.
