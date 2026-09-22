import { useEffect, useMemo, useRef, useState } from 'react';
import { getExportData } from '../api.js';
import { exportDataToExcel, exportAccountsToExcel, exportRequestsToExcel } from '../utils/dataExport.js';
import FloatingSectionNav from '../components/FloatingSectionNav.jsx';
import BackToTopButton from '../components/BackToTopButton.jsx';

/** Same title -> DOM-id convention as alis-hub's dashboards (kept in sync manually, not shared — see FloatingSectionNav's doc comment). */
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const JUMP_EVENT = 'alis-product-hub:jump-to-section';

const OVERVIEW_SECTIONS = [
  { category: 'Highlighted', items: ['Top 3 Enhancements', 'Escalations'] },
  { category: 'Everything', items: ['Accounts', 'Open Tickets', 'Enhancement Tickets', 'Active Requests'] },
];

// Same label alis-hub's ticket pipelines use for a ticket staged as one of
// an account's Top 3 Enhancement asks (see hubspotRequests.js) — a stage,
// not a category, so it's pulled from `stage`, not `category`.
const TOP_3_STAGE = 'Top 3 Enhancements';
// hubspotRequests.js's CATEGORY_2_0_LABELS maps the portal's "ALIS Bug"
// category_2_0 value to this label — the closest thing to a structured
// "this is an escalation" flag the data has today.
const ESCALATION_CATEGORY = 'ALIS Escalation';

