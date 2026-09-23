import { Fragment, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import PinnedNoteBody from './PinnedNote.jsx';

/**
 * "Onboarding" — implementation-tracked deals, portfolio-wide, ported from
 * alis-hub's TeamAmDashboard.jsx ImplementationProjectsSection/
 * OnboardingVolumeChart (Aaron, Sep 2026: "port over the full Team AM
 * dashboard Onboarding section -- this could be helpful for the product
 * team too"). Only deals HubSpot has a Project Status on — tracking only
 * started around mid-2025 there, so older deals won't show up here either.
 * Rows already carry company context (companyName/tier/accountManagerName)
 * from server/api/export.js's withProjectCompanyContext, so this needs no
 * flatten-across-accounts step the way alis-hub's version does.
 */

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };
const RAG_SORT_WEIGHT = { red: 0, amber: 1, green: 2 };
const RAG_COLOR = { red: '#dc2626', amber: '#ea580c', green: '#16a34a' };

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}
function daysSince(iso) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
}

function SortableHeader({ label, column, sort, onSort }) {
  const active = sort?.column === column;
  return (
    <th className="pb-2 pr-4 cursor-pointer select-none hover:text-neutral-700" onClick={() => onSort(column)}>
      {label}{active && <span className="ml-1">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

/**
 * Two metrics over the same trailing-12-months creation-month bucketing —
 * "Total Open Projects" (default) is pre-filtered to currently-open
 * projects, so it reads as the age distribution of the live backlog;
 * "Projects Started" is a plain per-month count of every tracked project.
 * Ported verbatim from alis-hub's computeProjectVolumeSeriesByTier.
 */
function computeProjectVolumeSeriesByTier(items, cumulative = false) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1)));

  const running = { total: 0 };
  if (cumulative) {
    for (const p of items) {
      if (!p.createdAt || new Date(p.createdAt) >= months[0]) continue;
      running.total += 1;
      const t = tierLabel(p.tier);
      running[t] = (running[t] || 0) + 1;
    }
  }

  return months.map((monthStart) => {
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const counts = { total: 0 };
    for (const p of items) {
      if (!p.createdAt) continue;
      const d = new Date(p.createdAt);
      if (d < monthStart || d > monthEnd) continue;
      counts.total += 1;
      const t = tierLabel(p.tier);
      counts[t] = (counts[t] || 0) + 1;
    }
    if (!cumulative) return { label, ...counts };
    for (const [k, v] of Object.entries(counts)) running[k] = (running[k] || 0) + v;
    return { label, ...running };
  });
}

const PROJECT_VOLUME_METRICS = [
  { key: 'open', label: 'Total Open Projects', verb: 'open' },
  { key: 'started', label: 'Projects Started', verb: 'started' },
];

