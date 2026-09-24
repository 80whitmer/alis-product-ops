import { createContext, useContext, useCallback, useRef, useState } from 'react';
import { getExportData, getKpiHistory } from './api.js';

/**
 * Cross-page data cache (Aaron, Sep 2026: "I don't like the auto refresh...
 * make the refresh manual and the data cached so it remains available when
 * you toggle between screens"). Without this, Dashboard.jsx/
 * AccountTruth.jsx each fetched on their own mount — fine the first time,
 * but React Router unmounts a page component on navigation, so toggling
 * away and back remounted it and re-ran the ~1-2 minute HubSpot pull every
 * single time, even though nothing needed to change. Living here, above
 * the routes (see App.jsx), means the fetched data survives navigation;
 * only an explicit Refresh click (or the first-ever visit, since there's
 * nothing to show yet) triggers a real HubSpot pull.
 *
 * One shared fetch, not two: Account Truth used to run its own separate
 * (and equally expensive) portfolio-wide pull. Aaron, Sep 2026: "Can
 * Account Truth also refresh and cache when Dashboard refreshes?" —
 * /api/export now returns everything both pages need (companies carry
 * alisAdminCompanyId/companyHost too, see server/api/export.js), so
 * there's just one `dashboard` cache; AccountTruth.jsx reads companies
 * from `dashboard.data.companies` and a Refresh on either page updates
 * both.
 */
const DataCacheContext = createContext(null);

const EMPTY_KPI_HISTORY = { tier: [], portfolio: [], arrBand: [] };

// Persists the last successful pull across full page loads (Sep 2026,
// Aaron: "forever starting in this empty state... at least have something
// in there, it is hard to look at a blank screen"). The in-memory state
// above already survived navigation between Dashboard/Account Truth within
// one SPA session, but a hard refresh or a fresh tab re-created
// DataCacheProvider from scratch every time, throwing the last pull away
// and forcing a ~1-2 minute blocking HubSpot re-pull before anything could
// render. localStorage carries it across that boundary too — stale data
// beats no data, and a visible "Last refreshed" timestamp (Dashboard.jsx)
// already tells the truth about how stale it is. Refresh stays fully
// manual either way (Aaron, Sep 2026: "I don't like the auto refresh") —
// this only changes what's on screen before that first manual click.
const STORAGE_KEY = 'alis-product-hub:dashboard-cache-v1';

function loadCachedDashboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedDashboard(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage unavailable (private window, etc.) — the
    // in-memory cache still works for this session, just not across a
    // reload. Not worth surfacing to the user over.
  }
}

