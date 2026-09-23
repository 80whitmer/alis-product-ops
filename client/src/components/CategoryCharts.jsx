import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend, PieChart, Pie, Cell,
} from 'recharts';

/**
 * "Tickets by Category Open/Closed" and "Tickets by Module" — adapted from
 * alis-hub's CategoryMixChart. Aaron, Sep 2026: bars filtered to
 * enhancements, broken down by focus, each bar split by tier share; pie
 * keeps the full category mix. Module view answers "where are escalations
 * popping up" with tiers for the who.
 */

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };
const PIE_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#db2777', '#4d7c0f', '#9333ea', '#737373'];
const PIE_MAX_SLICES = 10;

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

function pct(v, total) {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}

function PillToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            value === o.value ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function groupByTier(items, groupFn) {
  const rows = new Map();
  for (const t of items) {
    const name = groupFn(t);
    if (!rows.has(name)) rows.set(name, { name, total: 0 });
    const row = rows.get(name);
    const tier = tierLabel(t.tier);
    row[tier] = (row[tier] || 0) + 1;
    row.total += 1;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

function TierShareTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-primary-900 mb-1">{label} — {row.total}</p>
      {TIER_ORDER.filter((t) => row[t]).map((t) => (
        <p key={t} style={{ color: TIER_COLOR[t] }}>{t}: {row[t]} ({pct(row[t], row.total)}%)</p>
      ))}
    </div>
  );
}

