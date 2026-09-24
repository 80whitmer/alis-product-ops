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
 *
 * Progress used to be pure polling (a GET every 3s) — replaced with a live
 * SSE log (Sep 2026, Aaron, porting the idea from the ALIS Photo Migrator
 * side project's own live-scrolling-log UX, same as alis-hub's copy of
 * this component) — one line per account as it's actually checked,
 * server-pushed instead of the client re-asking on a timer. See
 * server/api/accounts.js's /portfolio-entitlements/stream route and
 * server/services/portfolioEntitlementsJob.js's broadcast() calls.
 */

const STALE_AFTER_DAYS = 90;

/**
 * The freshness half of the portfolio audit (Sep 2026, Aaron: "track this
 * over time" / "a full audit of entitlements confirmed") — cross-references
 * the rollup's per-company `freshness` rows (only companies actually
 * checked) against every account with an ALIS Admin Company ID on file, so
 * "never checked" reads as its own gap rather than silently missing from
 * the list the way it would if this only rendered what the server had rows
 * for.
 */
function AuditFreshness({ companies, freshness }) {
  const byId = new Map((freshness || []).map((f) => [f.hubspotCompanyId, f]));
  const eligible = companies.filter((c) => c.alisAdminCompanyId);
  const rows = eligible
    .map((c) => ({ id: c.id, name: c.name, check: byId.get(c.id) || null }))
    .sort((a, b) => {
      const aAge = a.check?.ageDays ?? Infinity;
      const bAge = b.check?.ageDays ?? Infinity;
      return bAge - aAge;
    });
  const neverChecked = rows.filter((r) => !r.check).length;
  const stale = rows.filter((r) => r.check?.stale).length;
  const fresh = rows.length - neverChecked - stale;
  const [open, setOpen] = useState(false);
  const flagged = rows.filter((r) => !r.check || r.check.stale);

  if (eligible.length === 0) return null;

  return (
    <div className="border border-neutral-200 rounded-lg p-3 mb-3">
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <strong>Confirmed as of</strong>
        <span className="text-emerald-700">{fresh} checked within {STALE_AFTER_DAYS}d</span>
        <span className="text-amber-700">{stale} stale</span>
        <span className="text-neutral-500">{neverChecked} never checked</span>
        {flagged.length > 0 && (
          <button className="text-xs text-accent-600 underline ml-auto" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'} {flagged.length} needing a check
          </button>
        )}
      </div>
      {open && (
        <table className="mt-2">
          <thead><tr><th>Company</th><th>Last checked</th></tr></thead>
          <tbody>
            {flagged.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="text-neutral-500">{r.check ? `${r.check.ageDays}d ago` : 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// The job's `finishedAt` lives only in the server's in-memory state (see
// portfolioEntitlementsJob.js's doc comment — no DB-backed job queue), so
// it reads back null after any server restart even though the actual
// scraped data survives fine (Sep 2026, Aaron: "Can we add a last run
// date here?" — this was blank because of exactly that restart gap).
// Falls back to the most recent `lastCheckedAt` across the persisted
// freshness rows, which is real, DB-backed data.
function lastRunDate(job, rollup) {
  if (job.finishedAt) return job.finishedAt;
  const dates = (rollup?.freshness || []).map((f) => f.lastCheckedAt).filter(Boolean);
  return dates.length > 0 ? dates.sort().at(-1) : null;
}

function StatusBanner({ job, rollup }) {
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
  const finishedAt = lastRunDate(job, rollup);
  return (
    <p className="text-sm text-neutral-500 mb-3">
      Last run covered {job.snapshotCompanyCount} account{job.snapshotCompanyCount === 1 ? '' : 's'}
      {finishedAt ? ` — as of ${new Date(finishedAt).toLocaleString()}` : ''}.
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

/** Dark scrolling terminal-style log, same look as the Photo Migrator's own live log box — auto-scrolls to the newest line. */
function LiveLog({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  if (lines.length === 0) return null;
  return (
    <div
      ref={ref}
      className="bg-neutral-900 text-emerald-300 font-mono text-xs rounded-lg p-3 mb-3 max-h-56 overflow-y-auto whitespace-pre-wrap"
    >
      {lines.map((l, i) => (
        <div key={i} className={l.level === 'error' ? 'text-red-400' : undefined}>{l.msg}</div>
      ))}
    </div>
  );
}

export default function PortfolioEntitlementsSection({ companies, alisAdminIdCount, onRollupChange }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const esRef = useRef(null);

  /** One-shot fetch of job + rollup — used for the initial hydrate and again once a run's `complete` event lands (the rollup itself isn't part of the log stream). */
  async function fetchStatus() {
    try {
      setStatus(await getPortfolioEntitlementsStatus());
    } catch (err) {
      setError(err.message);
    }
  }

  /** Opens the live SSE log — connects on mount if a run is already in progress (e.g. a reload mid-run), and again from handleRun() right after kicking one off. */
  function connectStream() {
    esRef.current?.close();
    const es = new EventSource('/api/accounts/portfolio-entitlements/stream');
    esRef.current = es;
    es.addEventListener('snapshot', (e) => {
      setStatus((prev) => ({ ...prev, job: JSON.parse(e.data) }));
    });
    es.addEventListener('log', (e) => {
      const line = JSON.parse(e.data);
      setLogLines((prev) => [...prev, line]);
      // The "Checking X of Y" header/progress bar used to only update on
      // connect (the `snapshot` event) or when the run finished — every log
      // line in between was appended to the scrolling log but never touched
      // `status.job`, so the header/bar visibly froze mid-run while the log
      // kept moving (Sep 2026, Aaron: "stayed at 67 and didn't really
      // advance"). Each `done`/`error` log line now also carries the
      // progress numbers, so this updates every account instead of only at
      // the start and end.
      if (line.processed != null) {
        setStatus((prev) => (prev ? { ...prev, job: { ...prev.job, processed: line.processed, total: line.total, currentCompany: line.currentCompany } } : prev));
      }
    });
    es.addEventListener('complete', (e) => {
      setStatus((prev) => ({ ...prev, job: JSON.parse(e.data) }));
      es.close();
      fetchStatus(); // picks up the finished rollup, which isn't broadcast over the stream
    });
    es.onerror = () => {
      // A dropped connection while a run might still be finishing
      // server-side — close cleanly and fall back to one status fetch
      // rather than looping reconnect attempts forever.
      es.close();
      fetchStatus();
    };
  }

  useEffect(() => {
    fetchStatus().then(connectStream);
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRun() {
    setStarting(true);
    setError(null);
    setLogLines([]);
    try {
      const slim = companies.map((c) => ({ id: c.id, name: c.name }));
      await runPortfolioEntitlementsCheck(slim);
      connectStream();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const job = status?.job;
  const rollup = status?.rollup;
  const running = job?.status === 'running';

  // Reports the rollup up to the Dashboard (Sep 2026, Aaron: "move the
  // Export to Excel button to the right in line with the other sections
  // that have this button") — the export button now lives in this
  // SectionCard's header action slot like every other section's, which
  // means Dashboard.jsx needs the rollup, not just this component.
  useEffect(() => {
    onRollupChange?.(rollup || null);
  }, [rollup, onRollupChange]);

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-3">
        {alisAdminIdCount} account{alisAdminIdCount === 1 ? '' : 's'} currently have an ALIS Admin Company ID on file — only those are covered by this check.
      </p>
      <button className="btn-secondary btn-sm mb-3" onClick={handleRun} disabled={running || starting || alisAdminIdCount === 0}>
        {running ? 'Running…' : starting ? 'Starting…' : 'Run Portfolio Entitlement Check'}
      </button>
      {error && <div className="notice danger mb-3">{error}</div>}
      {job && <StatusBanner job={job} rollup={rollup} />}
      <LiveLog lines={logLines} />
      {rollup && <AuditFreshness companies={companies} freshness={rollup.freshness} />}
      {rollup && rollup.categories.length > 0 && (
        <div className="mt-2">
          {rollup.categories.map((c) => <CategoryBlock key={c.name} category={c} />)}
        </div>
      )}
    </div>
  );
}
