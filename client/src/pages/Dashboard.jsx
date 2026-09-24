import { useEffect, useMemo, useRef, useState } from 'react';
import { getKeyContacts, getPortfolioEntitlementsStatus } from '../api.js';
import { useDataCache } from '../DataCache.jsx';
import { exportDataToExcel, exportAccountsToExcel, exportRequestsToExcel, exportProjectsToExcel, exportKeyContactsToExcel, exportDashboardToPdf, exportEntitlementsToExcel } from '../utils/dataExport.js';
import FloatingSectionNav from '../components/FloatingSectionNav.jsx';
import BackToTopButton from '../components/BackToTopButton.jsx';
import { EscalationCharts, EnhancementCharts } from '../components/TicketCharts.jsx';
import { KpiTierSection, ArrBandSection, AverageMetricSection, TIER_ORDER, TIER_COLOR, count as formatCount } from '../components/KpiCharts.jsx';
import TierFilterPills, { filterByTier } from '../components/TierFilterPills.jsx';
import OnboardingSection from '../components/OnboardingSection.jsx';
import KeyContactsSection from '../components/KeyContactsSection.jsx';
import PortfolioEntitlementsSection from '../components/PortfolioEntitlementsSection.jsx';
import { CategoryMixSection, ModuleSection } from '../components/CategoryCharts.jsx';
import PinnedNoteBody from '../components/PinnedNote.jsx';
import AlisQuickLinks from '../components/AlisQuickLinks.jsx';

/** Same title -> DOM-id convention as alis-hub's dashboards (kept in sync manually, not shared — see FloatingSectionNav's doc comment). */
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const JUMP_EVENT = 'alis-product-hub:jump-to-section';

// Same buckets and section names as alis-hub's Account Health / Team AM
// menus (Aaron, Sep 2026: "standardize the menu and the naming
// conventions"), alphabetized at build time like theirs so a new section
// can't drift out of order.
const OVERVIEW_SECTIONS = [
  { category: 'Accounts', items: ['Accounts', 'Key Contacts', 'Onboarding', 'Portfolio Entitlements', 'Portfolio KPIs'].sort((a, b) => a.localeCompare(b)) },
  { category: 'Tickets', items: ['Enhancement Requests', 'Enhancement Requests: Top 3', 'Tickets by Category Closed', 'Tickets by Category Open', 'Tickets by Module', 'Tickets: Escalation'].sort((a, b) => a.localeCompare(b)) },
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
        <td>
          <span className="font-semibold text-neutral-900">{a.name}</span>
          <AlisQuickLinks companyHost={a.companyHost} alisAdminCompanyId={a.alisAdminCompanyId} className="ml-1.5 align-middle" />
        </td>
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
                <p className="text-neutral-500">No contacts tagged with a key role (Account Owner, Decision Maker, Billing/Clinical/Sales Admin, etc.) for this company in HubSpot.</p>
              )}
              {!loading && contacts && contacts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {contacts.map((c) => (
                    <div key={c.id} className="border border-neutral-200 rounded-lg p-3 bg-white">
                      <div className="font-medium text-primary-900">
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{c.name}</a> : c.name}
                      </div>
                      {c.roles?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.roles.map((role) => (
                            <span key={role} className="text-[11px] px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200">{role}</span>
                          ))}
                        </div>
                      )}
                      {c.title && <div className="text-xs text-neutral-500 mt-1">{c.title}</div>}
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
        <td>
          {r.companyName || '—'}
          <AlisQuickLinks companyHost={r.companyHost} alisAdminCompanyId={r.alisAdminCompanyId} className="ml-1.5 align-middle" />
        </td>
        <td>{r.accountManagerName || '—'}</td>
        <td>{r.category || '—'}</td>
        <td>{r.tier ?? '—'}</td>
        <td>{usd(r.arrCents)}</td>
        <td className="max-w-[240px] truncate" title={r.subject}>
          {r.pinnedNote && <span className="text-[10px] font-semibold text-accent-600 mr-1" title="Has a pinned note — expand to read">NOTE</span>}
          {r.subject}
        </td>
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
                <div><span className="text-neutral-400">ALIS Module:</span> {r.module || <span className="text-accent-600">Not set{r.moduleInferred ? ` (suggested: ${r.moduleInferred})` : ''}</span>}</div>
                {r.isEnhancementRequest && <div><span className="text-neutral-400">Focus:</span> {r.enhancementFocus || 'Not set'}</div>}
                {r.url && <div><a href={r.url} target="_blank" rel="noreferrer">Open in HubSpot &rarr;</a></div>}
              </div>
              <PinnedNoteBody segments={r.pinnedNoteSegments} text={r.pinnedNote} className="mt-3" />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * App-wide table standard (Sep 2026, Aaron: "would love this to be the
 * standard around the apps — columns can sort via their column title and
 * where appropriate there should be filter pills that can be multiselected
 * to filter for specific combos of data"). `sortKey` is a data field name
 * (or null for columns that don't make sense to sort, like the expand
 * arrow); clicking cycles asc → desc → off. Active column gets an arrow.
 */
function SortableTh({ label, sortKey, sort, onSort, className = '' }) {
  if (!sortKey) return <th className={className}></th>;
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none hover:text-neutral-700 ${className}`}
      title={`Sort by ${label}`}
    >
      {label}{active && <span className="ml-1">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

/**
 * Multiselect filter pills (Sep 2026, Aaron, same request) — unlike the
 * older single-select Tier pill row (click one to isolate it, click again
 * to clear), any number of pills can be active at once: "Tier 1 + Tier 2"
 * or "High + Urgent priority" narrows to the union of whichever are
 * toggled on, empty selection means no filter. `counts` are computed
 * against the search-filtered-but-not-yet-pill-filtered set, same
 * "shows what you'd actually get" convention as the old single-select
 * pills, so a pill's own count updates as other pills/search narrow the
 * list, but never against itself.
 */
function MultiSelectPills({ options, selected, onToggle, onClear }) {
  const visible = options.filter((o) => o.count > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {visible.map((o) => {
        const active = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              active ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
            }`}
          >
            {o.label} ({o.count})
          </button>
        );
      })}
      {selected.size > 0 && (
        <button type="button" onClick={onClear} className="text-xs text-neutral-400 hover:text-neutral-600 underline">
          Clear filter
        </button>
      )}
    </div>
  );
}

