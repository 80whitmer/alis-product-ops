# alis-product-ops

Evidence-driven product/BI decision platform for the ALIS org. Forked from
[alis-hub](../alis-hub) — same HubSpot ingestion and Express/React/SQLite(sql.js)
patterns, aimed at a different audience and decision: not "run this job against ALIS
admin" but **"what should the product/BI/engineering org build next, and why."**

Read [`docs/CONTEXT.md`](docs/CONTEXT.md) first — it has the actual Slack-sourced
evidence for who this is for and what each view needs to do, and
[`docs/FORK_PROMPT.md`](docs/FORK_PROMPT.md) for the original build brief.

## Status (2026-09-24)

Rebranded as **ALIS Product Hub** — real ALIS brand system (Tailwind config, colors,
Lexend Exa, logo, the floating butterfly section-jump nav), ported directly from
alis-hub's own design system.

| View | Status |
|---|---|
| **Dashboard** (`/`) — portfolio-wide accounts, tickets, KPIs, browsable + Excel/PDF export | **Live — this is v1** |
| **Account Truth** (`/accounts`) — Contracted / Enabled / Used, one account at a time | **Live, in nav** |
| Decision Log (`/decisions`) | Live but shelved from nav — reachable directly |
| Request Queue / Pod Capacity / One-Pagers / Finance Reconciliation | Shelved — not started, or blocked on Jira/Atlassian connector access |

### What the Dashboard actually covers today

Not just "accounts + tickets" anymore — the Overview KPI row and section list cover:

- **Portfolio ARR, Accounts, Communities, Capacity**, and **Enhancement Requests**
  (headline figure = tickets staged Top 3 or Long-Term Projects — matches Team AM's
  own definition on alis-hub, not a raw category count) with a Top 3 / Escalations
  breakout.
- **Accounts** — sortable, multiselect Tier + Priority filter pills, company search,
  and an ALIS quick-links menu (🔗) next to every company name (Company Settings, App
  Store, Reports, Imports, Print Center, All Communities, plus ALIS Admin links when
  an Admin Company ID is on file) — no HubSpot link, since the product team doesn't
  have HubSpot seats.
- **Key Contacts**, **Onboarding**, **Portfolio Entitlements** (live ALIS admin
  scrape, on-demand, streamed live via SSE — not part of the regular Refresh), and
  **Portfolio KPIs** (ARR/Companies/Communities by Tier, each with a daily trend).
- **Enhancement Requests, Top 3, Escalations, Tickets by Category/Module** — every
  ticket table shares one component, so sorting, filtering, and search behave
  identically everywhere.

### Caching

`GET /api/export` serves the last successful HubSpot pull instantly from a
server-side cache (survives a server restart — see `server/db/export-cache.json`),
not just a client-side one. Only the explicit **Refresh** button pays the ~15-25s
live HubSpot pull; opening the app or navigating back to it is always instant.

### Exports

Both the **Excel** export (Overview sheet with KPI rollups, tier breakdowns with
color-coded data bars, Top 10 by ARR, ALIS Portal links) and the **PDF** export
(one-page branded portfolio report) reflect exactly what's on screen — no separate
"export data" pipeline to drift out of sync.

Both Data Export and Account Truth pull deal/line-item data that comes back
**scope-blocked** until the shared HubSpot private app token gets the
`crm.objects.line_items.read` and `crm.schemas.line_items.read` scopes added
(alis-hub hit this same wall 2026-09-03). Deal-level info (name, ARR, close date)
already works without it. The ticket side of the Dashboard needs no extra scopes.

## Setup

```bash
npm install
npm run setup:env   # creates server/.env from .env.example — fill in HUBSPOT_PRIVATE_APP_TOKEN
npm run dev         # server on :3100, client on :5174
```

Open [http://localhost:5174](http://localhost:5174). First load does a real
~15-25s HubSpot pull (nothing's cached yet); every load after that is instant,
even across a server restart.

## Project structure

```
alis-product-ops/
├── docs/
│   ├── CONTEXT.md       # who this is for, what they need, view-by-view status
│   └── FORK_PROMPT.md   # original build brief
├── server/
│   ├── index.js
│   ├── db/
│   │   ├── database.js         # sql.js — decisions, ALIS admin ids, company hosts, entitlement snapshots
│   │   └── export-cache.json   # last successful /api/export pull — survives a server restart
│   ├── services/
│   │   ├── hubspotClient.js         # generic bearer-auth-over-https + retry + associations, ported from alis-hub
│   │   ├── hubspotAccounts.js       # portfolio-wide company list (no owner scoping)
│   │   ├── hubspotDeals.js          # deal + line-item pull for Contract Truth
│   │   ├── hubspotRequests.js       # portfolio-wide active-ticket search + company join, for the Dashboard
│   │   ├── alisEntitlements.js / alisCompanyDiscovery.js / portfolioEntitlementsJob.js  # Account Truth's live ALIS admin scrape
│   │   └── dashboardPdf.js          # Playwright page.pdf() — the portfolio PDF export
│   └── api/
│       ├── accounts.js   # Account Truth's routes, incl. the Portfolio Entitlements SSE stream
│       ├── broadcaster.js  # in-process SSE pub/sub, ported from alis-hub
│       ├── decisions.js
│       └── export.js     # GET /api/export (cached) + POST /pdf — what Dashboard.jsx and both exports read
└── client/
    ├── public/                # ALIS brand assets (logo-horizontal.png, butterfly-icon.png)
    ├── tailwind.config.js     # same brand tokens as alis-hub's client/tailwind.config.js
    └── src/
        ├── App.jsx            # branded top navbar (logo links back to Dashboard) + router
        ├── DataCache.jsx      # cross-page data cache — one shared fetch for Dashboard + Account Truth
        ├── pages/
        │   ├── Dashboard.jsx        # v1 — portfolio-wide browsable view + Export to Excel/PDF
        │   ├── AccountTruth.jsx     # live, in nav — Contracted/Enabled/Used per account
        │   ├── DecisionLog.jsx      # shelved from nav, still live at /decisions
        │   ├── NotFound.jsx         # catch-all for a bad/stale URL
        │   └── RequestQueue.jsx / PodCapacity.jsx / OnePagers.jsx / FinanceReconciliation.jsx  # shelved placeholders
        ├── utils/dataExport.js       # ExcelJS workbook builder (Overview sheet, Accounts, Requests, etc.)
        └── components/
            ├── FloatingSectionNav.jsx      # the floating butterfly section-jump nav, ported from alis-hub
            ├── AlisQuickLinks.jsx          # the 🔗 quick-links menu next to every company name
            ├── TierFilterPills.jsx         # multiselect Tier filter pills, shared by Accounts + Account Truth tables
            ├── PortfolioEntitlementsSection.jsx  # live ALIS admin check, live-streamed log
            └── BackToTopButton.jsx
```

## Guardrails (carried over from alis-hub)

- Per-person, git-ignored `server/.env` — never shared or committed.
- Internal decision-support tool. No "send"/"publish" button — anything
  client-facing or leaving the building goes through a human first.
- No individual dashboards, no HubSpot-Owner-ID concept — this is portfolio-wide by
  design (everyone sees the whole book, not a personal slice).