function OnboardingVolumeChart({ allProjects, openProjects }) {
  const [metric, setMetric] = useState('open');
  const [byTier, setByTier] = useState(false);
  const activeMetric = PROJECT_VOLUME_METRICS.find((m) => m.key === metric);
  const items = metric === 'open' ? openProjects : allProjects;
  const data = useMemo(() => computeProjectVolumeSeriesByTier(items, metric === 'open'), [items, metric]);
  const tierKeys = useMemo(() => TIER_ORDER.filter((t) => data.some((d) => d[t] > 0)), [data]);

  const closedProjects = useMemo(() => allProjects.filter((p) => !p.isOpen), [allProjects]);
  const showClosedOverlay = !byTier;
  const combinedData = useMemo(() => {
    if (!showClosedOverlay) return data;
    const closedMonthly = computeProjectVolumeSeriesByTier(closedProjects, false);
    return data.map((row, i) => ({ ...row, closed: closedMonthly[i]?.total ?? 0 }));
  }, [data, closedProjects, showClosedOverlay]);

  if (allProjects.length === 0) {
    return <p className="text-sm text-neutral-500 italic">No implementation-tracked deals yet.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
          {activeMetric.label} <span className="font-normal normal-case text-neutral-400">(trailing 12 months)</span>
        </h4>
        <div className="flex items-center gap-2">
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1">
            {PROJECT_VOLUME_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button
            onClick={() => setByTier((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${byTier ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
          >
            {byTier ? '← Show Total' : 'Break Out by Tier'}
          </button>
        </div>
      </div>
      {items.length === 0 && !(showClosedOverlay && closedProjects.length > 0) ? (
        <p className="text-sm text-neutral-500 italic">No {activeMetric.verb} projects to chart.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={combinedData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            {byTier ? (
              <>
                <Legend />
                {tierKeys.map((t) => (
                  <Line key={t} type="monotone" dataKey={t} name={t} stroke={TIER_COLOR[t] || '#737373'} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </>
            ) : (
              <>
                {showClosedOverlay && <Legend />}
                <Line type="monotone" dataKey="total" name={activeMetric.label} stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                  <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 600, fill: '#1e293b' }} />
                </Line>
                {showClosedOverlay && (
                  <Line type="monotone" dataKey="closed" name="Closed Projects (that month)" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                    <LabelList dataKey="closed" position="bottom" style={{ fontSize: 11, fontWeight: 600, fill: '#1e293b' }} />
                  </Line>
                )}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
  );
}

export default function OnboardingSection({ projects }) {
  const [sort, setSort] = useState(null);
  const [hideClosed, setHideClosed] = useState(true);
  const [noteOpenId, setNoteOpenId] = useState(null);

  const openProjects = useMemo(() => projects.filter((p) => p.isOpen), [projects]);
  const avgDaysOpen = openProjects.length > 0
    ? Math.round(openProjects.reduce((s, p) => s + (daysSince(p.createdAt) || 0), 0) / openProjects.length)
    : null;
  const tierCounts = TIER_ORDER
    .map((t) => ({ label: t, count: openProjects.filter((p) => tierLabel(p.tier) === t).length }))
    .filter((t) => t.count > 0);

  function toggleSort(column) {
    setSort((prev) => (prev?.column === column ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' }));
  }

  const sorted = useMemo(() => {
    if (sort) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      return [...projects].sort((a, b) => {
        const av = a[sort.column];
        const bv = b[sort.column];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
    }
    // Default: open before closed; open sorted worst-first (Red, then
    // Amber, then Green/unset), then soonest Projected Go-Live.
    return [...projects].sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      if (a.isOpen) {
        const ragDiff = (RAG_SORT_WEIGHT[a.projectHealthRag] ?? 3) - (RAG_SORT_WEIGHT[b.projectHealthRag] ?? 3);
        if (ragDiff !== 0) return ragDiff;
        const aDate = a.projectedGoLiveDate ? new Date(a.projectedGoLiveDate) : null;
        const bDate = b.projectedGoLiveDate ? new Date(b.projectedGoLiveDate) : null;
        if (aDate && bDate) return aDate - bDate;
        return aDate ? -1 : bDate ? 1 : 0;
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [projects, sort]);

  const closedCount = projects.length - openProjects.length;
  const visible = hideClosed ? sorted.filter((p) => p.isOpen) : sorted;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Open Projects</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">{openProjects.length}</p>
          {tierCounts.length > 0 && (
            <p className="text-xs text-neutral-400 mt-0.5">{tierCounts.map((t) => `${t.label}: ${t.count}`).join(' · ')}</p>
          )}
        </div>
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg. Days Open</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">{avgDaysOpen != null ? `${avgDaysOpen}d` : '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Red / Amber</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">
            {openProjects.filter((p) => p.projectHealthRag === 'red').length} / {openProjects.filter((p) => p.projectHealthRag === 'amber').length}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Tracked</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">{projects.length}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{closedCount} completed/closed</p>
        </div>
      </div>

      <div className="mb-6">
        <OnboardingVolumeChart allProjects={projects} openProjects={openProjects} />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">No implementation-tracked deals yet.</p>
      ) : (
        <>
          {closedCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
              <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
              Hide completed/cancelled/merged ({closedCount})
            </label>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 text-xs uppercase tracking-wide">
                  <SortableHeader label="Company" column="companyName" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Project" column="name" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Tier" column="tier" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Status" column="projectStatus" sort={sort} onSort={toggleSort} />
                  <th className="pb-2 pr-4">RAG</th>
                  <SortableHeader label="Progress" column="projectProgress" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Owner" column="projectOwner" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Go-Live" column="projectedGoLiveDate" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Created" column="createdAt" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 100).map((p) => (
                  <Fragment key={p.dealId}>
                  <tr className="border-t border-neutral-100">
                    <td className="py-2 pr-4">{p.companyName || '—'}</td>
                    <td className="py-2 pr-4 max-w-xs" title={p.name}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">
                          {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">{p.name}</a> : p.name}
                        </span>
                        {p.pinnedNote && (
                          <button
                            type="button"
                            onClick={() => setNoteOpenId(noteOpenId === p.dealId ? null : p.dealId)}
                            title="Show HubSpot pinned note"
                            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-accent-300 text-accent-600 bg-accent-50 hover:bg-accent-100"
                          >
                            NOTE
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-500">{tierLabel(p.tier)}</td>
                    <td className="py-2 pr-4 text-neutral-500">{p.projectStatus}</td>
                    <td className="py-2 pr-4">
                      {p.projectHealthRag
                        ? <span title={p.projectHealthRag} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: RAG_COLOR[p.projectHealthRag] || '#a3a3a3' }} />
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-neutral-500">{p.projectProgress != null ? `${p.projectProgress}%` : '—'}</td>
                    <td className="py-2 pr-4 text-neutral-500">{p.projectOwner || '—'}</td>
                    <td className="py-2 pr-4 text-neutral-500 whitespace-nowrap">{p.projectedGoLiveDate ? p.projectedGoLiveDate.slice(0, 10) : '—'}</td>
                    <td className="py-2 text-neutral-500 whitespace-nowrap">{p.createdAt ? p.createdAt.slice(0, 10) : '—'}</td>
                  </tr>
                  {noteOpenId === p.dealId && (
                    <tr>
                      <td colSpan={9} className="bg-neutral-50 px-2 py-3">
                        <PinnedNoteBody segments={p.pinnedNoteSegments} text={p.pinnedNote} className="max-h-80 overflow-y-auto" />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length > 100 && <p className="text-xs text-neutral-400 mt-2">Showing 100 of {visible.length}.</p>}
        </>
      )}
    </div>
  );
}
