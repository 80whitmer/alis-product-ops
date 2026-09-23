/**
 * Read-only Playwright capture of a company's ALIS Entitlements page
 * (admin.alisonline.com/Customers/EntitlementSets/EditCompany/{id}) —
 * ported verbatim from alis-hub's server/automation/playwright/
 * entitlementsPage.js, confirmed live there (2026-09-03, company 353):
 * every entitlement toggle is a checkbox whose id/name is
 * `<feature_slug>_entitlement_<numericId>` — no useful <label> text is
 * attached, so this reads the id directly rather than resolving a display
 * label (see server/services/alisEntitlements.js for the humanized name).
 */
async function captureEntitlements(page, companyId) {
  const url = `https://admin.alisonline.com/Customers/EntitlementSets/EditCompany/${companyId}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const flags = {};
    document.querySelectorAll('input[type="checkbox"][id*="_entitlement_"]').forEach((cb) => {
      flags[cb.id] = cb.checked;
    });
    const entitlementSetSelect = document.querySelector('#EntitlementSetId');
    return {
      flags,
      entitlementSetId: entitlementSetSelect ? entitlementSetSelect.value : null,
    };
  });

  const flagCount = Object.keys(result.flags).length;
  if (flagCount === 0) {
    throw new Error(`No entitlement checkboxes found on ${url} — page structure may have changed, or company ${companyId} doesn't exist`);
  }

  return {
    capturedAt: new Date().toISOString(),
    sourceUrl: url,
    companyId: String(companyId),
    entitlementSetId: result.entitlementSetId,
    flags: result.flags, // { [entitlementFlagId]: boolean }
  };
}

module.exports = { captureEntitlements };
