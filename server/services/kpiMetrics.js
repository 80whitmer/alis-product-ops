/**
 * Portfolio-aggregate KPI metrics grouped by Client Tier or an ARR band —
 * the "ARR by Tier / Companies by Tier / Communities by Tier / Companies by
 * ARR / ARR Added This Year by Tier" views (Aaron, Sep 2026), ported from
 * alis-hub's TeamAmDashboard.jsx equivalents. No Account Manager axis here
 * (Aaron, Sep 2026: by-AM KPIs belong on the AM boards, not the product
 * team's). Computed from the same `companies` array export.js already
 * builds — no extra HubSpot calls.
 *
 * Average ARR/capacity per company or per community aren't tracked as
 * their own metric_key — they're derived client-side (see
 * client/src/components/KpiCharts.jsx) by dividing the arrCents/
 * totalCapacityBeds history by the companyCount/communityCount history for
 * the same date, so trending them needed no new storage.
 */

// Same "Tier 0 and null both mean Unassigned" convention as
// client/src/components/TicketCharts.jsx's tierLabel — kept in sync by
// convention, not import (this is a server file, that's a client one).
function tierLabel(tier) {
  return (tier == null || tier === 0) ? 'Unassigned' : `Tier ${tier}`;
}

const TIER_KEYS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];

const METRIC_KEYS = [
  'arrCents', 'companyCount', 'communityCount', 'totalCapacityBeds',
  'arrAddedThisYearCents', 'companiesContributingArrThisYear', 'communitiesContributingArrThisYear',
];

// Ordered so the bar chart reads low-to-high ARR left to right.
const ARR_BANDS = [
  { key: 'No ARR', maxDollars: 0 },
  { key: '$1–25k', maxDollars: 25000 },
  { key: '$25k–50k', maxDollars: 50000 },
  { key: '$50k–100k', maxDollars: 100000 },
  { key: '$100k–250k', maxDollars: 250000 },
  { key: '$250k–500k', maxDollars: 500000 },
  { key: '$500k+', maxDollars: Infinity },
];

function arrBandFor(arrCents) {
  const dollars = (arrCents || 0) / 100;
  for (const band of ARR_BANDS) {
    if (dollars <= band.maxDollars) return band.key;
  }
  return ARR_BANDS[ARR_BANDS.length - 1].key;
}

function emptyBucket() {
  return {
    arrCents: 0, companyCount: 0, communityCount: 0, totalCapacityBeds: 0,
    arrAddedThisYearCents: 0, companiesContributingArrThisYear: 0, communitiesContributingArrThisYear: 0,
  };
}

/**
 * Rolls every company up by tier and into a 'portfolio' total plus an
 * ARR-band histogram, returning both `current` (for immediate rendering)
 * and `rows` (flattened for database.recordKpiMetricSnapshots).
 * "Contributing ARR this year" = the company has closed-won ARR this
 * calendar year (arrAddedThisYearCents > 0). The community version sums
 * those companies' CURRENT community counts — deals are associated with
 * the Home Office, not the individual community, so which communities a
 * deal covered isn't knowable here; directional, not exact.
 */
function computeTierSnapshotRows(companies) {
  const byTier = new Map(TIER_KEYS.map((k) => [k, emptyBucket()]));
  const portfolio = emptyBucket();
  const byArrBand = new Map();

  for (const c of companies) {
    const tierBucket = byTier.get(tierLabel(c.tier));
    const contributedArr = (c.arrAddedThisYearCents || 0) > 0;

    for (const target of [tierBucket, portfolio]) {
      target.arrCents += c.arrCents || 0;
      target.companyCount += 1;
      target.communityCount += c.communityCount || 0;
      target.totalCapacityBeds += c.totalCapacity || 0;
      target.arrAddedThisYearCents += c.arrAddedThisYearCents || 0;
      if (contributedArr) {
        target.companiesContributingArrThisYear += 1;
        target.communitiesContributingArrThisYear += c.communityCount || 0;
      }
    }

    const band = arrBandFor(c.arrCents);
    if (!byArrBand.has(band)) byArrBand.set(band, new Map());
    const byTierInBand = byArrBand.get(band);
    const tKey = tierLabel(c.tier);
    byTierInBand.set(tKey, (byTierInBand.get(tKey) || 0) + 1);
  }

  const rows = [];
  for (const [tierKey, m] of byTier) {
    for (const metricKey of METRIC_KEYS) {
      rows.push({ scope: 'tier', scopeKey: tierKey, metricKey, value: m[metricKey] });
    }
  }
  for (const metricKey of METRIC_KEYS) {
    rows.push({ scope: 'portfolio', scopeKey: 'portfolio', metricKey, value: portfolio[metricKey] });
  }
  for (const band of ARR_BANDS) {
    const byTierInBand = byArrBand.get(band.key) || new Map();
    const total = [...byTierInBand.values()].reduce((sum, n) => sum + n, 0);
    // Trend history only tracks the total per band (unchanged shape/metric
    // key) — the tier breakdown below is for the current, colored-by-tier
    // bar chart only (Aaron, Sep 2026: "color code these bar graphs by
    // standard tier color"), not trended, to avoid a metric-key-per-tier
    // explosion in kpi_metric_history for a view that's a snapshot anyway.
    rows.push({ scope: 'arr_band', scopeKey: band.key, metricKey: 'companyCount', value: total });
  }

  return {
    rows,
    current: {
      byTier: Object.fromEntries(byTier),
      portfolio,
      byArrBand: ARR_BANDS.map((b) => {
        const byTierInBand = byArrBand.get(b.key) || new Map();
        const row = { band: b.key, companyCount: 0 };
        for (const tierKey of TIER_KEYS) row[tierKey] = byTierInBand.get(tierKey) || 0;
        row.companyCount = TIER_KEYS.reduce((sum, t) => sum + row[t], 0);
        return row;
      }),
    },
  };
}

module.exports = { computeTierSnapshotRows, tierLabel, TIER_KEYS, ARR_BANDS };
