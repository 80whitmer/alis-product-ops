import { useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, LineChart, Line, Legend,
} from 'recharts';

/**
 * Escalation/Enhancement trend charts, ported from alis-hub's
 * EscalationRequestsSection.jsx / EnhancementRequestsSection.jsx (Sep
 * 2026) and trimmed to just the stat-tiles/chart portion — this app's
 * Dashboard.jsx already has its own itemized, searchable ticket table
 * (RequestsTable/RequestRow) below each of these, so there's no need to
 * duplicate a second sortable table here the way alis-hub's version does.
 * Takes flat ticket-row arrays directly (this app's /api/export shape),
 * not alis-hub's per-account `serviceHealth.xxxItems` nesting, so no
 * flatten-across-accounts step is needed first.
 */

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Unassigned'];
// Same canonical tier palette as alis-hub's tier charts (1 = green, 2 =
// blue, 3 = orange, 4 = red) — kept in sync by convention, not import,
// matching this codebase's per-file duplication pattern elsewhere.
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };
function tierSort(a, b) {
  const ai = TIER_ORDER.indexOf(a.name);
  const bi = TIER_ORDER.indexOf(b.name);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

const AM_LINE_PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4d7c0f', '#9333ea'];

function StatTile({ label, value }) {
  return (
    <div className="card">
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-primary-900 mt-1">{value}</p>
    </div>
  );
}

function TierBarChart({ items, name }) {
  const byTier = {};
  for (const t of items) {
    const key = tierLabel(t.tier);
    byTier[key] = (byTier[key] || 0) + 1;
  }
  const data = Object.entries(byTier).map(([tname, count]) => ({ name: tname, count })).sort(tierSort);

  if (data.length === 0) {
    return <p className="text-sm text-neutral-500 italic">Nothing open to break down.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 13 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" name={name} radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={TIER_COLOR[d.name] || '#737373'} />)}
          <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: '#1e293b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const HEATMAP_WEEKS = 53;

/** count -> one of 5 shade levels, same idea as GitHub's contribution graph. */
function heatLevel(count, max) {
  if (!count) return 0;
  if (max <= 1) return count > 0 ? 4 : 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/** Trailing-12-months, GitHub-style contribution heatmap — plain CSS grid, no calendar library, ported from alis-hub's identical component. */
function CalendarHeatmap({ items, dateField, colorScale, emptyLabel }) {
  const { cells, monthLabels } = useMemo(() => {
    const countByDate = {};
    for (const t of items) {
      const value = t[dateField];
      if (!value) continue;
      const day = value.slice(0, 10);
      countByDate[day] = (countByDate[day] || 0) + 1;
    }
    const max = Math.max(0, ...Object.values(countByDate));

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (HEATMAP_WEEKS * 7 - 1));

    const days = [];
    const monthLabels = [];
    let lastMonth = null;
    for (let i = 0, d = new Date(start); d <= end; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const count = countByDate[iso] || 0;
      const inFuture = d > today;
      days.push({ iso, count: inFuture ? null : count, level: inFuture ? null : heatLevel(count, max) });
      const week = Math.floor(i / 7);
      const month = d.getUTCMonth();
      if (d.getUTCDay() === 0 && month !== lastMonth) {
        monthLabels.push({ week, label: d.toLocaleDateString('en-US', { month: 'short' }) });
        lastMonth = month;
      }
    }
    return { cells: days, monthLabels };
  }, [items, dateField]);

  const hasAny = items.some((t) => t[dateField]);
  if (!hasAny) {
    return <p className="text-sm text-neutral-500 italic">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: HEATMAP_WEEKS * 13, position: 'relative', height: 14, marginBottom: 4 }}>
        {monthLabels.map(({ week, label }) => (
          <span key={`${week}-${label}`} className="text-xs text-neutral-400" style={{ position: 'absolute', left: week * 13 }}>{label}</span>
        ))}
      </div>
      <div
        style={{
          display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gridAutoColumns: '11px', gap: 2, minWidth: HEATMAP_WEEKS * 13,
        }}
      >
        {cells.map((c) => (
          <div
            key={c.iso}
            title={c.count == null ? '' : `${c.iso}: ${c.count}`}
            style={{ width: 11, height: 11, borderRadius: 2, background: c.level == null ? 'transparent' : colorScale[c.level] }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-neutral-400">
        <span>Fewer</span>
        {colorScale.map((color, i) => <span key={`${color}-${i}`} style={{ width: 11, height: 11, borderRadius: 2, background: color, display: 'inline-block' }} />)}
        <span>More</span>
      </div>
    </div>
  );
}

const CREATED_COLOR_SCALE = ['#ebedf0', '#f4c7c3', '#e8938c', '#dc625a', '#dc2626'];
const CLOSED_COLOR_SCALE = ['#ebedf0', '#c3ead9', '#87d6b3', '#4abf8c', '#10b981'];

/**
 * "Open [x] — Trailing 12 Months" weekly trend, ported from alis-hub's
 * computeOpenEscalationTrend: replays each ticket's own createdAt/closedAt
 * week by week rather than approximating, since a per-ticket open/close
 * date pair already carries its whole history.
 */
function computeOpenTrend(openItems, closedItems, weeks = 52) {
  const episodes = [
    ...openItems.map((t) => ({ tier: tierLabel(t.tier), createdAt: t.createdAt, closedAt: null })),
    ...closedItems.map((t) => ({ tier: tierLabel(t.tier), createdAt: t.createdAt, closedAt: t.closedAt })),
  ].filter((e) => e.createdAt);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const tiersSeen = new Set();
  const rows = Array.from({ length: weeks }, (_, i) => {
    const weekEnd = new Date(end);
    weekEnd.setUTCDate(weekEnd.getUTCDate() - (weeks - 1 - i) * 7);
    const row = { date: weekEnd.toISOString().slice(0, 10), total: 0 };
    for (const e of episodes) {
      const created = new Date(e.createdAt);
      if (created > weekEnd) continue;
      if (e.closedAt && new Date(e.closedAt) <= weekEnd) continue;
      row.total += 1;
      row[e.tier] = (row[e.tier] || 0) + 1;
      tiersSeen.add(e.tier);
    }
    return row;
  });
  return { rows, tierKeys: TIER_ORDER.filter((t) => tiersSeen.has(t)) };
}

function OpenTrendChart({ openItems, closedItems, name }) {
  const [splitByTier, setSplitByTier] = useState(false);
  const { rows, tierKeys } = useMemo(() => computeOpenTrend(openItems, closedItems), [openItems, closedItems]);

  if (!rows.some((r) => r.total > 0)) {
    return <p className="text-sm text-neutral-500 italic">No dated tickets to trend yet.</p>;
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <div className="flex gap-1">
          {[{ key: false, label: 'Total' }, { key: true, label: 'By Tier' }].map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setSplitByTier(opt.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                splitByTier === opt.key ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.max(0, Math.ceil(rows.length / 12) - 1)} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          {splitByTier ? (
            <>
              <Legend />
              {tierKeys.map((t) => (
                <Line key={t} type="monotone" dataKey={t} name={t} stroke={TIER_COLOR[t] || '#737373'} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              ))}
            </>
          ) : (
            <Line type="monotone" dataKey="total" name={name} stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Every open Escalation ticket — stat tiles, tier breakdown, weekly open-trend, and created/closed heatmaps. */
export function EscalationCharts({ openItems, closedItems }) {
  const avgAgeDays = openItems.length
    ? Math.round(openItems.reduce((sum, t) => sum + (t.ageDays || 0), 0) / openItems.length)
    : null;

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatTile label="Open Escalation Tickets" value={openItems.length} />
        <StatTile label="Average Age" value={avgAgeDays != null ? `${avgAgeDays}d` : '—'} />
      </div>
      <div className="mb-6">
        <h3 className="font-semibold text-primary-900 text-sm mb-3">By Client Tier</h3>
        <TierBarChart items={openItems} name="Open Escalation Tickets" />
      </div>
      <div className="mb-6">
        <h3 className="font-semibold text-primary-900 text-sm mb-3">Open Escalation Tickets — Trailing 12 Months</h3>
        <OpenTrendChart openItems={openItems} closedItems={closedItems} name="Open Escalation Tickets" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-primary-900 text-sm mb-3">Escalations Created — Trailing 12 Months</h3>
          <CalendarHeatmap items={openItems} dateField="createdAt" colorScale={CREATED_COLOR_SCALE} emptyLabel="No dated escalations to map yet." />
        </div>
        <div>
          <h3 className="font-semibold text-primary-900 text-sm mb-3">Escalations Closed — Trailing 12 Months</h3>
          <CalendarHeatmap items={closedItems} dateField="closedAt" colorScale={CLOSED_COLOR_SCALE} emptyLabel="No closed escalations to map yet." />
        </div>
      </div>
    </div>
  );
}

/**
 * Trailing-12-months monthly OPEN BACKLOG series, one point per month-end —
 * ported from alis-hub's computeBacklogSeriesByKey, generalized over
 * whatever `keyFn(item)` returns (tier or account manager here).
 */
function computeBacklogSeriesByKey(items, keyFn) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1)));

  return months.map((monthStart, idx) => {
    const isCurrentMonth = idx === months.length - 1;
    const cutoff = isCurrentMonth ? now : new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const row = { label, total: 0 };
    for (const t of items) {
      if (!t.createdAt) continue;
      if (new Date(t.createdAt) > cutoff) continue;
      if (t.closedAt && new Date(t.closedAt) <= cutoff) continue;
      row.total += 1;
      const key = keyFn(t);
      row[key] = (row[key] || 0) + 1;
    }
    return row;
  });
}

/** Trailing-12-months monthly CLOSED count (not cumulative) — ported from alis-hub's computeClosedSeriesByKey. */
function computeClosedSeriesByKey(items) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1)));

  return months.map((monthStart) => {
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    let total = 0;
    for (const t of items) {
      if (!t.closedAt) continue;
      const closed = new Date(t.closedAt);
      if (closed < monthStart || closed > monthEnd) continue;
      total += 1;
    }
    return total;
  });
}

function VolumeTooltip({ active, payload, label, showClosed, keysPresent }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const breakdown = keysPresent.filter((k) => d[k] > 0);
  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-primary-900 mb-1">{label}: {d.total} open</p>
      {showClosed && <p className="text-neutral-600 mb-1">{d.closed} closed that month</p>}
      {breakdown.length > 0
        ? breakdown.map((k) => <p key={k} className="text-neutral-600">{k}: {d[k]}</p>)
        : <p className="text-neutral-400 italic">No breakdown data</p>}
    </div>
  );
}

