import { useEffect, useMemo, useState } from 'react';
import { getAccounts, getContractTruth } from '../api.js';

function formatCents(cents) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function AccountTruth() {
  const [accounts, setAccounts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [truth, setTruth] = useState(null);
  const [truthLoading, setTruthLoading] = useState(false);
  const [truthError, setTruthError] = useState(null);

  useEffect(() => {
    getAccounts().then((d) => setAccounts(d.companies)).catch((err) => setLoadError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.name?.toLowerCase().includes(q));
  }, [accounts, search]);

  function selectAccount(account) {
    setSelected(account);
    setTruth(null);
    setTruthError(null);
    setTruthLoading(true);
    getContractTruth(account.id)
      .then(setTruth)
      .catch((err) => setTruthError(err.message))
      .finally(() => setTruthLoading(false));
  }

  return (
    <>
      <div className="page-head">
        <h2>Account Truth</h2>
        <p>Contracted (HubSpot deals + line items) for any account — Ella's "is this a real cross-client need or a one-off" lookup, in one place instead of a Slack thread.</p>
      </div>

      <div className="notice">
        Enabled (ALIS entitlements) and Used (ALIS export API activity) columns aren't
        built yet — this is Contracted only, v1. See docs/CONTEXT.md view #2.
      </div>

      <div className="card">
        <input
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />
        {loadError && <div className="notice danger">{loadError}</div>}
        <table>
          <thead>
            <tr><th>Account</th><th>Tier</th><th>ARR</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 25).map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.tier ?? '—'}</td>
                <td>{formatCents(a.arrCents)}</td>
                <td><button className="secondary" onClick={() => selectAccount(a)}>View contract truth</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 25 && <p style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Showing 25 of {filtered.length} — narrow your search.</p>}
      </div>

      {selected && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {truthLoading && <p>Loading deals…</p>}
          {truthError && <div className="notice danger">{truthError}</div>}
          {truth?.scopeWarning && <div className="notice">{truth.scopeWarning}</div>}
          {truth && truth.deals.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No deals found for this account.</p>}
          {truth && truth.deals.length > 0 && (
            <table>
              <thead>
                <tr><th>Deal</th><th>Status</th><th>ARR</th><th>Line items</th></tr>
              </thead>
              <tbody>
                {truth.deals.map((d) => (
                  <tr key={d.dealId}>
                    <td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.dealName}</a> : d.dealName}</td>
                    <td>{d.isClosed ? (d.isWon ? 'Closed Won' : 'Closed Lost') : 'Open'}</td>
                    <td>{d.arrValue != null ? d.arrValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—'}</td>
                    <td>
                      {d.lineItemsBlocked
                        ? <span style={{ color: 'var(--warn)' }}>blocked (scopes)</span>
                        : d.lineItems.length === 0 ? '—' : d.lineItems.map((li) => li.name).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
