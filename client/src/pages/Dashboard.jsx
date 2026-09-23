import { useEffect, useMemo, useRef, useState } from 'react';
import { getKeyContacts } from '../api.js';
import { useDataCache } from '../DataCache.jsx';
import { exportDataToExcel, exportAccountsToExcel, exportRequestsToExcel } from '../utils/dataExport.js';
import FloatingSectionNav from '../components/FloatingSectionNav.jsx';
import BackToTopButton from '../components/BackToTopButton.jsx';
import { EscalationCharts, EnhancementCharts } from '../components/TicketCharts.jsx';
import { KpiTierSection, ArrBandSection, count as formatCount } from '../components/KpiCharts.jsx';

/** Same title -> DOM-id convention as alis-hub's dashboards (kept in sync manually, not shared — see FloatingSectionNav's doc comment). */
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const JUMP_EVENT = 'alis-product-hub:jump-to-section';

const OVERVIEW_SECTIONS = [
  { category: 'Highlighted', items: ['Escalations', 'Top 3 Enhancements', 'Enhancement Tickets'] },
  { category: 'Everything', items: ['Accounts', 'Portfolio KPIs'] },
];


/** Collapsible white card, same fold/jump pattern as alis-hub's own dashboards — click the title to fold; jumping here from QuickJumpNav/FloatingSectionNav always unfolds it first. */
function SectionCard({ title, description, action, accent, defaultExpanded = true, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const ref = useRef(null);
  const sectionId = slugify(title);

  useEffect(() => {
    function handleJump(e) {
      const isTarget = e.detail?.id === sectionId;
      if (isTarget) {
        setExpanded(true);
        // Wait a couple of frames so every OTHER section's collapse (set
        // below, in their own copy of this same handler) has actually
        // committed and repainted first — scrolling in the same tick would
        // target a position calculated against the old, taller layout
        // (every section still open) and land short.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      } else if (sectionId !== 'overview') {
        // Accordion behavior (Aaron, Sep 2026: "close other sections then
        // expand and navigate") — Overview is exempt since it holds the
        // KPI tiles that dispatch this jump in the first place; collapsing
        // it out from under the tile you just clicked would be jarring.
        setExpanded(false);
      }
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
function StatTile({ label, value, sub, accent, jumpTo, tooltip, wide }) {
  const clickable = Boolean(jumpTo);
  const title = [tooltip, clickable ? `Click to jump to ${jumpTo}` : null].filter(Boolean).join(' — ') || undefined;
  return (
    <button
      type="button"
      onClick={clickable ? () => window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { id: slugify(jumpTo) } })) : undefined}
      disabled={!clickable}
      title={title}
      className={`text-left rounded-xl p-6 border w-full transition-all duration-200 ${wide ? 'sm:col-span-2' : ''} ${
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

/** "Last refreshed"/"Last imported" captions across this app all use this same point-in-time format — Aaron, Sep 2026: "capture the point in time and make clear near refresh button when refresh was last actioned." */
function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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

// 12 data columns + the trailing "expand for key contacts" column.
const ACCOUNT_COLUMNS = 13;

const ACCOUNT_SORT_COLUMNS = [
  { key: 'name', label: 'Company' },
  { key: 'accountManagerName', label: 'Account Manager' },
  { key: 'tier', label: 'Tier' },
  { key: 'arrCents', label: 'ARR' },
  { key: 'communityCount', label: 'Communities', title: "Sum of each account's child-company count in HubSpot" },
  { key: 'totalCapacity', label: 'Capacity', title: "HubSpot's company_total_capacity field — hand-maintained, not a live ALIS pull" },
  { key: 'openDealsCount', label: 'Open Deals', title: 'Deals not yet closed, associated with this account' },
  { key: 'openDealValueCents', label: 'Open Deal Value', title: "Sum of ARR value across this account's open deals" },
  { key: 'arrAddedThisYearCents', label: `ARR Added (${new Date().getFullYear()})`, title: 'Sum of ARR value across deals closed-won this calendar year' },
  { key: 'openEnhancementCount', label: 'Open Enh. Requests', title: 'Open Enhancement Request tickets for this account' },
  { key: 'closedEnhancementCount', label: 'Closed Enh. Requests', title: 'Closed Enhancement Request tickets for this account, last ~13 months' },
  { key: 'lastActivityDate', label: 'Last Activity', title: 'Last time a note, call, email, meeting, or task was logged for this account in HubSpot' },
];

// Tier/ARR/communities/etc. sort numerically low-to-high; everything else
// (company name, AM name, the ISO date string) sorts fine as plain text.
const NUMERIC_ACCOUNT_KEYS = new Set([
  'tier', 'arrCents', 'communityCount', 'totalCapacity', 'openDealsCount', 'openDealValueCents', 'arrAddedThisYearCents',
  'openEnhancementCount', 'closedEnhancementCount',
]);

function compareAccounts(a, b, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  if (NUMERIC_ACCOUNT_KEYS.has(key)) {
    return ((a[key] ?? -Infinity) - (b[key] ?? -Infinity)) * sign;
  }
  return String(a[key] || '').localeCompare(String(b[key] || '')) * sign;
}

/** Clickable column header — click cycles asc -> desc -> unsorted, same as most spreadsheet tools. */
function SortableHeader({ col, sort, onSort }) {
  const active = sort.key === col.key;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      onClick={() => onSort(col.key)}
      title={col.title}
      className="cursor-pointer select-none hover:text-primary-600"
    >
      {col.label}{arrow}
    </th>
  );
}

/** One account row, click-to-expand into its key contacts (fetched from HubSpot on first expand, then cached by the parent). */
function AccountRow({ a, expanded, onToggle, contacts, loading, error }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-neutral-50">
        <td>{a.name}</td>
        <td>{a.accountManagerName || '—'}</td>
        <td>{a.tier ?? '—'}</td>
        <td>{usd(a.arrCents)}</td>
        <td>{a.communityCount ?? '—'}</td>
        <td>{a.totalCapacity ?? '—'}</td>
        <td>{a.openDealsCount ?? 0}</td>
        <td>{usd(a.openDealValueCents)}</td>
        <td>{usd(a.arrAddedThisYearCents)}</td>
        <td>{a.openEnhancementCount ?? 0}</td>
        <td>{a.closedEnhancementCount ?? 0}</td>
        <td>{a.lastActivityDate ? a.lastActivityDate.slice(0, 10) : '—'}</td>
        <td className="text-center text-neutral-400" title="Click to view key contacts">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={ACCOUNT_COLUMNS} className="bg-neutral-50">
            <div className="py-3 px-2 text-sm">
              {loading && <p className="text-neutral-500">Loading contacts…</p>}
              {error && <p className="text-red-600">{error}</p>}
              {!loading && !error && contacts && contacts.length === 0 && (
                <p className="text-neutral-500">No contacts associated with this company in HubSpot.</p>
              )}
              {!loading && contacts && contacts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {contacts.map((c) => (
                    <div key={c.id} className="border border-neutral-200 rounded-lg p-3 bg-white">
                      <div className="font-medium text-primary-900">
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{c.name}</a> : c.name}
                      </div>
                      {c.title && <div className="text-xs text-neutral-500">{c.title}</div>}
                      {c.email && <div className="text-xs text-neutral-600 mt-1">{c.email}</div>}
                      {c.phone && <div className="text-xs text-neutral-600">{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

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
  const { dashboard, refreshDashboard, ensureDashboardLoaded } = useDataCache();
  const { data, loading, error, kpiHistory } = dashboard;
  const [exporting, setExporting] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountSort, setAccountSort] = useState({ key: null, dir: 'asc' });
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [contactsByAccount, setContactsByAccount] = useState({});
  const [contactsLoadingId, setContactsLoadingId] = useState(null);
  const [contactsErrorByAccount, setContactsErrorByAccount] = useState({});

  function handleAccountSort(key) {
    setAccountSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  function toggleAccountContacts(accountId) {
    const opening = expandedAccountId !== accountId;
    setExpandedAccountId(opening ? accountId : null);
    if (opening && !contactsByAccount[accountId]) {
      setContactsLoadingId(accountId);
      getKeyContacts(accountId)
        .then((d) => setContactsByAccount((prev) => ({ ...prev, [accountId]: d.contacts })))
        .catch((err) => setContactsErrorByAccount((prev) => ({ ...prev, [accountId]: err.message })))
        .finally(() => setContactsLoadingId((id) => (id === accountId ? null : id)));
    }
  }

  // Loads once per app session (cached in DataCache.jsx, above the routes,
  // so it survives navigating away and back) rather than on every mount —
  // Aaron, Sep 2026: "I don't like the auto refresh... make the refresh
  // manual and the data cached so it remains available when you toggle
  // between screens." ensureDashboardLoaded no-ops after the first real
  // load, including StrictMode's double-invoke of this same effect.
  useEffect(() => {
    ensureDashboardLoaded();
  }, [ensureDashboardLoaded]);

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

  const sortedAccounts = useMemo(() => {
    if (!accountSort.key) return filteredAccounts;
    return [...filteredAccounts].sort((a, b) => compareAccounts(a, b, accountSort.key, accountSort.dir));
  }, [filteredAccounts, accountSort]);

  const top3Enhancements = useMemo(
    () => (data ? data.requests.filter((r) => r.isOpen && r.isTopThree) : []),
    [data]
  );
  const closedTop3Enhancements = useMemo(
    () => (data ? data.requests.filter((r) => !r.isOpen && r.isTopThree) : []),
    [data]
  );
  const escalations = useMemo(
    () => (data ? data.requests.filter((r) => r.isOpen && r.isEscalation) : []),
    [data]
  );
  const closedEscalations = useMemo(
    () => (data ? data.requests.filter((r) => !r.isOpen && r.isEscalation) : []),
    [data]
  );

  const totalArrCents = useMemo(
    () => (data ? data.companies.reduce((sum, c) => sum + (c.arrCents || 0), 0) : 0),
    [data]
  );
  const totalCommunities = useMemo(
    () => (data ? data.companies.reduce((sum, c) => sum + (c.communityCount || 0), 0) : 0),
    [data]
  );
  const totalCapacityBeds = useMemo(
    () => (data ? data.companies.reduce((sum, c) => sum + (c.totalCapacity || 0), 0) : 0),
    [data]
  );
  const enhancementRequests = useMemo(
    () => (data ? data.requests.filter((r) => r.isOpen && r.isEnhancementRequest) : []),
    [data]
  );
  const closedEnhancementRequests = useMemo(
    () => (data ? data.requests.filter((r) => !r.isOpen && r.isEnhancementRequest) : []),
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
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={refreshDashboard} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn-accent" onClick={handleExport} disabled={!data || exporting}>
              {exporting ? 'Building file…' : 'Export to Excel'}
            </button>
          </div>
          {dashboard.lastRefreshedAt && (
            <p className="text-xs text-neutral-400">Last refreshed {formatTimestamp(dashboard.lastRefreshedAt)}</p>
          )}
        </div>
      </div>

      {error && <div className="notice danger">{error}</div>}

      {loading && !data && (
        <div className="card text-center text-neutral-500 py-16">Pulling live data from HubSpot…</div>
      )}

      {data && (
        <>
          <SectionCard title="Overview" description={`As of ${new Date(data.generatedAt).toLocaleString()}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-6">
              <StatTile label="Portfolio ARR" value={usd(totalArrCents)} jumpTo="Accounts" tooltip="Sum of HubSpot's own company-level ARR field across every account" wide />
              <StatTile label="Accounts" value={data.companies.length} jumpTo="Accounts" tooltip="Every Home Office account in HubSpot" />
              <StatTile label="Communities" value={totalCommunities.toLocaleString()} jumpTo="Accounts" tooltip="Sum of each account's child-company count in HubSpot — one per physical community/location" />
              <StatTile label="Capacity (beds)" value={totalCapacityBeds.toLocaleString()} jumpTo="Accounts" tooltip="Sum of HubSpot's company_total_capacity field — hand-maintained per account, not a live ALIS pull, so treat as directional" />
              <StatTile label="Enhancement Tickets" value={enhancementRequests.length} sub="by category" accent jumpTo="Enhancement Tickets" tooltip="Every active ticket whose HubSpot category is a feature/enhancement request" />
              <StatTile label="Top 3 Enhancements" value={top3Enhancements.length} accent jumpTo="Top 3 Enhancements" tooltip="Tickets an account manager has explicitly staged as one of their account's top 3 priorities" />
              <StatTile label="Escalations" value={escalations.length} accent jumpTo="Escalations" tooltip="Tickets categorized ALIS Escalation ('ALIS Bug' in HubSpot's raw category_2_0 field)" />
            </div>
            <QuickJumpNav sections={OVERVIEW_SECTIONS} />
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
                <thead>
                  <tr>
                    {ACCOUNT_SORT_COLUMNS.map((col) => (
                      <SortableHeader key={col.key} col={col} sort={accountSort} onSort={handleAccountSort} />
                    ))}
                    <th title="Click a row to view key contacts"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.slice(0, 50).map((a) => (
                    <AccountRow
                      key={a.id}
                      a={a}
                      expanded={expandedAccountId === a.id}
                      onToggle={() => toggleAccountContacts(a.id)}
                      contacts={contactsByAccount[a.id]}
                      loading={contactsLoadingId === a.id}
                      error={contactsErrorByAccount[a.id]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAccounts.length > 50 && (
              <p className="text-xs text-neutral-400 mt-2">Showing 50 of {filteredAccounts.length} — narrow your search.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Portfolio KPIs"
            description="ARR, accounts, and communities broken down by Client Tier, portfolio-wide — each with a trend built from one snapshot captured per day."
            defaultExpanded={false}
          >
            <KpiTierSection
              title="ARR by Tier" metricKey="arrCents" name="ARR"
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={usd}
            />
            <KpiTierSection
              title="Companies by Tier" metricKey="companyCount" name="Companies"
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <KpiTierSection
              title="Communities by Tier" metricKey="communityCount" name="Communities"
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <ArrBandSection current={data.kpi} arrBandHistory={kpiHistory.arrBand} />
            <KpiTierSection
              title={`ARR Added (${new Date().getFullYear()}) by Tier`} metricKey="arrAddedThisYearCents" name="ARR Added"
              description="Sum of ARR value across deals closed-won this calendar year, by tier."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={usd}
            />
            <KpiTierSection
              title={`Companies Added (${new Date().getFullYear()}) by Tier`} metricKey="companiesAddedThisYear" name="Companies Added"
              description="Accounts whose HubSpot Home Office record was created this calendar year, by tier."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <KpiTierSection
              title={`Communities Added (${new Date().getFullYear()}) by Tier`} metricKey="communitiesAddedThisYear" name="Communities Added"
              description="Approximation: current community count of accounts created this calendar year — a community added mid-year to an older account isn't counted, since communities don't carry their own add date."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
          </SectionCard>

          <SectionCard
            title="Top 3 Enhancements"
            description="Every ticket staged as one of an account's Top 3 Enhancement asks — the requests carrying the most explicit account-level priority signal available."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(top3Enhancements, 'Top 3 Enhancements', data.generatedAt)} />}
          >
            <EnhancementCharts openItems={top3Enhancements} closedItems={closedTop3Enhancements} topThreeOnly />
            <RequestsTable requests={top3Enhancements} emptyLabel="No tickets currently staged as Top 3 Enhancements." />
          </SectionCard>

          <SectionCard
            title="Escalations"
            description="Every ticket categorized as an ALIS Escalation, portfolio-wide."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(escalations, 'Escalations', data.generatedAt)} />}
          >
            <EscalationCharts openItems={escalations} closedItems={closedEscalations} />
            <RequestsTable requests={escalations} emptyLabel="No open escalations right now." />
          </SectionCard>

          <SectionCard
            title="Enhancement Tickets"
            description="Every ticket categorized as a feature/enhancement request, portfolio-wide — broader than Top 3 Enhancements above."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(enhancementRequests, 'Enhancement Tickets', data.generatedAt)} />}
          >
            <EnhancementCharts openItems={enhancementRequests} closedItems={closedEnhancementRequests} />
            <RequestsTable requests={enhancementRequests} emptyLabel="No enhancement requests right now." />
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
