import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { getDecisions, createDecision, deleteDecisionById } from '../api.js';
import { exportDecisionsToExcel } from '../utils/decisionExport.js';

const EMPTY_FORM = { subject: '', outcome: '', evidence: '', decidedBy: '', decidedAt: '', relatedUrl: '' };

/** Decisions captured per month, trailing 12 months — "track decisions captured over time as a timeline" (Aaron, Sep 2026). Already-persisted data (the decisions table has full history via decided_at), so this needs no new snapshot mechanism the way the Dashboard's KPI trends did — it's just grouping what's already there. */
function computeMonthlyTimeline(decisions) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1)));
  const counts = new Map();
  for (const d of decisions) {
    if (!d.decided_at) continue;
    const dt = new Date(d.decided_at);
    const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return months.map((m) => ({
    label: m.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    count: counts.get(`${m.getUTCFullYear()}-${m.getUTCMonth()}`) || 0,
  }));
}

const HEATMAP_WEEKS = 53;
const HEATMAP_COLOR_SCALE = ['#ebedf0', '#c6dcf5', '#8bbcec', '#4f92dd', '#2563eb'];

function heatLevel(count, max) {
  if (!count) return 0;
  if (max <= 1) return count > 0 ? 4 : 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/** GitHub-style contribution heatmap of decided_at dates, trailing 53 weeks — Aaron, Sep 2026: "add a github style heat map to the decision reporting." Same plain-CSS-grid pattern as the ticket/enhancement heatmaps on the Dashboard (client/src/components/TicketCharts.jsx), duplicated rather than shared per this codebase's per-file convention. */
function DecisionHeatmap({ decisions }) {
  const { cells, monthLabels } = useMemo(() => {
    const countByDate = {};
    for (const d of decisions) {
      if (!d.decided_at) continue;
      const day = d.decided_at.slice(0, 10);
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
      const cnt = countByDate[iso] || 0;
      const inFuture = d > today;
      days.push({ iso, count: inFuture ? null : cnt, level: inFuture ? null : heatLevel(cnt, max) });
      const week = Math.floor(i / 7);
      const month = d.getUTCMonth();
      if (d.getUTCDay() === 0 && month !== lastMonth) {
        monthLabels.push({ week, label: d.toLocaleDateString('en-US', { month: 'short' }) });
        lastMonth = month;
      }
    }
    return { cells: days, monthLabels };
  }, [decisions]);

  const hasAny = decisions.some((d) => d.decided_at);
  if (!hasAny) {
    return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No dated decisions to map yet.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: HEATMAP_WEEKS * 13, position: 'relative', height: 14, marginBottom: 4 }}>
        {monthLabels.map(({ week, label }) => (
          <span key={`${week}-${label}`} style={{ position: 'absolute', left: week * 13, fontSize: 11, color: 'var(--ink-soft)' }}>{label}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gridAutoColumns: '11px', gap: 2, minWidth: HEATMAP_WEEKS * 13 }}>
        {cells.map((c) => (
          <div
            key={c.iso}
            title={c.count == null ? '' : `${c.iso}: ${c.count} decision${c.count === 1 ? '' : 's'}`}
            style={{ width: 11, height: 11, borderRadius: 2, background: c.level == null ? 'transparent' : HEATMAP_COLOR_SCALE[c.level] }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--ink-soft)' }}>
        <span>Fewer</span>
        {HEATMAP_COLOR_SCALE.map((color, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 2, background: color, display: 'inline-block' }} />)}
        <span>More</span>
      </div>
    </div>
  );
}

function DecisionTimeline({ decisions }) {
  const rows = useMemo(() => computeMonthlyTimeline(decisions), [decisions]);
  if (decisions.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No decisions logged yet — the timeline fills in as they're captured.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" name="Decisions" fill="#2563eb" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: '#1e293b' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DecisionLog() {
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  function refresh() {
    getDecisions().then((d) => setDecisions(d.decisions)).catch((err) => setError(err.message));
  }

  useEffect(refresh, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createDecision(form);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    await deleteDecisionById(id);
    refresh();
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportDecisionsToExcel(decisions);
    } finally {
      setExporting(false);
    }
  }

  const thisQuarterCount = useMemo(() => {
    const now = new Date();
    const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    return decisions.filter((d) => d.decided_at && new Date(d.decided_at) >= quarterStart).length;
  }, [decisions]);

  return (
    <>
      <div className="page-head">
        <h2>Decision Log</h2>
        <p>Every time something gets prioritized, deprioritized, or deferred: who decided, against what evidence, and when — so nobody re-litigates "why did we build X instead of Y" from memory six months later.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Record a decision</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Subject (e.g. ESC-482 / DS Smart vitals integration)" required
            value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <input placeholder="Outcome (e.g. Deferred to Q1, Prioritized above X, Declined)" required
            value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} />
          <textarea placeholder="Evidence — accounts affected, ARR, why" rows={2}
            value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="Decided by" required style={{ flex: 1 }}
              value={form.decidedBy} onChange={(e) => setForm({ ...form, decidedBy: e.target.value })} />
            <input type="date" required style={{ flex: 1 }}
              value={form.decidedAt} onChange={(e) => setForm({ ...form, decidedAt: e.target.value })} />
          </div>
          <input placeholder="Related link (Jira/HubSpot, optional)"
            value={form.relatedUrl} onChange={(e) => setForm({ ...form, relatedUrl: e.target.value })} />
          {error && <div className="notice danger">{error}</div>}
          <button type="submit" disabled={submitting} style={{ justifySelf: 'start' }}>Log decision</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', margin: 0 }}>Total Decisions</p>
              <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{decisions.length}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', margin: 0 }}>This Quarter</p>
              <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{thisQuarterCount}</p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting || decisions.length === 0}>
            {exporting ? 'Building file…' : '⬇ Export to Excel'}
          </button>
        </div>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Decisions Captured — Trailing 12 Months</h3>
        <DecisionTimeline decisions={decisions} />
        <h3 style={{ fontSize: 14, marginTop: 24, marginBottom: 10 }}>Decisions Captured — Daily</h3>
        <DecisionHeatmap decisions={decisions} />
      </div>

      <div className="card">
        {decisions.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No decisions logged yet.</p>}
        {decisions.map((d) => (
          <div key={d.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{d.subject}</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(d.id)}>Remove</button>
            </div>
            <div style={{ fontSize: 13.5 }}>{d.outcome}</div>
            {d.evidence && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>{d.evidence}</div>}
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {d.decided_by} · {d.decided_at}
              {d.related_url && <> · <a href={d.related_url} target="_blank" rel="noreferrer">link</a></>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
