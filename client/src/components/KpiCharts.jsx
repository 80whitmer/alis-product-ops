import { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, LineChart, Line, Legend,
} from 'recharts';

/**
 * Portfolio KPI-by-tier charts (ARR/Companies/Communities by Tier, Companies
 * by ARR, and the "Added This Year" variants), each with a trend line built
 * from kpi_metric_history — one snapshot point captured per calendar day
 * every time the Dashboard loads (see server/api/export.js and
 * server/services/kpiMetrics.js), same "tracking and trending" pattern
 * ported from alis-hub's TeamAmDashboard.jsx KPI sections, just without
 * needing a scheduled job: there's nothing to plot until this has loaded on
 * a few different days, same limitation alis-hub's own trend sections have
 * on a fresh install.
 */

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
// Same canonical tier palette as TicketCharts.jsx — kept in sync by
// convention, not import, matching this codebase's per-file convention.
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };

export function usd(cents) {
  if (!cents) return '$0';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
export function count(n) {
  return (n || 0).toLocaleString('en-US');
}

function TrendEmptyState() {
  return (
    <p className="text-sm text-neutral-500 italic">
      Not enough history yet — a point is captured once per day this dashboard is loaded. Check back over the next few days to see the trend.
    </p>
  );
}

function TierBarChart({ current, metricKey, formatValue, name }) {
  const data = TIER_ORDER.map((tier) => ({ tier, value: current?.byTier?.[tier]?.[metricKey] ?? 0 }));
  if (data.every((d) => d.value === 0)) {
    return <p className="text-sm text-neutral-500 italic">Nothing to break down yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="tier" tick={{ fontSize: 13 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={formatValue} width={70} />
        <Tooltip formatter={(v) => formatValue(v)} />
        <Bar dataKey="value" name={name} radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={TIER_COLOR[d.tier] || '#737373'} />)}
          <LabelList dataKey="value" position="top" formatter={formatValue} style={{ fontSize: 12, fontWeight: 600, fill: '#1e293b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Pivots flat {scope_key, metric_key, recorded_date, value} rows into one recharts row per day, one column per tier. */
function pivotTierHistory(tierHistory, metricKey) {
  const byDate = new Map();
  for (const r of tierHistory) {
    if (r.metric_key !== metricKey) continue;
    if (!byDate.has(r.recorded_date)) byDate.set(r.recorded_date, { date: r.recorded_date });
    byDate.get(r.recorded_date)[r.scope_key] = r.value;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function TierTrendChart({ tierHistory, metricKey, formatValue }) {
  const rows = useMemo(() => pivotTierHistory(tierHistory, metricKey), [tierHistory, metricKey]);
  const tierKeysPresent = useMemo(() => {
    const seen = new Set();
    for (const row of rows) for (const k of Object.keys(row)) { if (k !== 'date' && row[k] != null) seen.add(k); }
    return TIER_ORDER.filter((t) => seen.has(t));
  }, [rows]);

  if (rows.length < 2 || tierKeysPresent.length === 0) return <TrendEmptyState />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={formatValue} width={70} />
        <Tooltip formatter={(v) => formatValue(v)} />
        <Legend />
        {tierKeysPresent.map((t) => (
          <Line key={t} type="monotone" dataKey={t} name={t} stroke={TIER_COLOR[t] || '#737373'} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** One metric's full treatment — current bar-by-tier + its trend — reused for all six by-tier KPI cards. */
export function KpiTierSection({ title, description, metricKey, current, tierHistory, formatValue, name }) {
  return (
    <div className="mb-8 pb-8 border-b border-neutral-100 last:border-b-0 last:pb-0 last:mb-0">
      <h3 className="font-semibold text-primary-900 text-sm mb-1">{title}</h3>
      {description && <p className="text-xs text-neutral-500 mb-3">{description}</p>}
      <div className="mb-4">
        <TierBarChart current={current} metricKey={metricKey} formatValue={formatValue} name={name || title} />
      </div>
      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Trend</h4>
      <TierTrendChart tierHistory={tierHistory} metricKey={metricKey} formatValue={formatValue} />
    </div>
  );
}

/** "Companies by ARR" — a histogram since no such breakdown exists in alis-hub to port verbatim; bands are fixed (server/services/kpiMetrics.js's ARR_BANDS), not user-adjustable. */
export function ArrBandSection({ current, arrBandHistory }) {
  const data = current?.byArrBand || [];
  const rows = useMemo(() => {
    const byDate = new Map();
    for (const r of arrBandHistory) {
      if (r.metric_key !== 'companyCount') continue;
      if (!byDate.has(r.recorded_date)) byDate.set(r.recorded_date, { date: r.recorded_date });
      byDate.get(r.recorded_date)[r.scope_key] = r.value;
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [arrBandHistory]);
  const bandsPresent = useMemo(() => {
    const seen = new Set();
    for (const row of rows) for (const k of Object.keys(row)) { if (k !== 'date') seen.add(k); }
    return data.map((d) => d.band).filter((b) => seen.has(b));
  }, [rows, data]);

  return (
    <div className="mb-8 pb-8 border-b border-neutral-100">
      <h3 className="font-semibold text-primary-900 text-sm mb-1">Companies by ARR</h3>
      <p className="text-xs text-neutral-500 mb-3">How many accounts fall into each ARR band, portfolio-wide.</p>
      <div className="mb-4">
        {data.every((d) => d.companyCount === 0) ? (
          <p className="text-sm text-neutral-500 italic">Nothing to break down yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="band" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {TIER_ORDER.map((tier, i) => (
                <Bar key={tier} dataKey={tier} name={tier} stackId="tier" fill={TIER_COLOR[tier]} radius={i === TIER_ORDER.length - 1 ? [4, 4, 0, 0] : undefined}>
                  {i === TIER_ORDER.length - 1 && <LabelList dataKey="companyCount" position="top" style={{ fontSize: 12, fontWeight: 600, fill: '#1e293b' }} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Trend</h4>
      {rows.length < 2 || bandsPresent.length === 0 ? (
        <TrendEmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {bandsPresent.map((b, i) => (
              <Line key={b} type="monotone" dataKey={b} name={b} stroke={['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04'][i % 7]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Pivots flat {scope_key, metric_key, recorded_date, value} rows into {date, scopeKey: value} for one specific metric — same shape pivotTierHistory produces, generalized over scopeKeys (tier names or AM names) instead of hardcoding TIER_ORDER, since AM names aren't a fixed small set. */
function pivotScopedHistory(history, metricKey) {
  const byDate = new Map();
  for (const r of history) {
    if (r.metric_key !== metricKey) continue;
    if (!byDate.has(r.recorded_date)) byDate.set(r.recorded_date, { date: r.recorded_date });
    byDate.get(r.recorded_date)[r.scope_key] = r.value;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A metric that isn't tracked directly — it's one already-tracked metric
 * divided by another (e.g. ARR by Tier ÷ Companies by Tier = Average ARR
 * per Company) — computed here from the two underlying histories/current
 * snapshots rather than stored as its own kpi_metric_history row, so
 * trending it needed no new backend storage (Aaron, Sep 2026: "average ARR
 * per tier... AND average capacity per tier with track and trending").
 * `scopeKeys` is TIER_ORDER for the tier view or the AM names present in
 * the data for the "AM boards" view — same component either way.
 */
export function AverageMetricSection({ title, description, numeratorKey, denominatorKey, buckets, history, scopeKeys, colorFor, formatValue }) {
  const barData = scopeKeys
    .map((key) => {
      const bucket = buckets?.[key];
      const denom = bucket?.[denominatorKey] || 0;
      return { key, value: denom > 0 ? (bucket[numeratorKey] || 0) / denom : 0, denom };
    })
    .filter((d) => d.denom > 0);

  const numeratorHistory = useMemo(() => pivotScopedHistory(history, numeratorKey), [history, numeratorKey]);
  const denominatorHistory = useMemo(() => pivotScopedHistory(history, denominatorKey), [history, denominatorKey]);
  const trendRows = useMemo(() => {
    const byDenom = new Map(denominatorHistory.map((r) => [r.date, r]));
    return numeratorHistory.map((numRow) => {
      const denomRow = byDenom.get(numRow.date) || {};
      const out = { date: numRow.date };
      for (const key of scopeKeys) {
        const denom = denomRow[key];
        if (denom) out[key] = (numRow[key] || 0) / denom;
      }
      return out;
    });
  }, [numeratorHistory, denominatorHistory, scopeKeys]);
  const keysPresentInTrend = useMemo(() => {
    const seen = new Set();
    for (const row of trendRows) for (const k of Object.keys(row)) { if (k !== 'date' && row[k] != null) seen.add(k); }
    return scopeKeys.filter((k) => seen.has(k));
  }, [trendRows, scopeKeys]);

  return (
    <div className="mb-8 pb-8 border-b border-neutral-100 last:border-b-0 last:pb-0 last:mb-0">
      <h3 className="font-semibold text-primary-900 text-sm mb-1">{title}</h3>
      {description && <p className="text-xs text-neutral-500 mb-3">{description}</p>}
      <div className="mb-4">
        {barData.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">Nothing to break down yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="key" tick={{ fontSize: 12 }} interval={0} angle={barData.length > 6 ? -30 : 0} textAnchor={barData.length > 6 ? 'end' : 'middle'} height={barData.length > 6 ? 60 : 30} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={formatValue} width={70} />
              <Tooltip formatter={(v) => formatValue(v)} />
              <Bar dataKey="value" name={title} radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={colorFor ? colorFor(d.key) : '#2563eb'} />)}
                <LabelList dataKey="value" position="top" formatter={formatValue} style={{ fontSize: 12, fontWeight: 600, fill: '#1e293b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Trend</h4>
      {trendRows.length < 2 || keysPresentInTrend.length === 0 ? (
        <TrendEmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={formatValue} width={70} />
            <Tooltip formatter={(v) => formatValue(v)} />
            <Legend />
            {keysPresentInTrend.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} name={k} stroke={colorFor ? colorFor(k) : ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04'][i % 7]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export { TIER_ORDER, TIER_COLOR };
