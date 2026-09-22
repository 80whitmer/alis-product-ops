import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/queue', label: 'Request Queue', status: 'blocked' },
  { to: '/accounts', label: 'Account Truth', status: 'live' },
  { to: '/pods', label: 'Pod Capacity', status: 'planned' },
  { to: '/one-pagers', label: 'One-Pagers', status: 'planned' },
  { to: '/finance', label: 'Finance Reconciliation', status: 'planned' },
  { to: '/decisions', label: 'Decision Log', status: 'live' },
];

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
