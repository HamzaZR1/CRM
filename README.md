# ZCRM — COD System

**Your own CRM for cash-on-delivery e-commerce.** Own server · your domain · no monthly subscription.

ZCRM imports orders from your stores, distributes them to your confirmation team, confirms them by phone **or** fully automatically via WhatsApp + an AI agent, ships them to your delivery companies in one click, and tells you your real net profit per product.

## Features (the 10-step flow)

| # | Feature | Where |
|---|---------|-------|
| 1 | **Automatic order import** — YouCan, Shopify, WooCommerce (WordPress) and any custom source via webhook, with duplicate protection and HMAC verification | `Integrations` |
| 2 | **Smart distribution** — by percentage (e.g. 20/30/50 %, exact weighted fair split) or by product (specialists), or manual; live per-agent confirmation & delivery stats | `Automation & AI` · `Team` |
| 3 | **Team or Automation mode** — confirmers work from a focused call queue with a script, *or* WhatsApp sends the order with ✅ Confirm / 📅 Postpone / ❌ Cancel buttons, with automatic follow-ups after N hours and hand-over to the team when nobody answers | `Call queue` · `WhatsApp inbox` |
| 4 | **AI agent** (Claude) — replies in Darija/Arabic/French, understands voice notes (with an STT endpoint), answers product questions from your product notes, makes your approved retention offer (−X %, free delivery), updates addresses, postpones and confirms. Every decision is validated against your limits in code | `Automation & AI` |
| 5 | **One-click shipping** — Ozon Express, Sendit, Cathedis, Ameex, Speedaf, Digylog, Vitex, O Livraison, Oscario (add your own); automatic status sync + carrier webhooks; return fees tracked | `Shipping` |
| 6 | **WhatsApp campaigns** — segment past customers (delivered, city, product bought, inactivity), preview audience, send; a “🛒 I want to order” tap creates an attributed order | `Campaigns` |
| 7 | **Net profit** — revenue − product cost − ads − team commissions − delivery & returns | `Net profit` |
| 8 | **Product intelligence** — confirmation & delivery rate, CPL, CPD, break-even CPL, upsell rate, ROI, profit/piece, and a **Scale / Optimize / Stop** verdict | `Products` |
| 9 | **Stock** — per variant: delivered / in transit / returns / available, low-stock alerts, stock value; moves automatically on ship/return | `Stock` |
| 10 | **Delivery analytics** — delivery rate by city, carrier and product; full dashboard with team performance and top products | `Dashboard` · `Reports` |

Also: roles (Admin / Manager / Agent, agents only see their orders), commissions per confirmed/delivered order, customer blacklist & marketing opt-out, order timeline, EN/FR/AR (RTL) navigation, public landing page.

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run setup
```

```bash
npm run dev
```

Open http://localhost:3000 → **Sign in** with `admin@zcrm.ma` / `admin123` (agent: `sara@zcrm.ma` / `agent123`). `npm run setup` creates the SQLite database and loads ~30 days of realistic demo data.

Try the automation without any account: open an order → use the **customer simulator** under the WhatsApp conversation (tap buttons, type “غالية شوية”, send a “voice note”), or click **Simulate import** on the Orders page.

## Going live

| What | How |
|------|-----|
| **Stores** | `Integrations → Connect a store`, then paste the webhook URL in YouCan / Shopify / WooCommerce. Add the signing secret to verify HMAC. |
| **WhatsApp** | Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`. Point the Meta webhook to `/api/webhooks/whatsapp` (verify token `WHATSAPP_VERIFY_TOKEN`). The first message to a customer is business-initiated, so Meta requires an approved template: set `WHATSAPP_CONFIRM_TEMPLATE` (5 body variables: name, store, city, products, total + quick-reply buttons with payloads `confirm`, `postpone`, `cancel`). |
| **AI agent** | Set `ANTHROPIC_API_KEY` (model `ZCRM_AI_MODEL`, default `claude-opus-5-5`). Without a key a built-in rule-based agent is used. |
| **Voice notes** | Set `ZCRM_STT_URL` to any Whisper-compatible endpoint (multipart `file` → `{ "text": "…" }`). |
| **Carriers** | `Shipping → Configure`: *Simulator* (demo) or *HTTP API* — ZCRM calls `POST {apiUrl}/shipments` and `GET {apiUrl}/shipments/{tracking}` with a Bearer key. Carriers can push statuses to `/api/webhooks/carriers/{code}`. Each Moroccan carrier has its own API, so map it in the HTTP adapter (`src/lib/services/carriers.ts`) or put a small proxy in front. |
| **Scheduler** | Runs every minute inside `next start` (follow-ups, postponed orders, parcel sync). On serverless, call `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` and set `ZCRM_DISABLE_SCHEDULER=1`. |
| **Database** | Local SQLite file by default. For the cloud, use Turso: `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN`. |

### Docker

```bash
docker compose up -d --build
```

```bash
docker compose exec zcrm npm run db:seed
```

The second command loads demo data. For a clean install, skip it and create your admin instead:

```bash
docker compose exec zcrm npm run admin:create -- you@company.ma "StrongPassword" "Your Name"
```

Production requires `AUTH_SECRET` and `CRON_SECRET`.

## Architecture

- **Next.js 15** (App Router, Server Components, Server Actions) + **TypeScript** + **Tailwind CSS v4**
- **Drizzle ORM** on **libSQL/SQLite** (Turso-ready) — schema in `src/lib/db/schema.ts`
- **Claude** via `@anthropic-ai/sdk` with structured JSON output (`src/lib/services/ai-agent.ts`)
- JWT session cookies (`jose`), bcrypt passwords, role-based access in every action
- Recharts for charts, lucide icons

```
src/lib/services/
  orders.ts        order creation, status machine, stock moves, offers
  assignment.ts    weighted-fair / by-product distribution
  confirmation.ts  WhatsApp confirmation, inbound handling, AI turns, follow-ups
  ai-agent.ts      Claude decision + policy enforcement + rule-based fallback
  whatsapp.ts      Meta Cloud API transport / simulator, webhook parsing, voice notes
  carriers.ts      carrier adapters, shipping, status mapping & sync
  campaigns.ts     segments, sending, campaign → order
  analytics.ts     KPIs, profit, product intelligence, delivery breakdowns
  integrations.ts  YouCan / Shopify / WooCommerce / API normalisers + HMAC
```

## Tests

With the dev server running on seeded data:

```bash
ZCRM_URL=http://localhost:3000 npm run test:smoke
```

It exercises the real webhooks (all platforms, duplicates, bad keys), WhatsApp button and free-text replies through the AI agent, postponement, shipping, carrier sync & webhook, stock movements and campaign-to-order attribution. It writes test orders, so re-run `npm run db:seed` afterwards for a clean demo.
