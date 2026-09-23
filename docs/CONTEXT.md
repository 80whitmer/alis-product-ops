# Why this app exists

Forked from [alis-hub](../alis-hub) on 2026-09-21. Same org, different audience and
different decision: not "run this job against ALIS admin" but **"what should the
product/BI/engineering org build next, and why."**

## The failure mode this closes

The 2025 State of Product Teams report (Pragmatic Institute) names it directly: teams
know what good prioritization looks like, but decisions default to executive mandate
over market evidence because there's no durable, shared signal to argue from — 46% of
teams don't even own their prioritization decisions. A Slack sweep across
`#bi-priority`, `#enhancements-pilot`, `#account-management`, and `#monthly-billing`
shows the identical pattern playing out here in the org's own words, not a guess.

## Who this is for, and what they actually said

- **Trisha Cole (TC)** — de facto product decision owner, drowning in it: *"we are
  drowning in these type of requests for parity."* Her own ask in `#bi-priority` is
  close to a spec for this app: *"discuss infrastructure to ensure the BI team is
  getting the info and access they need to move things forward and the CS teams (AM
  specifically) have a place to get updates or give additional info."*
- **John Shafaee** — wants shareable, async, self-serve context instead of
  re-explaining live: *"Any opportunity to share info async ahead of the meeting? Eg.
  column and row descriptions listing data source in ALIS?"*
- **Tyler Lannom (Clinical pod)** — fighting for an accurate picture of real workload
  vs. what the board shows: pod capacity is currently self-reported and unreliable.
- **Steven Chen (Eng/AI)** — needs ticket status tied to something more legible than
  Jira hygiene.
- **Integrations team** — does integration feasibility scoping and keeps hitting a
  data-provenance wall (the DS Smart vitals thread: *"right now there is no way for us
  to tell if it came from them or not"*). Needs contract/entitlement/usage truth per
  account, fast. No individual dashboard, no owner-scoping — they need company-wide,
  realtime client information.
- **Hozi (Huzaifa Tapal)** — infra/ops-adjacent leadership; wants system/account-health
  rollups, not ticket-level noise.
- **BI Pod (Kelly, Tony, Bebb, Cameron)** — running a 32-item, some-year-old backlog off
  a Google Sheet, competing with DOMO tickets. *"Reporting decisions can't be made in a
  vacuum"* — the exact durable-decision-system gap.

**Secondary user, different job, same data spine — Dave (Finance):** chasing MRR stuck
in billing runs (*"$7,869 of MRR tied up in yellow, I do NOT want to delay billing"*),
plus the AM-enables-before-contract-signed problem (Gary: *"please do not enable any
features or services for any clients until we have a contract signed"*). Dave's view is
contract-state vs. entitlement-state vs. billing-state reconciliation and ARR exposure
behind open requests — not TC's prioritization view. Same backend, separate surface.

## 2026-09-21 pivot: v1 is a data export, not a tool

The integrations team's original ask, before any of the six-view plan below existed,
was simpler than all of it: a spreadsheet they could refresh with realtime ALIS-client
data. Rather than
build the all-encompassing platform first, v1 leads with exactly that — **Data Export**
(`/export` in the nav): one button, pulls live from HubSpot, downloads one Excel file
with two unscored sheets (Accounts; Active Requests joined to account ARR/tier). No
prioritization logic, no decision log surfaced by default — just the evidence data the
report's principles call for, in a shape Trisha's/BI's team can drop into their
existing #bi-priority sheet or DOMO themselves. If they need more than raw data
(scoring, a live dashboard, Jira merged in), that's the signal to build further into
the six-view plan below — not before.

Account Truth and Decision Log are still fully built and live, just moved out of the
default nav (see `client/src/components/NavShell.jsx`) since they're part of the
larger tool being held back, not the v1 ask. Request Queue/Pod Capacity/One-
Pagers/Finance Reconciliation remain exactly as before — shelved, not started or
blocked on Jira.

## The six views (build in this order — don't build all six at once)

1. **Unified, scored request queue** — every open enhancement/escalation/BI ask in one
   list, scored by distinct accounts requesting it, combined ARR, contract tier, age,
   and deal/renewal blocking. Currently a hand-run Google Sheet in `#bi-priority`.
   **Status: blocked** — needs HubSpot tickets *and* Jira ESC/enhancement items, and the
   Atlassian/Jira connector isn't authorized yet. Do not build this until Jira access
   is confirmed (see `docs/FORK_PROMPT.md` for the full reasoning) — a HubSpot-only
   version would ship a queue that's missing exactly the items TC currently escalates
   most (Jira ESC tickets), which is worse than no queue.
2. **Account/community contract truth, on demand** — contracted (HubSpot deal line
   items) vs. enabled (ALIS entitlements) vs. used (ALIS export API activity), reusing
   alis-hub's Usage Audit RAG grid concept. **Status: contracted-side is live here**
   (see `server/services/hubspotDeals.js`) but returns empty until the shared HubSpot
   private app token has `crm.objects.line_items.read` / `crm.schemas.line_items.read`
   scopes — alis-hub disabled this exact column 2026-09-03 for the same reason. Enabled
   (ALIS entitlements) and Used (export API) columns aren't ported yet — they require
   the Playwright/ALIS-credential automation alis-hub already has, which this v1
   deliberately skipped to ship the HubSpot side first.
3. **Pod capacity, from real signal, not self-report** — needs a dev-board/Jira pull.
   Not started; same Jira gate as #1.
4. **Shareable one-pagers per issue/account** — John's literal ask. Not started.
5. **Finance reconciliation view (Dave)** — enabled-but-uncontracted flags, MRR blocked
   in billing, ARR exposure on open requests. Not started; depends on #1's data spine.
6. **Decision log** — who decided what, against what evidence, when. **Status: live**
   (`server/api/decisions.js`) — doesn't depend on Jira, built first alongside #2 since
   it's the actual "durable decision system" gap and has no external blocker.

## AI usage, if any gets added here

Per the report's own finding: don't bolt on another summarizer. If AI shows up, it
should do diagnostic work (is this request recurring because it's a real gap, or
noise) and prescriptive scoring input (suggest a rank with reasoning shown, editable) —
never a silent auto-decision.

## Guardrails carried over from alis-hub

- Per-person, git-ignored `server/.env` — never shared or committed.
- Internal decision-support tool. No "send"/"publish" button in v1 — anything
  client-facing or leaving the building goes through a human first.
- Genuine fork, own repo (not a mode bolted onto alis-hub's UI) — shares backend
  service *patterns* (HubSpot client, SQLite-via-sql.js), not a shared runtime.
