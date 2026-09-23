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

export function DataCacheProvider({ children }) {
  const [dashboard, setDashboard] = useState({
    data: null, kpiHistory: EMPTY_KPI_HISTORY, loading: false, error: null, lastRefreshedAt: null,
    alisAdminIdsUpdatedAt: null, companyHostsUpdatedAt: null,
  });
  const dashboardEverLoaded = useRef(false);

  const refreshDashboard = useCallback(() => {
    setDashboard((prev) => ({ ...prev, loading: true, error: null }));
    return getExportData()
      .then((d) => {
        setDashboard((prev) => ({
          ...prev,
          data: d,
          loading: false,
          error: null,
          lastRefreshedAt: new Date().toISOString(),
          alisAdminIdsUpdatedAt: d.alisAdminIdsUpdatedAt,
          companyHostsUpdatedAt: d.companyHostsUpdatedAt,
        }));
        return getKpiHistory().then((h) => setDashboard((prev) => ({ ...prev, kpiHistory: h }))).catch(() => {});
      })
      .catch((err) => setDashboard((prev) => ({ ...prev, error: err.message, loading: false })));
  }, []);

  /** Called from either page's mount effect — a no-op after the first-ever load, so navigating between Dashboard and Account Truth never refetches on its own. */
  const ensureDashboardLoaded = useCallback(() => {
    if (dashboardEverLoaded.current) return;
    dashboardEverLoaded.current = true;
    refreshDashboard();
  }, [refreshDashboard]);

  /** Local, optimistic edit (an ALIS Admin ID / Company Host save) to one company — avoids a full portfolio refetch just to reflect one field on one row. */
  const patchCompany = useCallback((hubspotCompanyId, patch) => {
    setDashboard((prev) => {
      if (!prev.data) return prev;
      return {
        ...prev,
        data: { ...prev.data, companies: prev.data.companies.map((c) => (c.id === hubspotCompanyId ? { ...c, ...patch } : c)) },
      };
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