function compareValues(av, bv, dir) {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'string') return av.localeCompare(bv) * dir;
  return (av - bv) * dir;
}

/**
 * Shared table for every request list on this page — Top 3 Enhancements,
 * Escalations, and Active Requests all render through this so search,
 * sort, filters, and the expand behavior can't drift between sections.
 * `search` (when `showSearch`) matches company, account manager, issue
 * type (category), and subject — the four things you'd actually go
 * looking for a ticket by. Tier and Priority get multiselect pills — both
 * are small fixed sets, unlike Stage/Company which vary too much per
 * pipeline/account to make good pill candidates.
 */
function RequestsTable({ requests, emptyLabel, showSearch = true, limit = 50 }) {
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  const [tierFilter, setTierFilter] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());

  function toggleSort(key) {
    setSort((prev) => (prev.key !== key ? { key, direction: 'asc' } : { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }));
  }
  function toggleInSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      r.companyName?.toLowerCase().includes(q) ||
      r.accountManagerName?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q) ||
      r.module?.toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q) ||
      r.pinnedNote?.toLowerCase().includes(q)
    );
  }, [requests, search]);

  const tierOptions = useMemo(() => {
    const byTier = new Map();
    for (const r of searchFiltered) {
      const key = (r.tier == null || r.tier === 0) ? 'Unassigned' : `Tier ${r.tier}`;
      byTier.set(key, (byTier.get(key) || 0) + 1);
    }
    return ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'].map((t) => ({ value: t, label: t, count: byTier.get(t) || 0 }));
  }, [searchFiltered]);

  const priorityOptions = useMemo(() => {
    const byPriority = new Map();
    for (const r of searchFiltered) {
      const key = r.priority || 'None';
      byPriority.set(key, (byPriority.get(key) || 0) + 1);
    }
    return [...byPriority.entries()].map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count);
  }, [searchFiltered]);

  const pillFiltered = useMemo(() => {
    return searchFiltered.filter((r) => {
      if (tierFilter.size > 0) {
        const key = (r.tier == null || r.tier === 0) ? 'Unassigned' : `Tier ${r.tier}`;
        if (!tierFilter.has(key)) return false;
      }
      if (priorityFilter.size > 0 && !priorityFilter.has(r.priority || 'None')) return false;
      return true;
    });
  }, [searchFiltered, tierFilter, priorityFilter]);

  const filtered = useMemo(() => {
    if (!sort.key) return pillFiltered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...pillFiltered].sort((a, b) => compareValues(a[sort.key], b[sort.key], dir));
  }, [pillFiltered, sort]);

  if (requests.length === 0) {
    return <p className="text-sm text-neutral-500 py-4">{emptyLabel}</p>;
  }

  return (
    <>
      {showSearch && (
        <input
          placeholder="Search company, account manager, issue type, module, subject, or pinned note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-4"
        />
      )}
      <MultiSelectPills
        options={tierOptions}
        selected={tierFilter}
        onToggle={(v) => toggleInSet(setTierFilter, v)}
        onClear={() => setTierFilter(new Set())}
      />
      <MultiSelectPills
        options={priorityOptions}
        selected={priorityFilter}
        onToggle={(v) => toggleInSet(setPriorityFilter, v)}
        onClear={() => setPriorityFilter(new Set())}
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">No requests match that search/filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <SortableTh label="Company" sortKey="companyName" sort={sort} onSort={toggleSort} />
                <SortableTh label="Account Manager" sortKey="accountManagerName" sort={sort} onSort={toggleSort} />
                <SortableTh label="Issue Type" sortKey="category" sort={sort} onSort={toggleSort} />
                <SortableTh label="Tier" sortKey="tier" sort={sort} onSort={toggleSort} />
                <SortableTh label="ARR" sortKey="arrCents" sort={sort} onSort={toggleSort} />
                <SortableTh label="Subject" sortKey="subject" sort={sort} onSort={toggleSort} />
                <SortableTh label="Stage" sortKey="stage" sort={sort} onSort={toggleSort} />
                <SortableTh label="Priority" sortKey="priority" sort={sort} onSort={toggleSort} />
                <SortableTh label="Age" sortKey="ageDays" sort={sort} onSort={toggleSort} />
                <th></th>
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
  const [accountTierFilter, setAccountTierFilter] = useState(() => new Set());
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

  // Fed by PortfolioEntitlementsSection's onRollupChange once that section
  // has fetched a rollup at least once — used only for that SectionCard's
  // own header export button (Sep 2026, Aaron: "move the Export to Excel
  // button to the right in line with the other sections"). The main
  // toolbar Export to Excel/PDF buttons below fetch this fresh themselves
  // instead of reading this state, so they still include entitlements even
  // if this section has never been expanded (its child, and this callback,
  // don't mount until the section is opened at least once).
  const [entitlementsRollup, setEntitlementsRollup] = useState(null);

  // Loads once per app session (cached in DataCache.jsx, above the routes,
  // so it survives navigating away and back) rather than on every mount —
  // Aaron, Sep 2026: "I don't like the auto refresh... make the refresh
  // manual and the data cached so it remains available when you toggle
  // between screens." ensureDashboardLoaded no-ops after the first real
  // load, including StrictMode's double-invoke of this same effect.
  useEffect(() => {
    ensureDashboardLoaded();
  }, [ensureDashboardLoaded]);

  /** Best-effort — the Portfolio Entitlements check is separate/manual (Sep 2026, Aaron: "make sure the Portfolio entitlements are... rolled up into the Dashboard exportables"); a failed fetch here shouldn't block the rest of the export, it just means that sheet/section is skipped. */
  async function fetchEntitlementsRollup() {
    try {
      const status = await getPortfolioEntitlementsStatus();
      return status.rollup;
    } catch {
      return null;
    }
  }

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      const entitlementsRollup = await fetchEntitlementsRollup();
      await exportDataToExcel({ ...data, entitlementsRollup });
    } finally {
      setExporting(false);
    }
  }

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState('');
  async function handleExportPdf() {
    if (!data) return;
    setExportingPdf(true);
    setPdfExportError('');
    try {
      const entitlementsRollup = await fetchEntitlementsRollup();
      await exportDashboardToPdf({ ...data, entitlementsRollup });
    } catch (err) {
      setPdfExportError(err.message);
    } finally {
      setExportingPdf(false);
    }
  }

  const searchFilteredAccounts = useMemo(() => {
    if (!data) return [];
    const q = accountSearch.trim().toLowerCase();
    if (!q) return data.companies;
    return data.companies.filter((a) =>
      a.name?.toLowerCase().includes(q) || a.accountManagerName?.toLowerCase().includes(q)
    );
  }, [data, accountSearch]);

  const filteredAccounts = useMemo(
    () => filterByTier(searchFilteredAccounts, accountTierFilter),
    [searchFilteredAccounts, accountTierFilter]
  );

  const sortedAccounts = useMemo(() => {
    if (!accountSort.key) return filteredAccounts;
    return [...filteredAccounts].sort((a, b) => compareAccounts(a, b, accountSort.key, accountSort.dir));
  }, [filteredAccounts, accountSort]);

  // Scoped to tickets on active Home Office accounts, same as alis-hub's
  // Tickets by Category (which pulls tickets per Home Office) — excludes
  // unassociated tickets, ones linked only to a community record, and
  // inactive (Tier 0/blank, no ARR) accounts. Every other ticket bucket
  // below (Enhancement Requests, Top 3, Escalations) now derives from this
  // instead of raw `data.requests` (Sep 2026, Aaron: "why does the AM
  // dashboard capture 157 Enhancement requests AND the Product hub
  // Dashboard has 560" — `data.requests` covers every Home Office
  // export.js pulled tickets for, including the ~228 inactive ones this
  // dashboard's own Accounts table already hides; those buckets were
  // counting inactive-account tickets that alis-hub's Team AM never
  // counted in the first place, not double-counting or a scope mismatch).
  const accountTickets = useMemo(() => {
    if (!data) return [];
    const activeIds = new Set(data.companies.map((c) => c.id));
    return data.requests.filter((r) => r.companyId && activeIds.has(r.companyId));
  }, [data]);
  const openTickets = useMemo(() => accountTickets.filter((r) => r.isOpen), [accountTickets]);
  const closedTickets = useMemo(() => accountTickets.filter((r) => !r.isOpen), [accountTickets]);

  const top3Enhancements = useMemo(() => accountTickets.filter((r) => r.isOpen && r.isTopThree), [accountTickets]);
  const closedTop3Enhancements = useMemo(() => accountTickets.filter((r) => !r.isOpen && r.isTopThree), [accountTickets]);
  const escalations = useMemo(() => accountTickets.filter((r) => r.isOpen && r.isEscalation), [accountTickets]);
  const closedEscalations = useMemo(() => accountTickets.filter((r) => !r.isOpen && r.isEscalation), [accountTickets]);

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
  const enhancementRequests = useMemo(() => accountTickets.filter((r) => r.isOpen && r.isEnhancementRequest), [accountTickets]);
  // alis-hub's own headline "Enhancement Requests" KPI number is narrower
  // than the full category-based `enhancementRequests` bucket above — only
  // tickets actually staged Top 3 or Long-Term Projects count toward it
  // (confirmed live against Team AM, Sep 2026: its "157" tile = exactly
  // top3Enhancements.length + longTermEnhancements.length, with every other
  // open Enhancement-categorized-but-unstaged ticket called out separately
  // as "N other open" rather than folded into the headline). The full
  // `enhancementRequests` list/section below is unchanged and still shows
  // everything category-matched — only this Overview stat tile is scoped
  // down to match what Team AM's own headline number actually counts.
  const longTermEnhancements = useMemo(() => accountTickets.filter((r) => r.isOpen && r.isLongTermEnhancement && !r.isTopThree), [accountTickets]);
  const stagedEnhancements = useMemo(() => accountTickets.filter((r) => r.isOpen && (r.isTopThree || r.isLongTermEnhancement)), [accountTickets]);
  const closedStagedEnhancements = useMemo(() => accountTickets.filter((r) => !r.isOpen && (r.isTopThree || r.isLongTermEnhancement)), [accountTickets]);
  const otherOpenEnhancements = useMemo(
    () => enhancementRequests.filter((r) => !r.isTopThree && !r.isLongTermEnhancement),
    [enhancementRequests]
  );
  const openEscalationsMissingModule = useMemo(() => escalations.filter((r) => !r.module), [escalations]);
  const unassignedCompanies = useMemo(
    () => (data ? data.companies.filter((c) => c.tier == null || c.tier === 0) : []),
    [data]
  );
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-xl">
            Every client, straight from HubSpot, no scoring applied — cached and ready the moment you open this. Browse it here, or export it to plug into
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
            <button className="btn-secondary" onClick={handleExportPdf} disabled={!data || exportingPdf}>
              {exportingPdf ? 'Building PDF…' : 'Export to PDF'}
            </button>
          </div>
          {dashboard.lastRefreshedAt && (
            <p className="text-xs text-neutral-400">Last refreshed {formatTimestamp(dashboard.lastRefreshedAt)}</p>
          )}
          {pdfExportError && <p className="text-xs text-red-600 max-w-xs text-right">{pdfExportError}</p>}
        </div>
      </div>

      {error && (
        <div className="notice danger flex items-center justify-between gap-4">
          <span>{error}</span>
          {!data && (
            <button className="btn-secondary shrink-0" onClick={refreshDashboard}>Retry</button>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="card text-center text-neutral-500 py-16">Pulling live data from HubSpot…</div>
      )}

      {!loading && !error && !data && (
        <div className="card text-center text-neutral-500 py-16">
          <p className="mb-3">Nothing loaded yet.</p>
          <button className="btn-secondary" onClick={refreshDashboard}>Load data</button>
        </div>
      )}

      {data && (
        <>
          <SectionCard
            title="Overview"
            description={`As of ${new Date(data.generatedAt).toLocaleString()} — portfolio-wide KPI tiles (ARR, Accounts, Communities, Capacity, Enhancement Requests, Escalations) plus a jump menu to every section below, grouped by Accounts/Tickets.`}
            defaultExpanded={false}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-6">
              <StatTile label="Portfolio ARR" value={usd(totalArrCents)} jumpTo="Accounts" tooltip="Sum of HubSpot's own company-level ARR field across every account" wide />
              <StatTile label="Accounts" value={data.companies.length} jumpTo="Accounts" tooltip="Every Home Office account in HubSpot" />
              <StatTile label="Communities" value={totalCommunities.toLocaleString()} jumpTo="Accounts" tooltip="Sum of each account's child-company count in HubSpot — one per physical community/location" />
              <StatTile label="Capacity (beds)" value={totalCapacityBeds.toLocaleString()} jumpTo="Accounts" tooltip="Sum of HubSpot's company_total_capacity field — hand-maintained per account, not a live ALIS pull, so treat as directional" />
              <StatTile
                label="Enhancement Requests"
                value={stagedEnhancements.length}
                sub={`${top3Enhancements.length} Top 3 · ${longTermEnhancements.length} Long-Term · ${otherOpenEnhancements.length} other open`}
                accent
                jumpTo="Enhancement Requests"
                tooltip="Tickets staged Top 3 or Long-Term Projects — same headline figure Team AM/Account Health count. The Enhancement Requests section below also lists every other open ticket categorized Enhancement / Feature Request that hasn't been staged into either yet."
              />
              <StatTile label="Enhancement Requests: Top 3" value={top3Enhancements.length} accent jumpTo="Enhancement Requests: Top 3" tooltip="Tickets an account manager has explicitly staged as one of their account's top 3 priorities" />
              <StatTile label="Tickets: Escalation" value={escalations.length} accent jumpTo="Tickets: Escalation" tooltip="Tickets categorized ALIS Escalation ('ALIS Bug' in HubSpot's raw category_2_0 field)" />
            </div>
            <QuickJumpNav sections={OVERVIEW_SECTIONS} />
          </SectionCard>

          <SectionCard
            title="Accounts"
            description={`Every active Home Office account, its account manager, tier, and ARR — search to narrow.${data.inactiveCompanyCount ? ` ${data.inactiveCompanyCount} inactive accounts (Tier 0/blank with no ARR) are hidden.` : ''}`}
            action={<SectionExportButton onExport={() => exportAccountsToExcel(filteredAccounts, data.generatedAt)} />}
          >
            <input
              placeholder="Search by company or account manager…"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="w-full mb-3"
            />
            <TierFilterPills accounts={searchFilteredAccounts} tierFilter={accountTierFilter} onChange={setAccountTierFilter} />
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
            title="Key Contacts"
            description="Every contact tagged with a key HubSpot association-label role, portfolio-wide — who to actually call at each account."
            defaultExpanded={false}
          >
            <KeyContactsSection companies={data.companies} onExport={(rows) => exportKeyContactsToExcel(rows, data.generatedAt)} />
          </SectionCard>

          <SectionCard
            title="Portfolio Entitlements"
            description="What percentage of live ALIS environments have each entitlement turned on — a manual, on-demand check (not part of the regular Refresh) across every account with an ALIS Admin Company ID on file."
            defaultExpanded={false}
            action={entitlementsRollup?.categories?.length > 0 && (
              <SectionExportButton onExport={() => exportEntitlementsToExcel(entitlementsRollup, new Date().toISOString())} />
            )}
          >
            <PortfolioEntitlementsSection
              companies={data.companies}
              alisAdminIdCount={data.companies.filter((c) => c.alisAdminCompanyId).length}
              onRollupChange={setEntitlementsRollup}
            />
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
              title={`New ARR (${new Date().getFullYear()}) by Tier`} metricKey="arrAddedThisYearCents" name="ARR Added"
              description="Sum of ARR value across deals closed-won this calendar year, by tier."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={usd}
            />
            <KpiTierSection
              title="Companies by Tier" metricKey="companyCount" name="Companies"
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <KpiTierSection
              title={`Companies Contributing ARR (${new Date().getFullYear()}) by Tier`} metricKey="companiesContributingArrThisYear" name="Companies"
              description="Accounts with at least one deal closed-won this calendar year carrying ARR, by tier."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <KpiTierSection
              title="Communities by Tier" metricKey="communityCount" name="Communities"
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <KpiTierSection
              title={`Communities Contributing ARR (${new Date().getFullYear()}) by Tier`} metricKey="communitiesContributingArrThisYear" name="Communities"
              description="Approximation: current community count of the accounts above — deals attach to the Home Office, not the individual community, so which communities a deal covered isn't tracked."
              current={data.kpi} tierHistory={kpiHistory.tier} formatValue={formatCount}
            />
            <ArrBandSection current={data.kpi} arrBandHistory={kpiHistory.arrBand} />
            <AverageMetricSection
              title="Average ARR per Company by Tier" numeratorKey="arrCents" denominatorKey="companyCount"
              buckets={data.kpi.byTier} history={kpiHistory.tier} scopeKeys={TIER_ORDER} colorFor={(t) => TIER_COLOR[t]} formatValue={usd}
            />
            <AverageMetricSection
              title="Average ARR per Community by Tier" numeratorKey="arrCents" denominatorKey="communityCount"
              buckets={data.kpi.byTier} history={kpiHistory.tier} scopeKeys={TIER_ORDER} colorFor={(t) => TIER_COLOR[t]} formatValue={usd}
            />
            <AverageMetricSection
              title="Average Capacity (beds) per Community by Tier" numeratorKey="totalCapacityBeds" denominatorKey="communityCount"
              description="Average community size, by tier — beds per community, not per company."
              buckets={data.kpi.byTier} history={kpiHistory.tier} scopeKeys={TIER_ORDER} colorFor={(t) => TIER_COLOR[t]} formatValue={formatCount}
            />

            <div className="mt-2">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="font-semibold text-primary-900 text-sm">Unassigned Companies ({unassignedCompanies.length})</h3>
                <SectionExportButton onExport={() => exportAccountsToExcel(unassignedCompanies, data.generatedAt)} />
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Accounts with ARR but no Client Tier set in HubSpot — these need a tier assigned.
                Accounts with neither a tier nor ARR are treated as inactive and hidden app-wide.
              </p>
              {unassignedCompanies.length === 0 ? (
                <p className="text-sm text-neutral-500 italic">Every account currently has a tier set.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr><th>Company</th><th>Account Manager</th><th>ARR</th><th>Communities</th><th>Created</th></tr>
                    </thead>
                    <tbody>
                      {unassignedCompanies.slice(0, 50).map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td>{c.accountManagerName || '—'}</td>
                          <td>{usd(c.arrCents)}</td>
                          <td>{c.communityCount ?? '—'}</td>
                          <td>{c.createdAt ? c.createdAt.slice(0, 10) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {unassignedCompanies.length > 50 && (
                    <p className="text-xs text-neutral-400 mt-2">Showing 50 of {unassignedCompanies.length} — export for the full list.</p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Enhancement Requests: Top 3"
            description="Every ticket staged as one of an account's Top 3 Enhancement asks — the requests carrying the most explicit account-level priority signal available."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(top3Enhancements, 'Enhancement Requests Top 3', data.generatedAt)} />}
          >
            <EnhancementCharts openItems={top3Enhancements} closedItems={closedTop3Enhancements} topThreeOnly />
            <RequestsTable requests={top3Enhancements} emptyLabel="No tickets currently staged as Top 3 Enhancements." />
          </SectionCard>

          <SectionCard
            title="Tickets: Escalation"
            description="Every ticket categorized as an ALIS Escalation, portfolio-wide."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(escalations, 'Tickets Escalation', data.generatedAt)} />}
          >
            <EscalationCharts openItems={escalations} closedItems={closedEscalations} />
            <RequestsTable requests={escalations} emptyLabel="No open escalations right now." />
          </SectionCard>

          <SectionCard
            title="Tickets by Module"
            description="Escalations by HubSpot's ALIS Module field — open vs. closed, split by tier — plus every open escalation still missing a module."
            accent
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(openEscalationsMissingModule, 'Escalations Missing Module', data.generatedAt)} />}
          >
            <ModuleSection openItems={escalations} closedItems={closedEscalations} />
            <h3 className="font-semibold text-primary-900 text-sm mb-1">Open Escalations Missing a Module ({openEscalationsMissingModule.length})</h3>
            <p className="text-xs text-neutral-500 mb-3">Open in HubSpot and set ALIS Module so these show up in the chart above. Export includes just this list.</p>
            <RequestsTable requests={openEscalationsMissingModule} emptyLabel="Every open escalation has a module set." />
          </SectionCard>

          <SectionCard
            title="Enhancement Requests"
            description={`Tickets staged Top 3 or Long-Term Projects, portfolio-wide — the same ${stagedEnhancements.length} figure as the Enhancement Requests KPI tile above.`}
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(stagedEnhancements, 'Enhancement Requests', data.generatedAt)} />}
          >
            <EnhancementCharts openItems={stagedEnhancements} closedItems={closedStagedEnhancements} />
            <RequestsTable requests={stagedEnhancements} emptyLabel="No staged enhancement requests right now." />
          </SectionCard>

          <SectionCard
            title="Tickets by Category Open"
            description="Every open ticket on an active Home Office account — bars drill into enhancement requests by focus and tier; pie shows the full category mix."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(openTickets, 'Tickets Open', data.generatedAt)} />}
          >
            <CategoryMixSection items={openTickets} status="open" />
          </SectionCard>

          <SectionCard
            title="Tickets by Category Closed"
            description="Every ticket on an active Home Office account closed in the ~13-month lookback — same breakdown as the open view."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportRequestsToExcel(closedTickets, 'Tickets Closed', data.generatedAt)} />}
          >
            <CategoryMixSection items={closedTickets} status="closed" />
          </SectionCard>

          <SectionCard
            title="Onboarding"
            description="Implementation-tracked deals, portfolio-wide — every deal HubSpot has a Project Status on, open or closed."
            defaultExpanded={false}
            action={<SectionExportButton onExport={() => exportProjectsToExcel(data.implementationProjects, data.generatedAt)} />}
          >
            <OnboardingSection projects={data.implementationProjects} />
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
