# alis-product-ops

Evidence-driven product/BI decision platform for the ALIS org. Forked from
[alis-hub](../alis-hub) — same HubSpot ingestion and Express/React/SQLite(sql.js)
patterns, aimed at a different audience and decision: not "run this job against ALIS
admin" but **"what should the product/BI/engineering org build next, and why."**

Read [`docs/CONTEXT.md`](docs/CONTEXT.md) first — it has the actual Slack-sourced
evidence for who this is for and what each view needs to do, and
[`docs/FORK_PROMPT.md`](docs/FORK_PROMPT.md) for the original build brief.

## Status (2026-09-21)

| View | Status |
|---|---|
| Request Queue (scored, HubSpot + Jira) | **Blocked** — needs Jira/Atlassian connector access |
| Account Truth (Contracted / Enabled / Used) | **Contracted live**; Enabled + Used not ported yet |
| Pod Capacity | Not started — same Jira gate |
| One-Pagers | Not started |
| Finance Reconciliation (Dave) | Not started |
| Decision Log | **Live** |

Account Truth's Contracted column will return deals with **empty line items**
until the shared HubSpot private app token gets the `crm.objects.line_items.read`
and `crm.schemas.line_items.read` scopes added (alis-hub hit this same wall
2026-09-03 and disabled the column rather than ship it broken). Add the scopes,
regenerate the token, done — no code change needed on this side.

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