/** "Opened vs. Closed — Trailing 12 Months" — ported from alis-hub's EnhancementVolumeTrendChart, same Show Closed/Break Out by Tier/Break Out by AM toggle behavior. */
function VolumeTrendChart({ openItems, closedItems, name }) {
  const [breakout, setBreakout] = useState('none'); // 'none' | 'tier' | 'am'
  const [showClosed, setShowClosed] = useState(false);
  const closedVisible = showClosed && breakout === 'none';

  const tierKeyFn = (t) => tierLabel(t.tier);
  const amKeyFn = (t) => t.accountManagerName || 'Unassigned';

  const data = useMemo(() => computeBacklogSeriesByKey(openItems, tierKeyFn), [openItems]);
  const amData = useMemo(() => computeBacklogSeriesByKey(openItems, amKeyFn), [openItems]);
  const closedByMonth = useMemo(() => computeClosedSeriesByKey(closedItems), [closedItems]);
  const combinedData = useMemo(() => data.map((row, i) => ({ ...row, closed: closedByMonth[i] ?? 0 })), [data, closedByMonth]);

  const tierKeysPresent = useMemo(() => {
    const totals = {};
    for (const row of data) for (const k of Object.keys(row)) { if (k !== 'label' && k !== 'total') totals[k] = (totals[k] || 0) + row[k]; }
    return Object.keys(totals).filter((k) => totals[k] > 0).sort((a, b) => tierSort({ name: a }, { name: b }));
  }, [data]);

  const amKeysPresent = useMemo(() => {
    const totals = {};
    for (const row of amData) for (const [k, v] of Object.entries(row)) { if (k !== 'label' && k !== 'total') totals[k] = (totals[k] || 0) + v; }
    return Object.keys(totals).filter((k) => totals[k] > 0).sort((a, b) => totals[b] - totals[a]);
  }, [amData]);

  const amLineColors = useMemo(() => {
    const colors = {};
    amKeysPresent.forEach((k, i) => { colors[k] = AM_LINE_PALETTE[i % AM_LINE_PALETTE.length]; });
    return colors;
  }, [amKeysPresent]);

  if (!openItems.some((t) => t.createdAt)) {
    return <p className="text-sm text-neutral-500 italic">No dated requests to chart yet.</p>;
  }

  return (
    <>
      <div className="flex justify-end mb-2 gap-2 flex-wrap">
        {breakout === 'none' && (
          <button
            onClick={() => setShowClosed((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${showClosed ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
          >
            {showClosed ? '← Hide Closed' : 'Show Closed'}
          </button>
        )}
        <button
          onClick={() => setBreakout((v) => (v === 'tier' ? 'none' : 'tier'))}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${breakout === 'tier' ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
        >
          {breakout === 'tier' ? '← Show Total' : 'Break Out by Tier'}
        </button>
        <button
          onClick={() => setBreakout((v) => (v === 'am' ? 'none' : 'am'))}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${breakout === 'am' ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
        >
          {breakout === 'am' ? '← Show Total' : 'Break Out by AM'}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={breakout === 'am' ? amData : combinedData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip content={<VolumeTooltip showClosed={closedVisible} keysPresent={breakout === 'am' ? amKeysPresent : tierKeysPresent} />} />
          {breakout === 'tier' ? (
            <>
              <Legend />
              {tierKeysPresent.map((k) => <Line key={k} type="monotone" dataKey={k} name={k} stroke={TIER_COLOR[k] || '#737373'} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />)}
            </>
          ) : breakout === 'am' ? (
            <>
              <Legend />
              {amKeysPresent.map((k) => <Line key={k} type="monotone" dataKey={(row) => row[k]} name={k} stroke={amLineColors[k]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />)}
            </>
          ) : (
            <>
              {closedVisible && <Legend />}
              <Line type="monotone" dataKey="total" name={name} stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 600, fill: '#1e293b' }} />
              </Line>
              {closedVisible && (
                <Line type="monotone" dataKey="closed" name="Closed (that month)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                  <LabelList dataKey="closed" position="bottom" style={{ fontSize: 11, fontWeight: 600, fill: '#1e293b' }} />
                </Line>
              )}
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

const ENHANCEMENT_HEATMAP_COLOR = ['#ebedf0', '#c6dcf5', '#8bbcec', '#4f92dd', '#2563eb'];

/** Every open Enhancement Request ticket (or just the Top 3 subset, via `topThreeOnly`) — stat tiles, opened-vs-closed monthly trend, tier breakdown, and a created-date heatmap. */
export function EnhancementCharts({ openItems, closedItems, topThreeOnly = false }) {
  const avgAgeDays = openItems.length
    ? Math.round(openItems.reduce((sum, t) => sum + (t.ageDays || 0), 0) / openItems.length)
    : null;
  const label = topThreeOnly ? 'Enhancement Requests: Top 3' : 'Open Enhancement Requests';

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatTile label={label} value={openItems.length} />
        <StatTile label="Average Age" value={avgAgeDays != null ? `${avgAgeDays}d` : '—'} />
      </div>
      <div className="mb-6">
        <h3 className="font-semibold text-primary-900 text-sm mb-3">Opened vs. Closed — Trailing 12 Months</h3>
        <VolumeTrendChart openItems={openItems} closedItems={closedItems} name="Open Requests" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-primary-900 text-sm mb-3">By Client Tier</h3>
          <TierBarChart items={openItems} name="Open Enhancement Requests" />
        </div>
        <div>
          <h3 className="font-semibold text-primary-900 text-sm mb-3">Requests Created — Trailing 12 Months</h3>
          <CalendarHeatmap items={openItems} dateField="createdAt" colorScale={ENHANCEMENT_HEATMAP_COLOR} emptyLabel="No dated requests to map yet." />
        </div>
      </div>
    </div>
  );
}
