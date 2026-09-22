# alis-product-ops

Evidence-driven product/BI decision platform for the ALIS org. Forked from
[alis-hub](../alis-hub) — same HubSpot ingestion and Express/React/SQLite(sql.js)
patterns, aimed at a different audience and decision: not "run this job against ALIS
admin" but **"what should the product/BI/engineering org build next, and why."**

Read [`docs/CONTEXT.md`](docs/CONTEXT.md) first — it has the actual Slack-sourced
evidence for who this is for and what each view needs to do, and
[`docs/FORK_PROMPT.md`](docs/FORK_PROMPT.md) for the original build brief.

## Status (2026-09-21, updated same day)

Pivoted mid-build: instead of the six-view decision platform, v1 leads with the
simplest thing that's actually valuable today — a one-click Excel export, unscored,
so Trisha's/BI's team and Ella can plug it into whatever they already use. The
six-view plan isn't gone, just shelved (see `docs/CONTEXT.md`) — the code and routes
are still in the repo, just not the lead nav experience.

| View | Status |
|---|---|
| **Data Export** (Accounts + Active Requests, one Excel file) | **Live — this is v1** |
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
│   ├── db/database.js       # sql.js — currently just the decisions table
│   ├── services/
│   │   ├── hubspotClient.js # generic bearer-auth-over-https + retry, ported from alis-hub
│   │   ├── hubspotAccounts.js # portfolio-wide company list (no owner scoping)
│   │   └── hubspotDeals.js    # deal + line-item pull for Contract Truth
│   └── api/
│       ├── accounts.js
│       └── decisions.js
└── client/
    └── src/
        ├── App.jsx           # router + nav shell
        ├── pages/            # one file per view
        └── components/NavShell.jsx
```

## Guardrails (carried over from alis-hub)

- Per-person, git-ignored `server/.env` — never shared or committed.
- Internal decision-support tool. No "send"/"publish" button — anything
  client-facing or leaving the building goes through a human first.
- No individual dashboards, no HubSpot-Owner-ID concept — this is portfolio-wide by
  design (Ella and everyone else sees the whole book, not a personal slice).
