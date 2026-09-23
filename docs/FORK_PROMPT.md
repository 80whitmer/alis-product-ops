# Prompt for Claude Code: Fork ALIS Hub → "ALIS Product Ops" (Product Decision Platform)

## Context to paste first
Paste the ALIS Hub context primer (stack: Node/Express + React/Vite + SQLite + Playwright, HubSpot API,
existing job runner + reporting dashboards) ahead of this prompt so Claude Code has the current repo shape
in mind before touching anything.

---

## The ask

Fork ALIS Hub into a new, separate app — **ALIS Product Ops** — that reuses the existing HubSpot ingestion,
SQLite job/state patterns, and Express/React scaffolding, but is aimed at a different audience and a
different decision: not "run this job against ALIS admin," but **"what should the product/BI/engineering
org build next, and why."**

This is not a cosmetic reskin. The 2025 State of Product Teams report (Pragmatic Institute) names the exact
failure mode we're trying to close: teams know what good prioritization looks like, but in practice
**decisions default to executive mandate (28%) over market evidence, because there's no durable, shared
signal to argue from.** 46% of teams don't even own their prioritization decisions. That is precisely what's
happening in our own Slack right now — enhancement requests get triaged by whoever's loudest in
#enhancements-pilot, backlog "burn-down" is self-reported and untrustworthy, and BI reporting requests
compete for time with no shared source of truth. Build the tool that removes the negotiation and puts
evidence in its place.

## Primary users (build for these people by name, not personas)

- **Trisha Cole (TC)** — de facto product decision owner. Explicitly asked for infrastructure so "the BI
  team is getting the info and access they need to move things forward and the CS teams have a place to
  get updates or give additional info." She is the primary user. Every prioritization view should answer
  her actual question: *of everything competing for attention right now, what's worth doing, for whom, and
  what's the evidence?*
- **John Shafaee** — wants async-shareable context instead of live re-explaining in meetings ("column and
  row descriptions listing data source"). Needs exportable, self-contained briefs per issue/account, not
  another live dashboard he has to walk people through.
- **Steven Chen (Engineering/AI)** — needs ticket/request status tied to something more legible than Jira
  hygiene, so effort sizing reflects real business impact, not just who asked loudest.
- **Tyler Lannom (Clinical pod / enhancement triage)** — needs an accurate, non-self-reported picture of
  pod workload and backlog age so "does this jump the line" isn't a Slack argument every time.
- **Integrations team** — needs fast, reliable answers to "which accounts/communities are on this
  integration, what's their contract/entitlement status, and is this a one-off or a pattern" before they
  scope anything.
- **Hozi (Huzaifa Tapal)** — ops/infra-adjacent leadership; wants system/account-health rollups, not
  ticket-level noise.

## Secondary user: Dave (Finance) — different job, same data spine

Dave needs **contract-state vs. entitlement-state vs. billing-state reconciliation**, not a prioritization
tool. Specifically: accounts where a feature/community was enabled in ALIS before a signed contract exists
(the live source of AM/Finance friction — see Gary's "do not enable any features until contract signed"),
MRR sitting in a blocked/incomplete billing state, and ARR exposure attached to open high-priority
enhancement/escalation requests (churn-risk visibility). Build this as a **separate view on the same data
spine**, not a bolted-on afterthought — Dave should never have to look at product prioritization noise to
get his answer, and TC's team should never have to look at billing reconciliation to get theirs.

## What "evidence-driven prioritization" means concretely — build these views

1. **Unified request queue, scored, not vibes-sorted.** Every open enhancement request, escalation, and
   BI/reporting ask (HubSpot tickets + the Jira ESC/enhancement items referenced in Slack) in one list,
   each row scored by: number of distinct accounts requesting it, combined ARR of those accounts, contract
   tier/priority level, age of request, and whether it's blocking a specific deal or renewal. This directly
   answers TC's "drowning in requests for parity" problem — it turns "everyone's asking for this" into an
   actual number.
2. **Account/community usage + contract truth, on demand.** Given an account or integration, show
   contracted (HubSpot line items) vs. enabled (ALIS entitlements) vs. actually used — ALIS Hub already
   builds this RAG grid for the Company/Community Usage Audit, so extend it to answer the integrations
   team's "is this a real cross-client need or a one-off" question in one lookup instead of a Slack thread.
3. **Pod capacity, from real signal, not self-report.** Pull actual dev-board/Jira status per pod
   (Clinical, CRM, etc.) rather than relying on people remembering to update tickets — this is the specific
   gap Tyler and William Metcalf were fighting over ("the board represents the same thing in some way").
4. **Shareable one-pagers per issue/account**, exportable to PDF/doc — John's literal ask: column/row
   descriptions, data source, and current state, so a decision-maker can review async before a meeting
   instead of live in it.
5. **Finance reconciliation view (Dave):** enabled-but-uncontracted flags, MRR blocked in billing status,
   and ARR-weighted exposure on open high-priority requests. Keep this behind its own nav/section — same
   backend, separate surface.
6. **A decision log, not just a backlog.** Every time something gets prioritized, deprioritized, or
   deferred, record who decided, against what evidence, and when — this is the "durable decision system"
   the report says is the actual missing link, not another dashboard. Without this, six months from now
   we're back to re-litigating the same "why did we build X instead of Y" arguments from memory.

## AI usage — apply with purpose, not just speed

The report's own finding: AI adoption is now baseline, but most of it clusters in routine/descriptive work
(chatbots, summarization) rather than where it actually moves decision quality (diagnostic analysis,
prioritization support, customer-insight synthesis). Don't build another AI summarizer bolted onto tickets.
If AI shows up here, it should do the things AI-driven teams reported getting real strategic value from:
diagnostic analysis (why is this request recurring — is it a real gap or noise), and prescriptive scoring
input (suggest a priority rank with its reasoning shown, not just a black-box number) — always with the
evidence visible and editable, never as a silent auto-decision.

## Guardrails (carry over from ALIS Hub)

- Reuse ALIS Hub's credential model: per-person, git-ignored `.env`, never shared/committed.
- This is an internal decision-support tool. Anything that could leave the building (a client-facing number,
  an external report) still gets routed through a human before it goes out — don't build a "send" button
  anywhere in v1.
- Keep this as a genuine fork/new app, not a mode bolted onto ALIS Hub's existing UI — different audience,
  different nav, can share backend services (HubSpot client, SQLite patterns) where it makes sense.

## First deliverable

Don't try to build all six views at once. Start with #1 (the unified, scored request queue) since it's the
one TC, John, Tyler, and Steven Chen all touch directly and it's the one currently being run by hand in a
Google Sheet in #bi-priority. Get that real, then layer in the account-truth lookup (#2) and the Dave view
(#5) next, since those unblock the loudest current pain.
