import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Same StrictMode double-invoke guard as Dashboard.jsx — this route now
  // runs the same expensive portfolio-wide ticket-history pull
  // (server/api/accounts.js) as /api/export, so a second concurrent fetch
  // here is exactly as likely to trip HubSpot's rate limit.
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    getAccounts().then((d) => setAccounts(d.companies)).catch((err) => setLoadError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.name?.toLowerCase().includes(q));
  }, [accounts, search]);

  // Starting a new search should clear whatever account was previously
  // selected below — otherwise that account's full detail card (tags,
  // deals table) keeps sitting on the page, disconnected from whatever
  // you're now searching for (confirmed confusing live, Sep 2026: typing
  // a new search while "Albert's House" was still selected left its detail
  // card showing underneath the newly-filtered list).
  function handleSearchChange(value) {
    setSearch(value);
    setSelected(null);
    setTruth(null);
    setTruthError(null);
  }

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
        <p>Contracted (HubSpot deals + line items) for any account — answers "is this a real cross-client need or a one-off" in one place instead of a Slack thread.</p>
      </div>

      <div className="notice">
        Enabled is now live, sourced from HubSpot's own <code>alis_products</code> field
        (AM-maintained — what was sold/configured, not a live ALIS check). Used (real ALIS
        export API activity) still isn't built — that needs live ALIS admin credentials,
        which this app deliberately doesn't take. See docs/CONTEXT.md view #2.
      </div>

      <div className="card">
        <input
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />
        {loadError && <div className="notice danger">{loadError}</div>}
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Tier</th>
              <th>ARR</th>
              <th title="Open Enhancement Request tickets for this account">Open Enh.</th>
              <th title="Closed Enhancement Request tickets for this account, last ~13 months">Closed Enh.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 25).map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.tier ?? '—'}</td>
                <td>{formatCents(a.arrCents)}</td>
                <td>{a.openEnhancementCount ?? 0}</td>
                <td>{a.closedEnhancementCount ?? 0}</td>
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

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
              Enabled — per HubSpot's <code>alis_products</code> field, not a live ALIS check
              {selected.package && <> · Package: <strong>{selected.package}</strong></>}
            </p>
            {selected.products?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.products.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontSize: 12.5, padding: '3px 10px', borderRadius: 999,
                      background: 'var(--accent-soft, #fef3e2)', border: '1px solid var(--line)',
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No products recorded in HubSpot for this account.</p>
            )}
          </div>

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
