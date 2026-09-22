import { useEffect, useMemo, useRef, useState } from 'react';
import { getExportData } from '../api.js';
import { exportDataToExcel } from '../utils/dataExport.js';
import FloatingSectionNav from '../components/FloatingSectionNav.jsx';
import BackToTopButton from '../components/BackToTopButton.jsx';

/** Same title -> DOM-id convention as alis-hub's dashboards (kept in sync manually, not shared — see FloatingSectionNav's doc comment). */
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const JUMP_EVENT = 'alis-product-hub:jump-to-section';

const OVERVIEW_SECTIONS = [
  { category: 'Highlighted', items: ['Top 3 Enhancements', 'Escalations'] },
  { category: 'Everything', items: ['Accounts', 'Active Requests'] },
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

function StatTile({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl p-6 border ${accent ? 'bg-accent-50 border-accent-300' : 'bg-white border-neutral-200'}`}>
      <div className={`text-4xl font-bold leading-none tabular-nums ${accent ? 'text-accent-600' : 'text-primary-900'}`}>{value}</div>
      <div className={`text-sm font-medium mt-2.5 ${accent ? 'text-accent-700' : 'text-neutral-600'}`}>{label}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function usd(cents) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const REQUEST_COLUMNS = 8;

/** One ticket row, click-to-expand into its full detail — category, pipeline, both dates, ticket id, and the HubSpot link, none of which fit in the summary row. */
function RequestRow({ r, expanded, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-neutral-50">
        <td>{r.companyName || '—'}</td>
        <td>{r.tier ?? '—'}</td>
        <td>{usd(r.arrCents)}</td>
        <td className="max-w-[260px] truncate" title={r.subject}>{r.subject}</td>
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
                <div><span className="text-neutral-400">Category:</span> {r.category || '—'}</div>
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

/** Shared table body for every request list on this page — Top 3 Enhancements, Escalations, and the full Active Requests list all render through this so the expand behavior stays identical. */
function RequestsTable({ requests, emptyLabel }) {
  const [expandedId, setExpandedId] = useState(null);

  if (requests.length === 0) {
    return <p className="text-sm text-neutral-500 py-4">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Company</th><th>Tier</th><th>ARR</th><th>Subject</th>
            <th>Stage</th><th>Priority</th><th>Age</th><th></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
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
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
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
    return q ? data.companies.filter((a) => a.name?.toLowerCase().includes(q)) : data.companies;
  }, [data, accountSearch]);

  const stages = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.requests.map((r) => r.stage).filter(Boolean))].sort();
  }, [data]);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    const q = requestSearch.trim().toLowerCase();
    return data.requests.filter((r) => {
      const matchesSearch = !q || r.subject?.toLowerCase().includes(q) || r.companyName?.toLowerCase().includes(q);
      const matchesStage = stageFilter === 'all' || r.stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [data, requestSearch, stageFilter]);

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
  const openTickets = useMemo(
    () => (data ? data.requests.filter((r) => r.stage === 'Client Submitted' || r.stage === 'In Progress').length : 0),
    [data]
  );
  const staleRequests = useMemo(
    () => (data ? data.requests.filter((r) => (r.ageDays ?? 0) > 90).length : 0),
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
              <StatTile label="Accounts" value={data.companies.length} />
              <StatTile label="Portfolio ARR" value={usd(totalArrCents)} />
              <StatTile label="Open Tickets" value={openTickets} sub="Client Submitted + In Progress" />
              <StatTile label="Enhancement Tickets" value={data.requests.filter((r) => (r.category || '').toLowerCase().includes('enhancement') || (r.category || '').toUpperCase() === 'FEATURE_REQUEST').length} sub="by category" />
              <StatTile label="Top 3 Enhancements" value={top3Enhancements.length} accent />
              <StatTile label="Escalations" value={escalations.length} accent />
            </div>
            <QuickJumpNav sections={OVERVIEW_SECTIONS} />
          </SectionCard>

          <SectionCard
            title="Top 3 Enhancements"
            description="Every ticket staged as one of an account's Top 3 Enhancement asks — the requests carrying the most explicit account-level priority signal available."
            accent
          >
            <RequestsTable requests={top3Enhancements} emptyLabel="No tickets currently staged as Top 3 Enhancements." />
          </SectionCard>

          <SectionCard
            title="Escalations"
            description="Every ticket categorized as an ALIS Escalation, portfolio-wide."
            accent
          >
            <RequestsTable requests={escalations} emptyLabel="No open escalations right now." />
          </SectionCard>

          <SectionCard title="Accounts" description="Every Home Office account, tier, and ARR — search to narrow.">
            <input
              placeholder="Search accounts…"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="w-full mb-4"
            />
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Company</th><th>Tier</th><th>ARR</th></tr></thead>
                <tbody>
                  {filteredAccounts.slice(0, 50).map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
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
            description="Tickets modified in the last 120 days in an active stage, joined to account ARR/tier. Click a row for full detail. No scoring — raw columns to sort/filter/weight however your team already does."
          >
            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                placeholder="Search by subject or account…"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                className="flex-1 min-w-[220px]"
              />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="min-w-[180px]">
                <option value="all">All stages</option>
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <RequestsTable requests={filteredRequests.slice(0, 50)} emptyLabel="No requests match that search." />
            {filteredRequests.length > 50 && (
              <p className="text-xs text-neutral-400 mt-2">Showing 50 of {filteredRequests.length} — narrow your search, or export for the full list.</p>
            )}
          </SectionCard>
        </>
      )}

      <FloatingSectionNav
        watchSectionId={slugify('Overview')}
        sections={OVERVIEW_SECTIONS}
        enabled={!loading && !!data}
        onSelect={(title) => window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { id: slugify(title) } }))}
      />
      <BackToTopButton />
    </>
  );
}
