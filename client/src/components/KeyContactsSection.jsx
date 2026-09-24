import { useMemo, useState } from 'react';

/**
 * Portfolio-wide Key Contacts — ported from alis-hub's AccountHealthDashboard.jsx
 * KeyContactsSection (Aaron, Sep 2026: "build out a parallel key contacts
 * section... on the Product hub dashboard. Could close the gap with
 * product research etc."). Flattens each active company's tagged contacts
 * (data.companies[].keyContacts, already attached portfolio-wide by
 * server/api/export.js's withKeyContacts) into one contact-per-row table.
 */

function flattenKeyContacts(companies) {
  const rows = [];
  for (const c of companies) {
    for (const contact of c.keyContacts || []) {
      rows.push({
        contactId: contact.id,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        url: contact.url,
        roles: contact.roles,
        companyId: c.id,
        companyName: c.name,
        tier: c.tier,
        companyHost: c.companyHost,
      });
    }
  }
  return rows;
}

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

export default function KeyContactsSection({ companies, onExport }) {
  const [search, setSearch] = useState('');

  const rows = useMemo(() => flattenKeyContacts(companies), [companies]);
  const companiesWithContacts = useMemo(() => new Set(rows.map((r) => r.companyId)).size, [rows]);
  const missingCount = useMemo(
    () => companies.filter((c) => (c.missingKeyContactLabels?.length || 0) > 0).length,
    [companies]
  );

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(q) ||
      r.companyName?.toLowerCase().includes(q) ||
      r.title?.toLowerCase().includes(q) ||
      r.roles?.some((role) => role.toLowerCase().includes(q))
    );
  }, [rows, q]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.companyName.localeCompare(b.companyName) || a.name.localeCompare(b.name)),
    [filtered]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs text-neutral-500">
          {rows.length} labeled contact{rows.length === 1 ? '' : 's'} across {companiesWithContacts} account{companiesWithContacts === 1 ? '' : 's'}
          {' — '}{missingCount} account{missingCount === 1 ? '' : 's'} missing at least one tagged role
        </p>
        <button className="btn-secondary btn-sm" onClick={() => onExport(sorted)}>Export</button>
      </div>
      <input
        placeholder="Search name, company, title, or label…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 italic py-4">
          {rows.length === 0 ? 'No contacts tagged with a key role anywhere in the portfolio yet.' : 'No contacts match that search.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Title</th><th>Company</th><th>Tier</th><th>Label(s)</th><th>Email</th><th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((r) => (
                <tr key={`${r.companyId}-${r.contactId}`}>
                  <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">{r.name}</a> : r.name}</td>
                  <td>{r.title || '—'}</td>
                  <td>{r.companyName}</td>
                  <td>{tierLabel(r.tier)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.roles.map((role) => (
                        <span key={role} className="text-[11px] px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200">{role}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-neutral-500">{r.email || '—'}</td>
                  <td className="text-neutral-500">{r.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 100 && <p className="text-xs text-neutral-400 mt-2">Showing 100 of {sorted.length} — narrow your search, or export for the full list.</p>}
        </div>
      )}
    </div>
  );
}