export function DataCacheProvider({ children }) {
  const cached = loadCachedDashboard();
  const [dashboard, setDashboard] = useState({
    data: cached?.data || null,
    kpiHistory: cached?.kpiHistory || EMPTY_KPI_HISTORY,
    loading: false,
    error: null,
    lastRefreshedAt: cached?.lastRefreshedAt || null,
    alisAdminIdsUpdatedAt: cached?.alisAdminIdsUpdatedAt || null,
    companyHostsUpdatedAt: cached?.companyHostsUpdatedAt || null,
  });
  const ensuredOnce = useRef(false);

  /**
   * `forceRefresh` maps straight to /api/export's own ?refresh=true (see
   * server/api/export.js) — without it, the server itself almost always
   * answers instantly from ITS OWN cached snapshot (survives a server
   * restart, and isn't per-browser like localStorage is), so a background
   * sync call here is cheap and safe to fire on every mount rather than
   * gating it to "only the very first time."
   *
   * BUG FIXED (Sep 2026, Aaron: "it is never cached... blank screens are
   * death"): `loading` used to be set to `forceRefresh` outright, meaning a
   * background sync (forceRefresh=false) never set it true — fine once
   * real data is already on screen, but on a genuine cold start (no
   * localStorage cache yet, e.g. a brand-new browser, or the server itself
   * having nothing cached yet either) that left `loading=false` AND
   * `data=null` at the same time, which matches NEITHER of Dashboard.jsx's
   * two render branches (`loading && !data` for the spinner, `data &&` for
   * the real content) — a silent, totally blank page with no spinner, no
   * error, nothing, for however long that fetch actually took. `loading`
   * now also turns on whenever there's no data yet regardless of
   * forceRefresh, so the very first load always shows the "Pulling live
   * data" state instead of a page that just looks broken. Likewise a
   * failure with nothing on screen yet now surfaces the error (with a
   * Retry button, see Dashboard.jsx) instead of being swallowed — a
   * request colliding with a dev-server restart is exactly the kind of
   * transient failure that used to leave the page blank forever until a
   * manual reload got lucky on timing.
   */
  const load = useCallback((forceRefresh) => {
    let hadDataAlready = false;
    setDashboard((prev) => {
      hadDataAlready = Boolean(prev.data);
      const willBlock = forceRefresh || !hadDataAlready;
      return { ...prev, loading: willBlock, error: willBlock ? null : prev.error };
    });
    return getExportData(forceRefresh)
      .then((d) => {
        // The actual HubSpot pull time (from the server), not "whenever
        // the client happened to fetch it" — a cache-served response's
        // real data could be hours old, and stamping it with the current
        // moment made "Last refreshed" claim freshness it didn't have.
        const lastRefreshedAt = d.generatedAt || new Date().toISOString();
        setDashboard((prev) => ({
          ...prev,
          data: d,
          loading: false,
          error: null,
          lastRefreshedAt,
          alisAdminIdsUpdatedAt: d.alisAdminIdsUpdatedAt,
          companyHostsUpdatedAt: d.companyHostsUpdatedAt,
        }));
        saveCachedDashboard({
          data: d, kpiHistory: EMPTY_KPI_HISTORY, lastRefreshedAt,
          alisAdminIdsUpdatedAt: d.alisAdminIdsUpdatedAt, companyHostsUpdatedAt: d.companyHostsUpdatedAt,
        });
        return getKpiHistory().then((h) => {
          setDashboard((prev) => ({ ...prev, kpiHistory: h }));
          saveCachedDashboard({
            data: d, kpiHistory: h, lastRefreshedAt,
            alisAdminIdsUpdatedAt: d.alisAdminIdsUpdatedAt, companyHostsUpdatedAt: d.companyHostsUpdatedAt,
          });
        }).catch(() => {});
      })
      .catch((err) => {
        // A background sync failing quietly (e.g. offline, or a dev-server
        // restart mid-request) shouldn't wipe out or alarm over whatever's
        // already on screen — only surface it when there's nothing to show
        // instead, or when it's a real explicit Refresh click.
        setDashboard((prev) => ({ ...prev, loading: false, error: (forceRefresh || !hadDataAlready) ? err.message : prev.error }));
        throw err;
      });
  }, []);

  /** Explicit "Refresh" button — always forces a real live HubSpot pull (Aaron, Sep 2026: "I don't like the auto refresh... make the refresh manual"). */
  const refreshDashboard = useCallback(() => load(true).catch(() => {}), [load]);

  /**
   * Called from either page's mount effect — a quiet background sync
   * against the server's own cache (see `load`'s doc comment), not a
   * forced live pull. Runs once per SPA session (StrictMode-safe via the
   * ref guard) rather than on every single mount, since the server cache
   * doesn't change between two page visits seconds apart. Auto-retries
   * once, 3s later, ONLY when this very first attempt fails with nothing
   * to show yet — covers exactly the "request landed while the dev server
   * was mid-restart" case without needing the user to manually reload and
   * hope for better timing.
   */
  const ensureDashboardLoaded = useCallback(() => {
    if (ensuredOnce.current) return;
    ensuredOnce.current = true;
    load(false).catch(() => {
      setTimeout(() => load(false).catch(() => {}), 3000);
    });
  }, [load]);

  /** Local, optimistic edit (an ALIS Admin ID / Company Host save) to one company — avoids a full portfolio refetch just to reflect one field on one row. Also re-persisted to localStorage so the edit survives a reload instead of a stale cached copy silently overwriting it. */
  const patchCompany = useCallback((hubspotCompanyId, patch) => {
    setDashboard((prev) => {
      if (!prev.data) return prev;
      const next = {
        ...prev,
        data: { ...prev.data, companies: prev.data.companies.map((c) => (c.id === hubspotCompanyId ? { ...c, ...patch } : c)) },
      };
      saveCachedDashboard({
        data: next.data, kpiHistory: next.kpiHistory, lastRefreshedAt: next.lastRefreshedAt,
        alisAdminIdsUpdatedAt: next.alisAdminIdsUpdatedAt, companyHostsUpdatedAt: next.companyHostsUpdatedAt,
      });
      return next;
    });
  }, []);

  /** Bumps the "Last imported" caption for one of the two Utilities templates right after a save/import succeeds, without waiting on a full refetch to pick up the server's own updated_at. */
  const markUpdated = useCallback((key) => {
    setDashboard((prev) => ({ ...prev, [key]: new Date().toISOString() }));
  }, []);

  const value = { dashboard, refreshDashboard, ensureDashboardLoaded, patchCompany, markUpdated };

  return <DataCacheContext.Provider value={value}>{children}</DataCacheContext.Provider>;
}

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error('useDataCache must be used within a DataCacheProvider');
  return ctx;
}
