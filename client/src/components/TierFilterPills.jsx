/**
 * Client Tier filter pills for an accounts table — Aaron, Sep 2026: "add the
 * filter buttons to the Account Truth table and the account table a la the
 * filter buttons on the All Deals table on the Account Health page"
 * (alis-hub's own category-pill pattern, ported here). Single-select:
 * clicking the active pill again clears back to "All".
 */
const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

/** Filters a list of accounts (each with a `.tier` field) down to one tier label, or returns it unchanged when `tierFilter` is null ("All"). */
export function filterByTier(accounts, tierFilter) {
  if (!tierFilter) return accounts;
  return accounts.filter((a) => tierLabel(a.tier) === tierFilter);
}

export default function TierFilterPills({ accounts, tierFilter, onChange }) {
  const counts = {};
  for (const a of accounts) {
    const t = tierLabel(a.tier);
    counts[t] = (counts[t] || 0) + 1;
  }
  const tiersPresent = TIER_ORDER.filter((t) => counts[t] > 0);

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          !tierFilter ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
        }`}
      >
        All ({accounts.length})
      </button>
      {tiersPresent.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(tierFilter === t ? null : t)}
          className="text-xs px-2.5 py-1 rounded-full border transition-colors"
          style={
            tierFilter === t
              ? { background: TIER_COLOR[t], color: 'white', borderColor: TIER_COLOR[t] }
              : { background: 'white', color: TIER_COLOR[t], borderColor: TIER_COLOR[t] }
          }
        >
          {t} ({counts[t]})
        </button>
      ))}
    </div>
  );
}
