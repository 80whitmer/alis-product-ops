import { useEffect, useMemo, useState } from 'react';
import {
  getContractTruth, setAlisAdminId, importAlisAdminIds, clearAlisAdminId, getLiveEntitlements,
  setCompanyHost, importCompanyHosts, clearCompanyHost,
} from '../api.js';
import { exportAlisAdminIdTemplate, parseAlisAdminIdTemplate } from '../utils/alisAdminIdTemplate.js';
import { exportCompanyHostTemplate, parseCompanyHostTemplate } from '../utils/companyHostTemplate.js';
import { useDataCache } from '../DataCache.jsx';
import TierFilterPills, { filterByTier } from '../components/TierFilterPills.jsx';

function formatCents(cents) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AccountTruth() {
  const { dashboard, refreshDashboard, ensureDashboardLoaded, patchCompany, markUpdated } = useDataCache();
  const accounts = dashboard.data?.companies || [];
  const { loading: accountsLoading, error: loadError, lastRefreshedAt, alisAdminIdsUpdatedAt, companyHostsUpdatedAt } = dashboard;
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [truth, setTruth] = useState(null);
  const [truthLoading, setTruthLoading] = useState(false);
  const [truthError, setTruthError] = useState(null);
  const [showUtilities, setShowUtilities] = useState(false);
  const [importingIds, setImportingIds] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [editingAlisId, setEditingAlisId] = useState(false);
  const [alisIdInput, setAlisIdInput] = useState('');
  const [savingAlisId, setSavingAlisId] = useState(false);
  const [alisIdError, setAlisIdError] = useState(null);
  const [importingHosts, setImportingHosts] = useState(false);
  const [importHostsResult, setImportHostsResult] = useState(null);
  const [importHostsError, setImportHostsError] = useState(null);
  const [editingHost, setEditingHost] = useState(false);
  const [hostInput, setHostInput] = useState('');
  const [savingHost, setSavingHost] = useState(false);
  const [hostError, setHostError] = useState(null);
  const [liveEntitlements, setLiveEntitlements] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);

  // Shares the Dashboard's own cache (client/src/DataCache.jsx) rather than
  // running its own separate fetch — Aaron, Sep 2026: "Can Account Truth
  // also refresh and cache when Dashboard refreshes?" Both pages now read
  // the same companies list, so a Refresh on either one updates both.
  useEffect(() => {
    ensureDashboardLoaded();
  }, [ensureDashboardLoaded]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.name?.toLowerCase().includes(q));
  }, [accounts, search]);

  const filtered = useMemo(() => filterByTier(searchFiltered, tierFilter), [searchFiltered, tierFilter]);

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
    setEditingAlisId(false);
    setLiveEntitlements(null);
    setLiveError(null);
    setEditingHost(false);
  }

  function selectAccount(account) {
    setSelected(account);
    setTruth(null);
    setTruthError(null);
    setTruthLoading(true);
    setEditingAlisId(false);
    setAlisIdInput(account.alisAdminCompanyId || '');
    setAlisIdError(null);
    setLiveEntitlements(null);
    setLiveError(null);
    setEditingHost(false);
    setHostInput(account.companyHost || '');
    setHostError(null);
    getContractTruth(account.id)
      .then(setTruth)
      .catch((err) => setTruthError(err.message))
      .finally(() => setTruthLoading(false));
  }

  /** Merges a fresh alisAdminCompanyId onto one account, in both the cached list and (if it's the current one) the selected detail — avoids a full refetch after a save. */
  function applyAlisAdminId(hubspotCompanyId, alisAdminCompanyId) {
    patchCompany(hubspotCompanyId, { alisAdminCompanyId });
    setSelected((prev) => (prev && prev.id === hubspotCompanyId ? { ...prev, alisAdminCompanyId } : prev));
  }

  function applyCompanyHost(hubspotCompanyId, companyHost) {
    patchCompany(hubspotCompanyId, { companyHost });
    setSelected((prev) => (prev && prev.id === hubspotCompanyId ? { ...prev, companyHost } : prev));
  }

  async function handleSaveAlisId() {
    const value = alisIdInput.trim();
    if (!value) return;
    setSavingAlisId(true);
    setAlisIdError(null);
    try {
      await setAlisAdminId(selected.id, value, selected.name);
      applyAlisAdminId(selected.id, value);
      markUpdated('alisAdminIdsUpdatedAt');
      setEditingAlisId(false);
    } catch (err) {
      setAlisIdError(err.message);
    } finally {
      setSavingAlisId(false);
    }
  }

  async function handleCheckLiveEntitlements() {
    setLiveLoading(true);
    setLiveError(null);
    setLiveEntitlements(null);
    try {
      const result = await getLiveEntitlements(selected.id);
      setLiveEntitlements(result);
    } catch (err) {
      setLiveError(err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  async function handleClearAlisId() {
    setSavingAlisId(true);
    setAlisIdError(null);
    try {
      await clearAlisAdminId(selected.id);
      applyAlisAdminId(selected.id, null);
      setAlisIdInput('');
      setLiveEntitlements(null);
    } catch (err) {
      setAlisIdError(err.message);
    } finally {
      setSavingAlisId(false);
    }
  }

  async function handleDownloadTemplate() {
    await exportAlisAdminIdTemplate(accounts);
  }

  async function handleUploadTemplate(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingIds(true);
    setImportError(null);
    setImportResult(null);
    try {
      const rows = await parseAlisAdminIdTemplate(file);
      if (rows.length === 0) throw new Error('No rows with an ALIS Admin Company ID filled in were found in this file.');
      const res = await importAlisAdminIds(rows);
      for (const r of rows) if (r.hubspotCompanyId) applyAlisAdminId(r.hubspotCompanyId, r.alisAdminCompanyId);
      markUpdated('alisAdminIdsUpdatedAt');
      setImportResult(`Imported ${res.imported} ALIS Admin Company ID${res.imported === 1 ? '' : 's'}.`);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportingIds(false);
    }
  }

  async function handleSaveHost() {
    const value = hostInput.trim();
    if (!value) return;
    setSavingHost(true);
    setHostError(null);
    try {
      await setCompanyHost(selected.id, value, selected.name);
      applyCompanyHost(selected.id, value);
      markUpdated('companyHostsUpdatedAt');
      setEditingHost(false);
    } catch (err) {
      setHostError(err.message);
    } finally {
      setSavingHost(false);
    }
  }

  async function handleClearHost() {
    setSavingHost(true);
    setHostError(null);
    try {
      await clearCompanyHost(selected.id);
      applyCompanyHost(selected.id, null);
      setHostInput('');
    } catch (err) {
      setHostError(err.message);
    } finally {
      setSavingHost(false);
    }
  }

  async function handleDownloadHostTemplate() {
    await exportCompanyHostTemplate(accounts);
  }

  async function handleUploadHostTemplate(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingHosts(true);
    setImportHostsError(null);
    setImportHostsResult(null);
    try {
      const rows = await parseCompanyHostTemplate(file);
      if (rows.length === 0) throw new Error('No rows with an ALIS Subdomain filled in were found in this file.');
      const res = await importCompanyHosts(rows);
      for (const r of rows) if (r.hubspotCompanyId) applyCompanyHost(r.hubspotCompanyId, r.companyHost);
      markUpdated('companyHostsUpdatedAt');
      setImportHostsResult(`Imported ${res.imported} ALIS subdomain${res.imported === 1 ? '' : 's'} (${rows.length - res.imported} row${rows.length - res.imported === 1 ? '' : 's'} had no matching HubSpot Company ID and were skipped).`);
    } catch (err) {
      setImportHostsError(err.message);
    } finally {
      setImportingHosts(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Account Truth</h2>
        <p>Contracted (HubSpot deals + line items) for any account — answers "is this a real cross-client need or a one-off" in one place instead of a Slack thread.</p>
      </div>

      <div className="notice">
        Enabled shows two sources side by side: HubSpot's own <code>alis_products</code> field
        (AM-maintained — what was sold/configured), and a live check against ALIS admin's real
        entitlement checkboxes (select an account below). The live check needs that account's
        ALIS Admin Company ID on file first — see Utilities. Used (real ALIS export API usage
        activity) still isn't built. See docs/CONTEXT.md view #2.
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button className="secondary" onClick={refreshDashboard} disabled={accountsLoading} style={{ marginRight: 8 }}>
              {accountsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            {lastRefreshedAt && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Last refreshed {formatTimestamp(lastRefreshedAt)}</span>}
          </div>
          <button className="secondary" onClick={() => setShowUtilities((v) => !v)}>
            {showUtilities ? 'Hide Utilities' : 'Utilities'}
          </button>
        </div>

        {showUtilities && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-soft, #f7f5f0)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: 0 }}>
              ALIS Admin Company IDs — the numeric id from the URL of an account's
              admin.alisonline.com Entitlements page. Fill these in gradually; no automated
              way exists to resolve them from HubSpot alone.
              {alisAdminIdsUpdatedAt && <> Last imported {formatTimestamp(alisAdminIdsUpdatedAt)}.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="secondary" onClick={handleDownloadTemplate}>📋 Download Template</button>
              <label className="secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6 }}>
                {importingIds ? 'Importing…' : '📤 Upload Completed Template'}
                <input type="file" accept=".xlsx" onChange={handleUploadTemplate} disabled={importingIds} style={{ display: 'none' }} />
              </label>
              {importResult && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{importResult}</span>}
            </div>
            {importError && <div className="notice danger">{importError}</div>}

            <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0' }} />

            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: 0 }}>
              ALIS Subdomains — e.g. "vivaeast" for vivaeast.alisonline.com. Same file format as
              alis-hub's own ALIS Subdomains template, so an already-completed one can be
              uploaded here as-is.
              {companyHostsUpdatedAt && <> Last imported {formatTimestamp(companyHostsUpdatedAt)}.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="secondary" onClick={handleDownloadHostTemplate}>📋 Download Template</button>
              <label className="secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6 }}>
                {importingHosts ? 'Importing…' : '📤 Upload Completed Template'}
                <input type="file" accept=".xlsx" onChange={handleUploadHostTemplate} disabled={importingHosts} style={{ display: 'none' }} />
              </label>
              {importHostsResult && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{importHostsResult}</span>}
            </div>
            {importHostsError && <div className="notice danger">{importHostsError}</div>}
          </div>
        )}

        <input
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />
        <TierFilterPills accounts={searchFiltered} tierFilter={tierFilter} onChange={setTierFilter} />
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

          <div style={{ marginBottom: 16, fontSize: 12.5 }}>
            {!editingHost && selected.companyHost ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                ALIS Subdomain: <strong>{selected.companyHost}</strong>{' '}
                <a href={`https://${selected.companyHost.split(',')[0].trim()}.alisonline.com`} target="_blank" rel="noreferrer">open →</a>{' '}
                <button className="secondary" style={{ fontSize: 11 }} onClick={() => setEditingHost(true)}>Edit</button>{' '}
                <button className="secondary" style={{ fontSize: 11 }} onClick={handleClearHost} disabled={savingHost}>Clear</button>
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--ink-soft)' }}>ALIS Subdomain:</span>
                <input
                  placeholder="e.g. vivaeast"
                  value={hostInput}
                  onChange={(e) => setHostInput(e.target.value)}
                  style={{ maxWidth: 180, fontSize: 12.5 }}
                />
                <button style={{ fontSize: 12.5 }} onClick={handleSaveHost} disabled={savingHost || !hostInput.trim()}>
                  {savingHost ? 'Saving…' : 'Save'}
                </button>
                {selected.companyHost && (
                  <button className="secondary" style={{ fontSize: 12.5 }} onClick={() => { setEditingHost(false); setHostInput(selected.companyHost); }}>Cancel</button>
                )}
              </div>
            )}
            {hostError && <div className="notice danger" style={{ marginTop: 6 }}>{hostError}</div>}
          </div>

          <div className="notice" style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Live ALIS Admin Check</p>
            {!editingAlisId && selected.alisAdminCompanyId ? (
              <p style={{ fontSize: 12.5, margin: '0 0 8px' }}>
                ALIS Admin Company ID: <strong>{selected.alisAdminCompanyId}</strong>{' '}
                <button className="secondary" style={{ fontSize: 12 }} onClick={() => setEditingAlisId(true)}>Edit</button>{' '}
                <button className="secondary" style={{ fontSize: 12 }} onClick={handleClearAlisId} disabled={savingAlisId}>Clear</button>
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  placeholder="ALIS Admin Company ID"
                  value={alisIdInput}
                  onChange={(e) => setAlisIdInput(e.target.value)}
                  style={{ maxWidth: 220 }}
                />
                <button onClick={handleSaveAlisId} disabled={savingAlisId || !alisIdInput.trim()}>
                  {savingAlisId ? 'Saving…' : 'Save'}
                </button>
                {selected.alisAdminCompanyId && (
                  <button className="secondary" onClick={() => { setEditingAlisId(false); setAlisIdInput(selected.alisAdminCompanyId); }}>Cancel</button>
                )}
              </div>
            )}
            {alisIdError && <div className="notice danger">{alisIdError}</div>}

            {selected.alisAdminCompanyId && !editingAlisId && (
              <>
                <button onClick={handleCheckLiveEntitlements} disabled={liveLoading}>
                  {liveLoading ? 'Checking ALIS admin…' : 'Check Live ALIS Entitlements'}
                </button>
                {liveError && <div className="notice danger" style={{ marginTop: 8 }}>{liveError}</div>}
                {liveEntitlements && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
                      {liveEntitlements.enabledLabels.length} of {liveEntitlements.totalFlagCount} entitlements on, as of{' '}
                      {new Date(liveEntitlements.capturedAt).toLocaleString()} —{' '}
                      <a href={liveEntitlements.sourceUrl} target="_blank" rel="noreferrer">view in ALIS admin</a>
                    </p>
                    {liveEntitlements.enabledLabels.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {liveEntitlements.enabledLabels.map((label) => (
                          <span
                            key={label}
                            style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: 999, background: '#e8f5ec', border: '1px solid #b7dfc3' }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No entitlements are checked in ALIS admin for this account.</p>
                    )}
                  </div>
                )}
              </>
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
