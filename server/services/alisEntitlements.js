/**
 * Live ALIS admin entitlements — the "Used"/"Enabled" side of the audit
 * that's actually a real ALIS check, not just HubSpot's recollection of
 * what was sold (see hubspotAccounts.js's `products`/`package` fields for
 * that side). Requires the ALIS admin Company ID for this account, which
 * this app has no automated way to resolve (see docs on
 * server/db/database.js's alis_admin_ids table) — it's entered by hand once
 * per account, same as alis-hub's own manual "ALIS Admin Company ID(s)"
 * job field.
 *
 * Deliberately simpler than alis-hub's usageAuditCatalog.js: that catalog
 * maps ~36 features with per-mapping confidence levels, built for one
 * specific company's (Imagine Senior Living's) roadmap review — porting it
 * wholesale would carry assumptions ("ambiguous"/"ungated" confidence
 * levels) that don't generalize portfolio-wide. This instead surfaces every
 * checked entitlement flag as its own humanized label, unfiltered — a
 * plainer, more honest "what's actually on" list to compare against
 * HubSpot's `alis_products` tags.
 */
const { newPage, ensureLoggedIn } = require('../automation/playwright/browser');
const { captureEntitlements } = require('../automation/playwright/entitlementsPage');
const { groupEntitlements } = require('./entitlementCategories');

/** "resident_compliance_entitlement_8" -> "Resident Compliance" — strips the "_entitlement_<id>" suffix and title-cases the rest. */
function humanizeFlagId(flagId) {
  const withoutSuffix = flagId.replace(/_entitlement_\d+$/i, '');
  return withoutSuffix
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Logs into ALIS admin, scrapes the Entitlements page for `alisAdminCompanyId`,
 * and returns every flag (on AND off — the "recommend enabling" analysis
 * needs the names of what's currently off, not just what's on) grouped into
 * ALIS product categories and cross-checked against `hubspotProducts`
 * (the company's `alis_products` field) for mismatches. Opens and closes
 * its own browser context per call — see browser.js's doc comment on why
 * there's no cross-call session reuse.
 */
async function getLiveEntitlements(alisAdminCompanyId, hubspotProducts) {
  const page = await newPage();
  try {
    await ensureLoggedIn(page);
    const capture = await captureEntitlements(page, alisAdminCompanyId);
    const flags = Object.entries(capture.flags)
      .map(([id, enabled]) => ({ id, label: humanizeFlagId(id), enabled }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const enabledCount = flags.filter((f) => f.enabled).length;
    const { categories, soldWithNoFlags } = groupEntitlements(flags, hubspotProducts);
    return {
      capturedAt: capture.capturedAt,
      sourceUrl: capture.sourceUrl,
      totalFlagCount: flags.length,
      enabledCount,
      categories,
      soldWithNoFlags,
    };
  } finally {
    await page.context().close();
  }
}

module.exports = { getLiveEntitlements, humanizeFlagId };
