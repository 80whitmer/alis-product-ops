import { useState } from 'react';

/**
 * Live ALIS entitlements grouped by product category (server/services/
 * entitlementCategories.js), with each category flagged against whether
 * it's recorded as sold in HubSpot's alis_products field — Aaron, Sep
 * 2026: "flag any mismatch between hubspot and what has been enabled...
 * recommendations to enable or disable anything."
 */

const STATUS = {
  sold_not_enabled: { label: 'Sold — nothing enabled', hint: 'Recommend turning on', bg: '#fff4e5', border: '#f3c98b', dot: '#d97706' },
  enabled_not_sold: { label: 'Enabled — not recorded as sold', hint: 'Confirm with HubSpot, or disable', bg: '#eaf1ff', border: '#b9cdf5', dot: '#2563eb' },
  aligned: { label: 'Sold & enabled', hint: null, bg: '#e8f5ec', border: '#b7dfc3', dot: '#16a34a' },
  not_applicable: { label: 'Not sold', hint: null, bg: '#f5f5f4', border: '#e2e0dc', dot: '#a3a3a3' },
  uncategorized: { label: 'Uncategorized', hint: 'Could not be matched to a product by name', bg: '#f5f5f4', border: '#e2e0dc', dot: '#a3a3a3' },
};

function CategoryRow({ category }) {
  const [open, setOpen] = useState(category.status === 'sold_not_enabled' || category.status === 'enabled_not_sold');
  const s = STATUS[category.status];
  return (
    <div style={{ border: `1px solid ${s.border}`, background: s.bg, borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: s.dot, flexShrink: 0 }} />
        <strong style={{ fontSize: 13 }}>{category.name}</strong>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{category.enabledCount} of {category.totalCount} on</span>
        <span style={{ fontSize: 12, marginLeft: 'auto' }}>{s.label}{s.hint ? ` — ${s.hint}` : ''}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {category.items.map((f) => (
            <span
              key={f.id}
              title={f.enabled ? 'Enabled' : 'Disabled'}
              style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 999,
                background: f.enabled ? '#e8f5ec' : '#fff',
                border: f.enabled ? '1px solid #b7dfc3' : '1px dashed #d4d4d4',
                color: f.enabled ? 'inherit' : 'var(--ink-soft)',
              }}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EntitlementCategories({ result }) {
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
        {result.enabledCount} of {result.totalFlagCount} entitlements on, as of{' '}
        {new Date(result.capturedAt).toLocaleString()} —{' '}
        <a href={result.sourceUrl} target="_blank" rel="noreferrer">view in ALIS admin</a>
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', margin: '0 0 10px', fontStyle: 'italic' }}>
        Categories are inferred from each flag's name, not an official ALIS mapping — treat "Uncategorized" and
        borderline matches as a starting point, not ground truth.
      </p>
      {result.soldWithNoFlags?.length > 0 && (
        <div className="notice" style={{ marginBottom: 10, fontSize: 12.5 }}>
          Sold in HubSpot but no matching flags were found on this account's ALIS admin page: <strong>{result.soldWithNoFlags.join(', ')}</strong>.
        </div>
      )}
      {result.categories.map((c) => <CategoryRow key={c.name} category={c} />)}
    </div>
  );
}