/** Collapsible white card, same fold/jump pattern as alis-hub's own dashboards — click the title to fold; jumping here from QuickJumpNav/FloatingSectionNav always unfolds it first. */
function SectionCard({ title, description, action, accent, defaultExpanded = true, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const ref = useRef(null);
  const sectionId = slugify(title);

  useEffect(() => {
    function handleJump(e) {
      if (e.detail?.id !== sectionId) return;
      setExpanded(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener(JUMP_EVENT, handleJump);
    return () => window.removeEventListener(JUMP_EVENT, handleJump);
  }, [sectionId]);

  return (
    <div
      id={sectionId}
      ref={ref}
      className={`card mb-8 scroll-mt-4 ${accent ? 'border-l-4 border-l-accent-500' : ''}`}
    >
      <div
        className="mb-4 flex items-start justify-between gap-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2">
          <span className="text-xs text-neutral-400 mt-1.5">{expanded ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
            {description && <p className="text-xs text-neutral-500 mt-1">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {expanded && children}
    </div>
  );
}

function QuickJumpNav({ sections }) {
  function jumpTo(title) {
    window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { id: slugify(title) } }));
  }
  return (
    <div className="space-y-3">
      {sections.map((group) => (
        <div key={group.category}>
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-1.5">{group.category}</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {group.items.map((title) => (
              <li key={title} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent-300 shrink-0" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => jumpTo(title)}
                  className="text-left text-base leading-snug text-neutral-700 hover:text-accent-600 hover:underline"
                >
                  {title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A KPI tile that jumps to its own section when a target is given — same "hover grows, feels clickable" convention as alis-hub's StatCard jumpTo tiles, just scoped to this one component instead of every .card. */
function StatTile({ label, value, sub, accent, jumpTo }) {
  const clickable = Boolean(jumpTo);
  return (
    <button
      type="button"
      onClick={clickable ? () => window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { id: slugify(jumpTo) } })) : undefined}
      disabled={!clickable}
      title={clickable ? `Jump to ${jumpTo}` : undefined}
      className={`text-left rounded-xl p-6 border w-full transition-all duration-200 ${
        accent ? 'bg-accent-50 border-accent-300' : 'bg-white border-neutral-200'
      } ${clickable ? 'cursor-pointer hover:scale-[1.03] hover:shadow-lg hover:border-accent-400' : 'cursor-default'}`}
    >
      <div className={`text-4xl font-bold leading-none tabular-nums ${accent ? 'text-accent-600' : 'text-primary-900'}`}>{value}</div>
      <div className={`text-sm font-medium mt-2.5 ${accent ? 'text-accent-700' : 'text-neutral-600'}`}>{label}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </button>
  );
}

function usd(cents) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** The per-section "Export to Excel" button in a SectionCard's header — same export utility as the holistic one, just scoped to this section's own rows. */
function SectionExportButton({ onExport }) {
  const [exporting, setExporting] = useState(false);
  async function handleClick() {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }
  return (
    <button className="btn-secondary btn-sm" onClick={handleClick} disabled={exporting}>
      {exporting ? 'Exporting…' : 'Export'}
    </button>
  );
}

const REQUEST_COLUMNS = 10;

/** One ticket row, click-to-expand into its full detail — pipeline, both dates, ticket id, and the HubSpot link, none of which fit in the summary row. */
function RequestRow({ r, expanded, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-neutral-50">
        <td>{r.companyName || '—'}</td>
        <td>{r.accountManagerName || '—'}</td>
        <td>{r.category || '—'}</td>
        <td>{r.tier ?? '—'}</td>
        <td>{usd(r.arrCents)}</td>
        <td className="max-w-[240px] truncate" title={r.subject}>{r.subject}</td>
        <td>{r.stage}</td>
        <td>{r.priority || '—'}</td>
        <td>{r.ageDays != null ? `${r.ageDays}d` : '—'}</td>
        <td className="text-center text-neutral-400">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={REQUEST_COLUMNS} className="bg-neutral-50">
            <div className="py-3 px-2 text-sm">
              <p className="font-medium text-primary-900 mb-2">{r.subject}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-neutral-600">
                <div><span className="text-neutral-400">Pipeline:</span> {r.pipeline}</div>
                <div><span className="text-neutral-400">Ticket ID:</span> {r.ticketId}</div>
                <div><span className="text-neutral-400">Created:</span> {r.createdAt ? r.createdAt.slice(0, 10) : '—'}</div>
                <div><span className="text-neutral-400">Last modified:</span> {r.lastModifiedAt ? r.lastModifiedAt.slice(0, 10) : '—'}</div>
                {r.url && <div><a href={r.url} target="_blank" rel="noreferrer">Open in HubSpot &rarr;</a></div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Shared table for every request list on this page — Top 3 Enhancements,
 * Escalations, and Active Requests all render through this so search,
 * columns, and the expand behavior can't drift between sections. `search`
 * (when `showSearch`) matches company, account manager, issue type
 * (category), and subject — the four things you'd actually go looking for
 * a ticket by.
 */
function RequestsTable({ requests, emptyLabel, showSearch = true, limit = 50 }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      r.companyName?.toLowerCase().includes(q) ||
      r.accountManagerName?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q)
    );
  }, [requests, search]);

  if (requests.length === 0) {
    return <p className="text-sm text-neutral-500 py-4">{emptyLabel}</p>;
  }

  return (
    <>
      {showSearch && (
        <input
          placeholder="Search company, account manager, issue type, or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-4"
        />
      )}
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">No requests match that search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Company</th><th>Account Manager</th><th>Issue Type</th><th>Tier</th><th>ARR</th>
                <th>Subject</th><th>Stage</th><th>Priority</th><th>Age</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => (
                <RequestRow
                  key={r.ticketId}
                  r={r}
                  expanded={expandedId === r.ticketId}
                  onToggle={() => setExpandedId(expandedId === r.ticketId ? null : r.ticketId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > limit && (
        <p className="text-xs text-neutral-400 mt-2">Showing {limit} of {filtered.length} — narrow your search, or export for the full list.</p>
      )}
    </>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  function load() {
    setLoading(true);
    setError(null);
    getExportData()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      await exportDataToExcel(data);
    } finally {
      setExporting(false);
    }
  }

  const filteredAccounts = useMemo(() => {
    if (!data) return [];
    const q = accountSearch.trim().toLowerCase();
    if (!q) return data.companies;
    return data.companies.filter((a) =>
      a.name?.toLowerCase().includes(q) || a.accountManagerName?.toLowerCase().includes(q)
    );
  }, [data, accountSearch]);

  const stages = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.requests.map((r) => r.stage).filter(Boolean))].sort();
  }, [data]);

  const stageFilteredRequests = useMemo(() => {
    if (!data) return [];
    return stageFilter === 'all' ? data.requests : data.requests.filter((r) => r.stage === stageFilter);
  }, [data, stageFilter]);

  const top3Enhancements = useMemo(
    () => (data ? data.requests.filter((r) => r.stage === TOP_3_STAGE) : []),
    [data]
  );
  const escalations = useMemo(
    () => (data ? data.requests.filter((r) => r.category === ESCALATION_CATEGORY) : []),
    [data]
  );

  const totalArrCents = useMemo(
    () => (data ? data.companies.reduce((sum, c) => sum + (c.arrCents || 0), 0) : 0),
    [data]
  );
  const openTicketRequests = useMemo(
    () => (data ? data.requests.filter((r) => r.stage === 'Client Submitted' || r.stage === 'In Progress') : []),
    [data]
  );
  const enhancementRequests = useMemo(
    () => (data ? data.requests.filter((r) => (r.category || '').toLowerCase().includes('enhancement') || (r.category || '').toUpperCase() === 'FEATURE_REQUEST') : []),
    [data]
  );
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">Realtime Client Data</h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-xl">
            Live from HubSpot, no scoring applied. Browse it here, or export it to plug into
            whatever you're already using — the #bi-priority sheet, DOMO, a pivot table.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn-accent" onClick={handleExport} disabled={!data || exporting}>
            {exporting ? 'Building file…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {error && <div className="notice danger">{error}</div>}

      {loading && !data && (
        <div className="card text-center text-neutral-500 py-16">Pulling live data from HubSpot…</div>
      )}

      {data && (
        <>
          <SectionCard title="Overview" description={`As of ${new Date(data.generatedAt).toLocaleString()}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 mb-6">
              <StatTile label="Accounts" value={data.companies.length} jumpTo="Accounts" />
              <StatTile label="Portfolio ARR" value={usd(totalArrCents)} jumpTo="Accounts" />
              <StatTile label="Open Tickets" value={openTicketRequests.length} sub="Client Submitted + In Progress" jumpTo="Open Tickets" />
              <StatTile label="Enhancement Tickets" value={enhancementRequests.length} sub="by category" jumpTo="Enhancement Tickets" />
              <StatTile label="Top 3 Enhancements" value={top3Enhancements.length} accent jumpTo="Top 3 Enhancements" />
              <StatTile label="Escalations" value={escalations.length} accent jumpTo="Escalations" />
            </div>
            <QuickJumpNav sections={OVERVIEW_SECTIONS} />
          </SectionCard>

          <SectionCard
            title="Top 3 Enhancements"
            description="Every ticket staged as one of an account's Top 3 Enhancement asks — the requests carrying the most explicit account-level priority signal available."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(top3Enhancements, 'Top 3 Enhancements', data.generatedAt)} />}
          >
            <RequestsTable requests={top3Enhancements} emptyLabel="No tickets currently staged as Top 3 Enhancements." />
          </SectionCard>

          <SectionCard
            title="Escalations"
            description="Every ticket categorized as an ALIS Escalation, portfolio-wide."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(escalations, 'Escalations', data.generatedAt)} />}
          >
            <RequestsTable requests={escalations} emptyLabel="No open escalations right now." />
          </SectionCard>

          <SectionCard
            title="Open Tickets"
            description="Every ticket currently in Client Submitted or In Progress — the working queue, before any Top 3/Long-Term/Escalation triage happens."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(openTicketRequests, 'Open Tickets', data.generatedAt)} />}
          >
            <RequestsTable requests={openTicketRequests} emptyLabel="Nothing currently open." />
          </SectionCard>

          <SectionCard
            title="Enhancement Tickets"
            description="Every ticket categorized as a feature/enhancement request, portfolio-wide — broader than Top 3 Enhancements above."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(enhancementRequests, 'Enhancement Tickets', data.generatedAt)} />}
          >
            <RequestsTable requests={enhancementRequests} emptyLabel="No enhancement requests right now." />
          </SectionCard>

          <SectionCard
            title="Accounts"
            description="Every Home Office account, its account manager, tier, and ARR — search to narrow."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportAccountsToExcel(filteredAccounts, data.generatedAt)} />}
          >
            <input
              placeholder="Search by company or account manager…"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="w-full mb-4"
            />
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Company</th><th>Account Manager</th><th>Tier</th><th>ARR</th></tr></thead>
                <tbody>
                  {filteredAccounts.slice(0, 50).map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.accountManagerName || '—'}</td>
                      <td>{a.tier ?? '—'}</td>
                      <td>{usd(a.arrCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAccounts.length > 50 && (
              <p className="text-xs text-neutral-400 mt-2">Showing 50 of {filteredAccounts.length} — narrow your search.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Active Requests"
            description="Tickets modified in the last 120 days in an active stage, joined to account/AM/ARR/tier. Click a row for full detail. No scoring — raw columns to sort/filter/weight however your team already does."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(stageFilteredRequests, 'Active Requests', data.generatedAt)} />}
          >
            <div className="mb-4">
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="min-w-[180px]">
                <option value="all">All stages</option>
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <RequestsTable requests={stageFilteredRequests} emptyLabel="No requests in this stage." />
          </SectionCard>
        </>
      )}

      <FloatingSectionNav
        watchSectionId="app-header"
        sections={OVERVIEW_SECTIONS}
        enabled={!loading && !!data}
        onSelect={(title) => window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { id: slugify(title) } }))}
      />
      <BackToTopButton />
    </>
  );
}
