# LeadFinder AI

An autonomous lead-generation and outreach agent for a web-design business.

It finds local businesses with no website via Google Places, drafts short
personalized cold emails with Claude, sends them via Resend, classifies
replies with Claude, and exposes a REST API for a dashboard. Compliance
(unsubscribe, suppression list, rate limits, randomized pacing, one message
per lead) is built into the core send path, not bolted on.

---

## 1. Prerequisites

- Node.js 18.17+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key
- A [Google Cloud](https://console.cloud.google.com) project with the
  **Places API** enabled and billing set up
- A [Resend](https://resend.com) account with:
  - A verified sending domain
  - **Inbound email** configured for reply handling (Resend → Domains →
    your domain → Inbound; you'll get an MX record to add)

---

## 2. Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor and run the full contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates:
   - `leads`, `messages`, `events`
   - `suppression_list` (permanent do-not-contact list)
   - `send_log` (rolling 24h rate-cap accounting)
   - `deals` (optional, for the revenue KPI — insert rows manually or wire
     up your own "mark as closed-won" flow)
3. Copy your **Project URL** and **service_role key** (Settings → API) into
   `.env` — never the `anon` key, since the backend needs to bypass RLS.

---

## 3. Environment variables

```bash
cp .env.example .env
```

Fill in every value in `.env`. See inline comments in `.env.example` for
what each key is for. Key ones to get right:

- `DISCOVERY_TARGETS` — comma-separated `category|area` pairs, e.g.
  `plumber|Austin TX,electrician|Austin TX`
- `DAILY_SEND_CAP` — hard ceiling on outbound emails per rolling 24h
- `RESEND_WEBHOOK_SECRET` — from Resend's webhook settings, used to verify
  inbound webhook signatures (Svix format)
- `COMPLIANCE_POSTAL_ADDRESS` — a real physical address, legally required
  in commercial email (CAN-SPAM) and automatically appended to every send

---

## 4. Install & run

```bash
npm install
npm run dev      # local dev, auto-reload
# or
npm run build && npm start   # production
```

The server starts on `PORT` (default `8080`) and immediately schedules two
cron jobs (see `src/cron/scheduler.ts`):

- **Lead discovery** — daily at 06:00 UTC
- **Outreach sending** — hourly at minute :15

Adjust the cron expressions if you want business-hours-only sending, a
different timezone, etc.

> Serverless note: if you deploy to a platform without long-running
> processes (e.g. Vercel functions), swap `node-cron` for that platform's
> native scheduled functions / cron triggers and call
> `runDiscoverLeadsJob()` / `runSendOutreachJob()` directly instead.

---

## 5. Connect Resend's inbound webhook

1. In Resend, go to **Webhooks** → **Add endpoint**.
2. URL: `https://your-backend.example.com/api/webhooks/resend-inbound`
3. Subscribe to inbound email events.
4. Copy the **signing secret** into `RESEND_WEBHOOK_SECRET`.

The unsubscribe link embedded in every email
(`{APP_BASE_URL}/api/unsubscribe/:token`) is public and requires no auth —
it must work from a click inside an email client. It's honored
synchronously: the lead is added to `suppression_list` and marked
`unsubscribed` before the confirmation page is even returned.

---

## 6. REST API (for the dashboard)

All routes except the webhook and unsubscribe link require header:
`x-api-key: <DASHBOARD_API_KEY>`

| Method | Path                        | Description                                   |
|--------|-----------------------------|------------------------------------------------|
| GET    | `/api/kpis`                 | `{ revenue, leads_found, deals_closed, reply_rate }` |
| GET    | `/api/pipeline`             | `{ hot: [...], warm: [...], cold: [...] }` leads |
| GET    | `/api/conversations`        | List of message threads, most recent first    |
| GET    | `/api/conversations/:leadId`| Full thread (lead + all messages) for one lead |
| GET    | `/api/activity?limit=50`    | Recent events, for a live activity feed        |

Point your existing LeadFinder dashboard's API base URL at this backend and
set the `x-api-key` header to `DASHBOARD_API_KEY`.

---

## 7. How each feature works

### Lead discovery (`src/jobs/discoverLeads.ts`)
For each `category|area` in `DISCOVERY_TARGETS`: Places **Text Search** →
Places **Details** per result → insert only if `website` is empty AND at
least one public contact channel exists. Deduped by `place_id` (unique DB
constraint + in-memory pass).

> **Known data limitation:** Google Places has no email field at all — it
> only ever returns phone/website/address. Businesses with no website (our
> exact target segment) very often have no public email discoverable this
> way. The job stores `phone` from Places and leaves `email: null` unless
> you wire in an additional enrichment source (manual CSV import, a
> compliant business-directory API, etc.) before `insertQualifiedLead` is
> called. The outreach job only sends to leads that have an `email` — leads
> with phone only will accumulate in `new` status until email enrichment or
> a future SMS/call channel is added; they are never silently emailed via a
> guessed address.

### Outreach (`src/jobs/sendOutreach.ts`)
Pulls `status = new` leads with an email → Claude (`CLAUDE_WRITER_MODEL`)
drafts a short, non-pushy email → sent via Resend with a compliance footer
(postal address + unsubscribe link + `List-Unsubscribe` header) appended in
code → message saved → status set to `pitched`. Before every single send:
suppression list check, rolling-24h cap check (`DAILY_SEND_CAP`), and a
randomized delay (`SEND_DELAY_MIN_SECONDS`–`SEND_DELAY_MAX_SECONDS`)
afterward. A lead only ever gets one outbound message from this job.

### Reply handling (`src/routes/webhooks.ts`)
Resend inbound webhook → signature verified (Svix HMAC) → lead matched by
sender email → reply saved as a message → Claude
(`CLAUDE_CLASSIFIER_MODEL`) classifies intent + drafts a suggested reply →
status updated (`replied` / `interested` / `meeting`, or `unsubscribed`).
On `unsubscribe` intent, the lead is added to `suppression_list`
permanently and will never be contacted again, on any channel.

### Compliance summary
- Unsubscribe link + `List-Unsubscribe` header in every email
- One-click unsubscribe honored synchronously, no confirmation step
- Suppression list checked immediately before every send (not just once)
- Hard daily send cap, enforced per-send, not just per-batch
- Randomized delay between sends
- Exactly one outbound message per lead unless they reply first
- Only businesses' own publicly listed phone/email are contacted — no
  scraping of personal data or unlisted contacts

---

## 8. Project structure

```
leadfinder-ai/
├── supabase/
│   └── schema.sql
├── src/
│   ├── config/          env validation, Supabase client
│   ├── lib/              Claude, Places, Resend, rate-limiter wrappers
│   ├── prompts/          outreach + classifier prompt builders
│   ├── services/         DB access: leads, messages, events, suppression
│   ├── jobs/              discoverLeads.ts, sendOutreach.ts
│   ├── cron/              node-cron schedule registration
│   ├── routes/            kpis, pipeline, conversations, activity, webhooks
│   ├── middleware/        API key auth, async error handling
│   ├── types/             shared TS types matching the DB schema
│   └── index.ts           Express app entrypoint
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 9. Extending

- **Deals/revenue**: `deals` table is intentionally simple — wire up your
  own "mark closed-won" action (dashboard button → a new `POST
  /api/deals` route) to populate it; not included here since deal terms
  are business-specific.
- **SMS channel**: add a `channel = 'sms'` sender in `src/lib/`, mirror the
  suppression + rate-limit checks from `sendOutreach.ts`.
- **Multi-tenant**: add an `org_id` column across tables + scope every
  query if you ever run this for more than one agency.
