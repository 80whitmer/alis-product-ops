import { createContext, useContext, useCallback, useRef, useState } from 'react';
import { getExportData, getKpiHistory, getAccounts } from './api.js';

/**
 * Cross-page data cache (Aaron, Sep 2026: "I don't like the auto refresh...
 * make the refresh manual and the data cached so it remains available when
 * you toggle between the screens"). Without this, Dashboard.jsx/
 * AccountTruth.jsx each fetched on their own mount — fine the first time,
 * but React Router unmounts a page component on navigation, so toggling
 * away and back remounted it and re-ran the ~1-2 minute HubSpot pull every
 * single time, even though nothing needed to change. Living here, above
 * the routes (see App.jsx), means the fetched data survives navigation;
 * only an explicit Refresh click (or the first-ever visit, since there's
 * nothing to show yet) triggers a real HubSpot pull.
 */
const DataCacheContext = createContext(null);

const EMPTY_KPI_HISTORY = { tier: [], portfolio: [], arrBand: [] };

export function DataCacheProvider({ children }) {
  const [dashboard, setDashboard] = useState({ data: null, kpiHistory: EMPTY_KPI_HISTORY, loading: false, error: null, lastRefreshedAt: null });
  const [accounts, setAccounts] = useState({
    list: [], loading: false, error: null, lastRefreshedAt: null,
    alisAdminIdsUpdatedAt: null, companyHostsUpdatedAt: null,
  });
  const dashboardEverLoaded = useRef(false);
  const accountsEverLoaded = useRef(false);

  const refreshDashboard = useCallback(() => {
    setDashboard((prev) => ({ ...prev, loading: true, error: null }));
    return getExportData()
      .then((d) => {
        setDashboard((prev) => ({ ...prev, data: d, loading: false, lastRefreshedAt: new Date().toISOString() }));
        return getKpiHistory().then((h) => setDashboard((prev) => ({ ...prev, kpiHistory: h }))).catch(() => {});
      })
      .catch((err) => setDashboard((prev) => ({ ...prev, error: err.message, loading: false })));
  }, []);

  /** Called from Dashboard's mount effect — a no-op after the first-ever load, so navigating back to the page doesn't refetch. */
  const ensureDashboardLoaded = useCallback(() => {
    if (dashboardEverLoaded.current) return;
    dashboardEverLoaded.current = true;
    refreshDashboard();
  }, [refreshDashboard]);

  const refreshAccounts = useCallback(() => {
    setAccounts((prev) => ({ ...prev, loading: true, error: null }));
    return getAccounts()
      .then((d) => setAccounts((prev) => ({
        ...prev,
        list: d.companies,
        loading: false,
        error: null,
        lastRefreshedAt: d.generatedAt || new Date().toISOString(),
        alisAdminIdsUpdatedAt: d.alisAdminIdsUpdatedAt,
        companyHostsUpdatedAt: d.companyHostsUpdatedAt,
      })))
      .catch((err) => setAccounts((prev) => ({ ...prev, error: err.message, loading: false })));
  }, []);

  const ensureAccountsLoaded = useCallback(() => {
    if (accountsEverLoaded.current) return;
    accountsEverLoaded.current = true;
    refreshAccounts();
  }, [refreshAccounts]);

  /** Local, optimistic edits (ALIS Admin ID / Company Host saves) update the cached list in place instead of forcing a full portfolio refetch just to reflect one field on one row. */
  const patchAccountsList = useCallback((updater) => {
    setAccounts((prev) => ({ ...prev, list: typeof updater === 'function' ? updater(prev.list) : updater }));
  }, []);

  /** Bumps the "Last imported" caption for one of the two Utilities templates right after a save/import succeeds, without waiting on a full accounts refetch to pick up the server's own updated_at. */
  const markUpdated = useCallback((key) => {
    setAccounts((prev) => ({ ...prev, [key]: new Date().toISOString() }));
  }, []);

  const value = {
    dashboard, refreshDashboard, ensureDashboardLoaded,
    accounts, refreshAccounts, ensureAccountsLoaded, patchAccountsList, markUpdated,
  };

  return <DataCacheContext.Provider value={value}>{children}</DataCacheContext.Provider>;
}

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error('useDataCache must be used within a DataCacheProvider');
  return ctx;
}
