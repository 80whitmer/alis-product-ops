import { useState } from 'react';
import { getExportData } from '../api.js';
import { exportDataToExcel } from '../utils/dataExport.js';

export default function DataExport() {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  async function handleRefresh() {
    setStatus('loading');
    setError(null);
    try {
      const data = await getExportData();
      await exportDataToExcel(data);
      setLastResult({ companies: data.companies.length, requests: data.requests.length, generatedAt: data.generatedAt });
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Data Export</h2>
        <p>
          The realtime data pull, no analysis attached — pulls live from HubSpot and downloads
          one Excel file with two sheets: the account roster (ARR, tier) and every currently
          active enhancement/escalation/support request with account context joined in. Plug it
          into whatever you're already using — the #bi-priority sheet, DOMO, a pivot table.
          If you need scoring or a live dashboard on top of this, ask — this is deliberately v1.
        </p>
      </div>

      <div className="card">
        <button onClick={handleRefresh} disabled={status === 'loading'}>
          {status === 'loading' ? 'Pulling live data…' : 'Refresh & Download Excel'}
        </button>
        {status === 'loading' && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 10 }}>
            Usually 10–15 seconds — this searches every ticket touched in the last 120 days.
          </p>
        )}
        {status === 'error' && <div className="notice danger" style={{ marginTop: 12 }}>{error}</div>}
        {status === 'done' && lastResult && (
          <div className="notice" style={{ marginTop: 12, borderLeftColor: 'var(--success)', background: 'var(--success-tint)' }}>
            Downloaded — {lastResult.companies} accounts, {lastResult.requests} active requests, as of{' '}
            {new Date(lastResult.generatedAt).toLocaleString()}.
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>What's in each sheet</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
          <strong>Accounts</strong> — every Home Office account in HubSpot, with tier and ARR.
        </p>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
          <strong>Active Requests</strong> — every ticket modified in the last 120 days sitting in
          an active stage (Client Submitted, In Progress, Top 3 Enhancements, Long-Term Projects),
          joined to its account's tier and ARR where the ticket is tied to a Home Office account.
          A blank company means it's tied to a child community record, not the parent account.
          No scoring is applied — category, stage, priority, and age are raw columns for you to
          sort/filter/weight however your team already does.
        </p>
      </div>
    </>
  );
}
