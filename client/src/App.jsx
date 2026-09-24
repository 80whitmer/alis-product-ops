import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { DataCacheProvider } from './DataCache.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AccountTruth from './pages/AccountTruth.jsx';
import DecisionLog from './pages/DecisionLog.jsx';
import RequestQueue from './pages/RequestQueue.jsx';
import PodCapacity from './pages/PodCapacity.jsx';
import OnePagers from './pages/OnePagers.jsx';
import FinanceReconciliation from './pages/FinanceReconciliation.jsx';
import NotFound from './pages/NotFound.jsx';

// Same top-navbar shape as alis-hub's own App.jsx — logo-horizontal.png +
// a lowercase wordmark suffix in accent color, underline-on-active nav
// links. Shelved views (Request Queue/Pod Capacity/One-Pagers/Finance
// Reconciliation — see docs/CONTEXT.md) keep their routes but have no nav
// entry, same convention alis-hub uses for Evaluation Lookup.
const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/accounts', label: 'Account Truth' },
  { to: '/decisions', label: 'Decision Log' },
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <header id="app-header" className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center gap-6 shadow-sm">
        <Link to="/" className="flex items-center gap-1.5 shrink-0 whitespace-nowrap" title="Back to Dashboard">
          <img src="/logo-horizontal.png" alt="alis" className="h-7 w-auto" />
          <span className="font-bold text-xl text-accent-500">product hub</span>
        </Link>
        <nav className="flex gap-6 min-w-0">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-primary-600 border-b-2 border-accent-500 pb-2'
                    : 'text-neutral-600 hover:text-primary-600'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <DataCacheProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<AccountTruth />} />
            <Route path="/decisions" element={<DecisionLog />} />
            {/* Shelved — reachable directly, not in nav. See docs/CONTEXT.md. */}
            <Route path="/queue" element={<RequestQueue />} />
            <Route path="/pods" element={<PodCapacity />} />
            <Route path="/one-pagers" element={<OnePagers />} />
            <Route path="/finance" element={<FinanceReconciliation />} />
            {/* Catch-all — see NotFound.jsx's doc comment for why this exists (Sep 2026, Aaron: a stale bookmarked URL rendered a silent blank page instead of an error). */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DataCacheProvider>
      </main>
    </div>
  );
}
