/**
 * Client Tier filter pills for an accounts table — Aaron, Sep 2026: "add the
 * filter buttons to the Account Truth table and the account table a la the
 * filter buttons on the All Deals table on the Account Health page"
 * (alis-hub's own category-pill pattern, ported here). Multiselect (Sep
 * 2026, Aaron: "would love this to be the standard around the apps...
 * filter pills that can be multiselected to filter for specific combos of
 * data") — `tierFilter` is a Set of active tier labels rather than a single
 * value; any number can be active at once ("Tier 1 + Tier 2"), empty Set
 * means no filter ("All").
 */
const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };

function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

/** Filters a list of accounts (each with a `.tier` field) down to whichever tier labels are in `tierFilter` (a Set), or returns it unchanged when the set is empty ("All"). */
export function filterByTier(accounts, tierFilter) {
  if (!tierFilter || tierFilter.size === 0) return accounts;
  return accounts.filter((a) => tierFilter.has(tierLabel(a.tier)));
}

export default function TierFilterPills({ accounts, tierFilter, onChange }) {
  const counts = {};
  for (const a of accounts) {
    const t = tierLabel(a.tier);
    counts[t] = (counts[t] || 0) + 1;
  }
  const tiersPresent = TIER_ORDER.filter((t) => counts[t] > 0);
  const active = tierFilter || new Set();

  function toggle(t) {
    const next = new Set(active);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onChange(new Set())}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          active.size === 0 ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
        }`}
      >
        All ({accounts.length})
      </button>
      {tiersPresent.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => toggle(t)}
          className="text-xs px-2.5 py-1 rounded-full border transition-colors"
          style={
            active.has(t)
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
