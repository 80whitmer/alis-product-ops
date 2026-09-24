import { useEffect, useRef, useState } from 'react';

/**
 * Quick links to ALIS/ALIS Admin pages for an account (Sep 2026, Aaron:
 * "add the important link menu with the link icon to the account rows on
 * the Product hub Dashboard -- don't include a hubspot link because the
 * product team likely cannot access this as they do not have a direct
 * hubspot seat"). Ported from alis-hub's client/src/components/
 * AlisQuickLinks.jsx, with the HubSpot group dropped entirely (not just
 * hidden) since this app's own users generally have no HubSpot seat at
 * all — unlike alis-hub's version, `hubspotUrl` isn't even a prop here.
 * Keyed off companyHost/alisAdminCompanyId, both already on every company
 * object from GET /api/export (server/api/export.js's withAlisMappings).
 */
// Alphabetical within each group (Sep 2026, Aaron) — labels, not URLs, sort order.
const HOST_LINKS = [
  { label: 'All Communities', path: (host) => `https://${host}.alisonline.com/Communities?tab=Communities` },
  { label: 'App Store', path: (host) => `https://${host}.alisonline.com/AppStore/Apps` },
  { label: 'Company Settings', path: (host) => `https://${host}.alisonline.com/Settings/Company` },
  { label: 'Imports', path: (host) => `https://${host}.alisonline.com/Imports` },
  { label: 'Print Center', path: (host) => `https://${host}.alisonline.com/Documents/Print/Index?tab=Print` },
  { label: 'Reports', path: (host) => `https://${host}.alisonline.com/Reports?tab=ALISReports` },
];

const ADMIN_ID_LINKS = [
  { label: 'Admin: API Access', path: (id) => `https://admin.alisonline.com/Customers/ApiUsers/${id}` },
  { label: 'Admin: Company Page', path: (id) => `https://admin.alisonline.com/Customers/Companies/${id}` },
  { label: 'Admin: Security Roles', path: (id) => `https://admin.alisonline.com/Customers/Roles/${id}` },
];

function parseHosts(companyHost) {
  return String(companyHost || '').split(',').map((h) => h.trim()).filter(Boolean);
}

export default function AlisQuickLinks({ companyHost, alisAdminCompanyId, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const hosts = parseHosts(companyHost);
  const showHostLabel = hosts.length > 1;
  const groups = [];

  for (const host of hosts) {
    groups.push({
      heading: showHostLabel ? host : 'ALIS',
      links: HOST_LINKS.map((l) => ({ label: l.label, url: l.path(host) })),
    });
  }
  if (alisAdminCompanyId) {
    groups.push({ heading: 'ALIS Admin', links: ADMIN_ID_LINKS.map((l) => ({ label: l.label, url: l.path(alisAdminCompanyId) })) });
  }

  if (groups.length === 0) return null;

  return (
    <span className={`relative inline-block ${className}`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-cool-glacier hover:underline shrink-0"
        title="Quick links — ALIS, ALIS Admin"
      >
        🔗
      </button>
      {open && (
        <div className="absolute z-20 left-0 mt-1 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
          {groups.map((g, i) => (
            <div key={i} className={i > 0 ? 'border-t border-neutral-100 mt-1 pt-1' : ''}>
              {g.heading && <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g.heading}</p>}
              {g.links.map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
