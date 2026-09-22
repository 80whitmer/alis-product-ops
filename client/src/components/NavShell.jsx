import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/export', label: 'Data Export', status: 'live' },
  { to: '/accounts', label: 'Account Truth', status: 'live' },
  { to: '/decisions', label: 'Decision Log', status: 'live' },
];

// Shelved for now (2026-09-21 pivot to "just serve up the data") — the
// routes are still registered in App.jsx and reachable by URL, just not in
// this nav while the simpler export is the lead experience. See
// docs/CONTEXT.md. Not rendered; kept here as the record of what moved out.
// /queue (Request Queue, blocked), /pods (Pod Capacity, planned),
// /one-pagers (One-Pagers, planned), /finance (Finance Reconciliation, planned)

export default function NavShell({ children }) {
  return (
    <div className="app-shell">
      <nav className="nav">
        <h1>ALIS Product Ops</h1>
        <p className="tagline">Evidence, not negotiation</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span>{item.label}</span>
            <span className={`badge ${item.status}`}>{item.status}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
