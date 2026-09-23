import { useEffect, useRef, useState } from 'react';
import { runPortfolioEntitlementsCheck, getPortfolioEntitlementsStatus } from '../api.js';

/**
 * "Callout of what percentage of ALIS live environments have those
 * specific entitlements enabled" (Aaron, Sep 2026) — a manual, on-demand
 * portfolio-wide scrape (server/services/portfolioEntitlementsJob.js), not
 * folded into the regular Refresh, since a real ALIS admin login+scrape
 * per account is slow and Aaron wants to control when it hits production.
 * Only covers accounts with an ALIS Admin Company ID on file — see the
 * Account Truth Utilities panel's "Discover ALIS Admin Company IDs" to
 * grow that coverage.
 */

const POLL_MS = 3000;

function StatusBanner({ job }) {
  if (job.status === 'idle' && job.snapshotCompanyCount === 0) {
    return <p className="text-sm text-neutral-500 italic">No portfolio entitlement check has been run yet.</p>;
  }
  if (job.status === 'running') {
    return (
      <div className="text-sm text-neutral-600 mb-3">
        <p>Checking {job.processed} of {job.total}{job.currentCompany ? ` — currently on ${job.currentCompany}` : ''}…</p>
        <div className="w-full h-2 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
          <div className="h-full bg-accent-500 transition-all" style={{ width: `${job.total > 0 ? (job.processed / job.total) * 100 : 0}%` }} />
        </div>
        {job.errors.length > 0 && <p className="text-xs text-red-600 mt-1">{job.errors.length} account(s) failed so far (stale ALIS Admin Company ID, or the account no longer exists in ALIS).</p>}
      </div>
    );
  }
  return (
    <p className="text-sm text-neutral-500 mb-3">
      Last run covered {job.snapshotCompanyCount} account{job.snapshotCompanyCount === 1 ? '' : 's'}
      {job.finishedAt ? ` — finished ${new Date(job.finishedAt).toLocaleString()}` : ''}.
      {job.errors.length > 0 && ` ${job.errors.length} account(s) failed.`}
    </p>
  );
}

function CategoryBlock({ category }) {
  const [open, setOpen] = useState(false);
  const avgPct = category.flags.length > 0
    ? Math.round((category.flags.reduce((s, f) => s + f.pctEnabled, 0) / category.flags.length) * 10) / 10
    : 0;
  return (
    <div className="border border-neutral-200 rounded-lg p-3 mb-2">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <strong className="text-sm">{category.name}</strong>
        <span className="text-xs text-neutral-500">{category.flags.length} flag{category.flags.length === 1 ? '' : 's'} · avg {avgPct}% enabled</span>
        <span className="text-xs text-neutral-400 ml-auto">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <table className="mt-2">
          <thead><tr><th>Flag</th><th>Enabled</th><th>% of checked environments</th></tr></thead>
          <tbody>
            {category.flags.map((f) => (
              <tr key={f.flagId}>
                <td>{f.label}</td>
                <td className="text-neutral-500">{f.enabledCount} of {f.totalCount}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-accent-500" style={{ width: `${f.pctEnabled}%` }} />
                    </div>
                    <span className="text-xs text-neutral-500">{f.pctEnabled}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function PortfolioEntitlementsSection({ companies, alisAdminIdCount }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  async function poll() {
    try {
      const s = await getPortfolioEntitlementsStatus();
      setStatus(s);
      if (s.job.status === 'running') {
        pollRef.current = setTimeout(poll, POLL_MS);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    poll();
    return () => clearTimeout(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRun() {
    setStarting(true);
    setError(null);
    try {
      const slim = companies.map((c) => ({ id: c.id, name: c.name }));
      await runPortfolioEntitlementsCheck(slim);
      poll();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const job = status?.job;
  const rollup = status?.rollup;
  const running = job?.status === 'running';

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-3">
        {alisAdminIdCount} account{alisAdminIdCount === 1 ? '' : 's'} currently have an ALIS Admin Company ID on file — only those are covered by this check.
      </p>
      <button className="btn-secondary btn-sm mb-3" onClick={handleRun} disabled={running || starting || alisAdminIdCount === 0}>
        {running ? 'Running…' : starting ? 'Starting…' : 'Run Portfolio Entitlement Check'}
      </button>
      {error && <div className="notice danger mb-3">{error}</div>}
      {job && <StatusBanner job={job} />}
      {rollup && rollup.categories.length > 0 && (
        <div className="mt-2">
          {rollup.categories.map((c) => <CategoryBlock key={c.name} category={c} />)}
        </div>
      )}
    </div>
  );
}