/** Horizontal bars, one per group, each split into tier segments. The total label rides on whichever tier segment is last for that row. */
function TierStackedBarChart({ data, grandTotal }) {
  const tiersPresent = TIER_ORDER.filter((t) => data.some((d) => d[t] > 0));
  const lastTierByRow = data.map((d) => [...tiersPresent].reverse().find((t) => d[t] > 0));

  const renderTotal = (tier) => function TotalLabel({ x, y, width, height, index }) {
    if (lastTierByRow[index] !== tier) return null;
    const row = data[index];
    return (
      <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={13} fontWeight={600} fill="#1e293b">
        {row.total} ({pct(row.total, grandTotal)}%)
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 44 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 80, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 13 }} />
        <Tooltip content={<TierShareTooltip />} cursor={{ fill: '#f5f5f5' }} />
        <Legend />
        {tiersPresent.map((t) => (
          <Bar key={t} dataKey={t} name={t} stackId="tier" fill={TIER_COLOR[t]} isAnimationActive={false}>
            <LabelList dataKey={t} content={renderTotal(t)} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryPie({ items }) {
  const data = useMemo(() => {
    const counts = new Map();
    for (const t of items) {
      const name = t.category || 'Uncategorized';
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const sorted = [...counts.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    if (sorted.length <= PIE_MAX_SLICES) return sorted;
    const head = sorted.slice(0, PIE_MAX_SLICES - 1);
    const otherTotal = sorted.slice(PIE_MAX_SLICES - 1).reduce((s, d) => s + d.total, 0);
    return [...head, { name: `Other (${sorted.length - head.length} categories)`, total: otherTotal }];
  }, [items]);
  const total = items.length;

  return (
    <ResponsiveContainer width="100%" height={520}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius="62%"
          isAnimationActive={false}
          label={({ total: v, name }) => (pct(v, total) >= 3 ? `${name}: ${v} (${pct(v, total)}%)` : '')}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${v} (${pct(v, total)}%)`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryMixSection({ items, status }) {
  const [chartType, setChartType] = useState('bar');
  const enhancements = useMemo(() => items.filter((t) => t.isEnhancementRequest), [items]);
  const focusData = useMemo(() => groupByTier(enhancements, (t) => t.enhancementFocus || 'Focus not set'), [enhancements]);

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500 italic">No {status} tickets in the lookback window.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <PillToggle options={[{ value: 'bar', label: 'Bar' }, { value: 'pie', label: 'Pie' }]} value={chartType} onChange={setChartType} />
        <div className="flex items-center gap-3 text-xs font-medium text-neutral-500">
          <span>Total: {items.length}</span>
          <span>Enhancement Requests: {enhancements.length} ({pct(enhancements.length, items.length)}%)</span>
        </div>
      </div>
      {chartType === 'bar' ? (
        <>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Enhancement Requests by Focus</h4>
          <p className="text-xs text-neutral-400 mb-2">
            Focus is HubSpot's "What type of enhancement request is this?" field. Each bar is split by Client Tier; % is share of {status} enhancement requests.
          </p>
          {focusData.length === 0
            ? <p className="text-sm text-neutral-500 italic">No {status} enhancement requests.</p>
            : <TierStackedBarChart data={focusData} grandTotal={enhancements.length} />}
        </>
      ) : (
        <>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">All {status} tickets by Category</h4>
          <CategoryPie items={items} />
        </>
      )}
    </>
  );
}

const NO_MODULE = 'No module';

/** Escalations by HubSpot's ALIS Module field. The "No module" gap is called out rather than charted by default, since it dwarfs every real module. */
export function ModuleSection({ openItems, closedItems }) {
  const [status, setStatus] = useState('open');
  const [includeNoModule, setIncludeNoModule] = useState(false);
  const [useInferred, setUseInferred] = useState(true);
  const items = status === 'open' ? openItems : closedItems;
  const moduleOf = (t) => t.module || (useInferred && t.moduleInferred) || NO_MODULE;

  const chartData = useMemo(() => {
    const scoped = includeNoModule ? items : items.filter((t) => moduleOf(t) !== NO_MODULE);
    return groupByTier(scoped, moduleOf);
  }, [items, includeNoModule, useInferred]);

  const summary = useMemo(() => {
    const rows = new Map();
    const bump = (t, key) => {
      const name = moduleOf(t);
      if (!rows.has(name)) rows.set(name, { name, open: 0, closed: 0, inferred: 0 });
      const row = rows.get(name);
      row[key] += 1;
      if (!t.module && name !== NO_MODULE) row.inferred += 1;
    };
    openItems.forEach((t) => bump(t, 'open'));
    closedItems.forEach((t) => bump(t, 'closed'));
    return [...rows.values()]
      .sort((a, b) => (a.name === NO_MODULE) - (b.name === NO_MODULE) || b.open - a.open || b.closed - a.closed);
  }, [openItems, closedItems, useInferred]);

  const openMissing = openItems.filter((t) => !t.module).length;
  const openSuggested = openItems.filter((t) => !t.module && t.moduleInferred).length;
  const closedMissing = closedItems.filter((t) => !t.module).length;
  const chartedTotal = chartData.reduce((s, d) => s + d.total, 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Open Escalations</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">{openItems.length}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{openItems.length - openMissing} with a module</p>
        </div>
        <div className="card border-l-4 border-l-accent-500">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Open — Missing a Module</p>
          <p className="text-2xl font-bold text-accent-600 mt-1">{openMissing}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{pct(openMissing, openItems.length)}% of open · {openSuggested} have a suggested module</p>
        </div>
        <div className="card">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Closed — Missing a Module</p>
          <p className="text-2xl font-bold text-primary-900 mt-1">{closedMissing}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{pct(closedMissing, closedItems.length)}% of {closedItems.length} closed</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <PillToggle options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} value={status} onChange={setStatus} />
          <PillToggle options={[{ value: true, label: 'Set + inferred' }, { value: false, label: 'Set only' }]} value={useInferred} onChange={setUseInferred} />
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input type="checkbox" checked={includeNoModule} onChange={(e) => setIncludeNoModule(e.target.checked)} />
          Include "{NO_MODULE}" bar
        </label>
      </div>
      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
        {status === 'open' ? 'Open' : 'Closed'} Escalations by ALIS Module
      </h4>
      {useInferred && (
        <p className="text-xs text-neutral-400 mb-2">
          Where ALIS Module is blank, a module is inferred from keywords in the ticket's subject, description, and next step — a
          suggestion only, never written back to HubSpot. Switch to "Set only" to see just what's recorded.
        </p>
      )}
      {chartData.length === 0
        ? <p className="text-sm text-neutral-500 italic mb-6">No {status} escalations have a module set.</p>
        : <div className="mb-6"><TierStackedBarChart data={chartData} grandTotal={chartedTotal} /></div>}

      <div className="overflow-x-auto mb-6">
        <table>
          <thead>
            <tr><th>ALIS Module</th><th>Open</th><th>Closed</th><th>Total</th>{useInferred && <th title="Of the total, how many were inferred rather than set in HubSpot">Inferred</th>}</tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.name} className={r.name === NO_MODULE ? 'bg-accent-50' : undefined}>
                <td className={r.name === NO_MODULE ? 'font-semibold text-accent-700' : undefined}>{r.name}</td>
                <td>{r.open}</td>
                <td>{r.closed}</td>
                <td>{r.open + r.closed}</td>
                {useInferred && <td className="text-neutral-400">{r.inferred || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
