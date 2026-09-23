const express = require('express');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getContractedModulesForCompany } = require('../services/hubspotDeals');
const { getKeyContactsForCompany } = require('../services/hubspotContacts');
const { getTicketHistory, withEnhancementCounts } = require('../services/hubspotRequests');
const { getLiveEntitlements } = require('../services/alisEntitlements');
const { listAlisAdminIds, getAlisAdminId, setAlisAdminId, bulkSetAlisAdminIds, deleteAlisAdminId } = require('../db/database');

// GET /api/accounts — portfolio-wide, no owner scoping. Same
// open/closed Enhancement Request counts as the Dashboard's Accounts
// table (server/api/export.js) — this is the same portfolio-wide ticket
// pull, so the page costs the same ~1-2 minutes that one does rather than
// staying a fast company-only load, but the two lists would otherwise
// silently disagree on these two columns.
router.get('/', async (req, res, next) => {
  try {
    const rawCompanies = await getAllHomeOfficeCompanies();
    const companiesById = new Map(rawCompanies.map((c) => [c.id, c]));
    const ticketHistory = await getTicketHistory({ lookbackDays: 400, companiesById });
    let companies = withEnhancementCounts(rawCompanies, ticketHistory);
    const alisAdminIdByCompany = new Map(listAlisAdminIds().map((r) => [r.hubspot_company_id, r.alis_admin_company_id]));
    companies = companies.map((c) => ({ ...c, alisAdminCompanyId: alisAdminIdByCompany.get(c.id) || null }));
    res.json({ companies });
  } catch (err) {
    next(err);
  }
});

// GET /api/accounts/:id/contract-truth
// "Contracted" side of the usage-audit RAG grid, live (no cache). Enabled
// (ALIS entitlements) and Used (ALIS export API) columns aren't ported yet
// — see docs/CONTEXT.md view #2. lineItems will come back empty per deal
// until the shared HubSpot token has the line_items scopes — flagged via
// `scopeWarning` rather than failing, so the deal list is still useful.
router.get('/:id/contract-truth', async (req, res, next) => {
  try {
    const deals = await getContractedModulesForCompany(req.params.id);
    const anyBlocked = deals.some((d) => d.lineItemsBlocked);
    res.json({
      deals,
      scopeWarning: anyBlocked
        ? 'Line items are blocked — the HubSpot private app token is missing crm.objects.line_items.read / crm.schemas.line_items.read. Deal-level info (name, ARR, close date) is still real.'
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/accounts/:id/contacts — key contacts for the "who do we actually
// call at this account" question, live (no cache).
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const contacts = await getKeyContactsForCompany(req.params.id);
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

// PUT /api/accounts/:id/alis-admin-id — set/update one account's ALIS admin
// Company ID (the "Customers/EntitlementSets/EditCompany/{id}" numeric id),
// which this app has no automated way to resolve — entered by hand once,
// reused on every future live check.
router.put('/:id/alis-admin-id', (req, res) => {
  const { alisAdminCompanyId, companyName } = req.body || {};
  if (!alisAdminCompanyId || !String(alisAdminCompanyId).trim()) {
    return res.status(400).json({ error: 'alisAdminCompanyId is required' });
  }
  setAlisAdminId({ hubspotCompanyId: req.params.id, companyName, alisAdminCompanyId: String(alisAdminCompanyId).trim() });
  res.status(204).end();
});

// DELETE /api/accounts/:id/alis-admin-id — clears a wrong/stale mapping.
router.delete('/:id/alis-admin-id', (req, res) => {
  deleteAlisAdminId(req.params.id);
  res.status(204).end();
});

// POST /api/accounts/alis-admin-ids/import — bulk version of the above, for
// the Download Template / Upload Completed Template flow (mirrors
// alis-hub's CompanyHostMappingButtons pattern for its own ALIS-subdomain
// mapping). Rows with no ID are silently skipped, not an error — filling
// this in gradually, one account at a time, is the expected path.
router.post('/alis-admin-ids/import', (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'Expected { rows: [{ hubspotCompanyId, companyName, alisAdminCompanyId }] }' });
  }
  bulkSetAlisAdminIds(rows);
  res.json({ imported: rows.filter((r) => r.alisAdminCompanyId).length });
});

// GET /api/accounts/:id/live-entitlements — logs into ALIS admin and scrapes
// this account's real Entitlements page. Needs an alis_admin_ids row for
// this account first (see the two routes above) — 400s with a clear message
// if there isn't one yet, rather than a confusing scrape failure.
router.get('/:id/live-entitlements', async (req, res, next) => {
  try {
    const alisAdminCompanyId = getAlisAdminId(req.params.id);
    if (!alisAdminCompanyId) {
      return res.status(400).json({ error: 'No ALIS Admin Company ID set for this account yet — enter one below before running a live check.' });
    }
    const result = await getLiveEntitlements(alisAdminCompanyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
