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
  { category: 'Data', items: ['Accounts', 'Active Requests'] },
];

function SectionCard({ title, description, action, children }) {
  const ref = useRef(null);
  const sectionId = slugify(title);

  useEffect(() => {
    function handleJump(e) {
      if (e.detail?.id !== sectionId) return;
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener(JUMP_EVENT, handleJump);
    return () => window.removeEventListener(JUMP_EVENT, handleJump);
  }, [sectionId]);

  return (
    <div id={sectionId} ref={ref} className="card mb-8 scroll-mt-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
          {description && <p className="text-xs text-neutral-500 mt-1">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
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

function StatTile({ label, value, sub }) {
  return (
    <div className="card-sm bg-white border border-neutral-200 rounded-lg p-4">
      <div className="text-2xl font-bold text-primary-900">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function usd(cents) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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

  const totalArrCents = useMemo(
    () => (data ? data.companies.reduce((sum, c) => sum + (c.arrCents || 0), 0) : 0),
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatTile label="Accounts" value={data.companies.length} />
              <StatTile label="Portfolio ARR" value={usd(totalArrCents)} />
              <StatTile label="Active Requests" value={data.requests.length} sub="last 120 days" />
              <StatTile label="Aged 90+ days" value={staleRequests} sub="of active requests" />
            </div>
            <QuickJumpNav sections={OVERVIEW_SECTIONS} />
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
            description="Tickets modified in the last 120 days in an active stage, joined to account ARR/tier. No scoring — raw columns to sort/filter/weight however your team already does."
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
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Company</th><th>Tier</th><th>ARR</th><th>Subject</th>
                    <th>Stage</th><th>Priority</th><th>Age</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.slice(0, 50).map((r) => (
                    <tr key={r.ticketId}>
                      <td>{r.companyName || '—'}</td>
                      <td>{r.tier ?? '—'}</td>
                      <td>{usd(r.arrCents)}</td>
                      <td className="max-w-[280px] truncate" title={r.subject}>{r.subject}</td>
                      <td>{r.stage}</td>
                      <td>{r.priority || '—'}</td>
                      <td>{r.ageDays != null ? `${r.ageDays}d` : '—'}</td>
                      <td>{r.url && <a href={r.url} target="_blank" rel="noreferrer">Open</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
