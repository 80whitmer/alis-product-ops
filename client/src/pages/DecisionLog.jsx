import { useEffect, useState } from 'react';
import { getDecisions, createDecision, deleteDecisionById } from '../api.js';

const EMPTY_FORM = { subject: '', outcome: '', evidence: '', decidedBy: '', decidedAt: '', relatedUrl: '' };

export default function DecisionLog() {
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

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
        {decisions.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No decisions logged yet.</p>}
        {decisions.map((d) => (
          <div key={d.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{d.subject}</strong>
              <button className="secondary" onClick={() => handleDelete(d.id)}>Remove</button>
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
