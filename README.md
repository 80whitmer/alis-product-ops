# alis-product-ops

Evidence-driven product/BI decision platform for the ALIS org. Forked from
[alis-hub](../alis-hub) — same HubSpot ingestion and Express/React/SQLite(sql.js)
patterns, aimed at a different audience and decision: not "run this job against ALIS
admin" but **"what should the product/BI/engineering org build next, and why."**

Read [`docs/CONTEXT.md`](docs/CONTEXT.md) first — it has the actual Slack-sourced
evidence for who this is for and what each view needs to do, and
[`docs/FORK_PROMPT.md`](docs/FORK_PROMPT.md) for the original build brief.

## Status (2026-09-21, updated twice same day)

Pivoted mid-build: instead of the six-view decision platform, v1 leads with the
simplest thing that's actually valuable today — a live dashboard (with an Excel
export alongside it), unscored, so Trisha's/BI's team and the integrations team can
browse it in the browser or plug the export into whatever they already use. The six-view plan isn't
gone, just shelved (see `docs/CONTEXT.md`) — the code and routes are still in the
repo, just not the lead nav experience.

Rebranded same day into **ALIS Product Hub** — real ALIS brand system (Tailwind
config, colors, Lexend Exa, logo, the floating butterfly section-jump nav), ported
directly from alis-hub's own design system rather than reinvented, so it reads as
the same house rather than a one-off prototype.

| View | Status |
|---|---|
| **Dashboard** (`/`) — Accounts + Active Requests, browsable + Excel export | **Live — this is v1** |
| Account Truth (Contracted / Enabled / Used, one account at a time) | Live but shelved from nav — reachable at `/accounts` |
| Decision Log | Live but shelved from nav — reachable at `/decisions` |
| Request Queue (scored, HubSpot + Jira) | Shelved — needs Jira/Atlassian connector access |
| Pod Capacity / One-Pagers / Finance Reconciliation | Shelved — not started |

Both Data Export and Account Truth pull deal/line-item data that will come back
**scope-blocked** until the shared HubSpot private app token gets the
`crm.objects.line_items.read` and `crm.schemas.line_items.read` scopes added
(alis-hub hit this same wall 2026-09-03). Deal-level info (name, ARR, close date)
already works without it. The ticket side of Data Export (Active Requests) needs no
extra scopes and is fully live today.

## Setup

```bash
npm install
npm run setup:env   # creates server/.env from .env.example — fill in HUBSPOT_PRIVATE_APP_TOKEN
npm run dev         # server on :3100, client on :5174
```

Open [http://localhost:5174](http://localhost:5174).

## Project structure

```
alis-product-ops/
├── docs/
│   ├── CONTEXT.md       # who this is for, what they need, view-by-view status
│   └── FORK_PROMPT.md   # original build brief
├── server/
│   ├── index.js
│   ├── db/database.js         # sql.js — currently just the decisions table
│   ├── services/
│   │   ├── hubspotClient.js   # generic bearer-auth-over-https + retry + associations, ported from alis-hub
│   │   ├── hubspotAccounts.js # portfolio-wide company list (no owner scoping)
│   │   ├── hubspotDeals.js    # deal + line-item pull for Contract Truth
│   │   └── hubspotRequests.js # portfolio-wide active-ticket search + company join, for Dashboard
│   └── api/
│       ├── accounts.js
│       ├── decisions.js
│       └── export.js          # GET /api/export — what Dashboard.jsx and the Excel export both read
└── client/
    ├── public/                # ALIS brand assets (logo-horizontal.png, butterfly-icon.png)
    ├── tailwind.config.js     # same brand tokens as alis-hub's client/tailwind.config.js
    └── src/
        ├── App.jsx            # branded top navbar + router
        ├── pages/
        │   ├── Dashboard.jsx  # v1 — the live browsable view + Export to Excel button
        │   ├── AccountTruth.jsx / DecisionLog.jsx   # shelved, still live at their routes
        │   └── RequestQueue.jsx / PodCapacity.jsx / OnePagers.jsx / FinanceReconciliation.jsx  # shelved placeholders
        ├── utils/dataExport.js       # ExcelJS workbook builder, same pattern as alis-hub's export utils
        └── components/
            ├── FloatingSectionNav.jsx  # the floating butterfly section-jump nav, ported verbatim from alis-hub
            └── BackToTopButton.jsx
```

## Guardrails (carried over from alis-hub)

- Per-person, git-ignored `server/.env` — never shared or committed.
- Internal decision-support tool. No "send"/"publish" button — anything
  client-facing or leaving the building goes through a human first.
- No individual dashboards, no HubSpot-Owner-ID concept — this is portfolio-wide by
  design (everyone sees the whole book, not a personal slice).
