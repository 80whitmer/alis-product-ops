const express = require('express');
const router = express.Router();
const { getContractedModulesForCompany } = require('../services/hubspotDeals');
const { getKeyContactsForCompany } = require('../services/hubspotContacts');
const { getLiveEntitlements } = require('../services/alisEntitlements');
const { discoverAlisAdminIds } = require('../services/alisCompanyDiscovery');
const { startPortfolioEntitlementsCheck, getStatus: getPortfolioEntitlementsStatus, getPortfolioEntitlementRollup } = require('../services/portfolioEntitlementsJob');
const {
  getAlisAdminId, setAlisAdminId, bulkSetAlisAdminIds, deleteAlisAdminId,
  setCompanyHost, bulkSetCompanyHosts, deleteCompanyHost, listAlisAdminIds,
} = require('../db/database');

// The portfolio-wide company list used to live at GET /api/accounts, but it
// duplicated /api/export's own equally-expensive company+ticket-history
// pull (confirmed live, Sep 2026: refreshing one page never updated the
// other's cache, and Aaron asked for them to move together) — Account
// Truth now reads companies straight from the shared DataCache the
// Dashboard already populates (client/src/DataCache.jsx) instead of
// fetching its own copy. Every per-account route below is unaffected.

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
  const imported = bulkSetAlisAdminIds(rows);
  res.json({ imported });
});

// PUT /api/accounts/:id/company-host — set/update one account's ALIS
// subdomain (e.g. "vivaeast" -> vivaeast.alisonline.com). Comma-separate
// multiple hosts in one string for a multi-instance account, same
// convention as alis-hub's own company_hosts mapping.
router.put('/:id/company-host', (req, res) => {
  const { companyHost, companyName } = req.body || {};
  if (!companyHost || !String(companyHost).trim()) {
    return res.status(400).json({ error: 'companyHost is required' });
  }
  setCompanyHost({ hubspotCompanyId: req.params.id, companyName, companyHost: String(companyHost).trim() });
  res.status(204).end();
});

// DELETE /api/accounts/:id/company-host
router.delete('/:id/company-host', (req, res) => {
  deleteCompanyHost(req.params.id);
  res.status(204).end();
});

// POST /api/accounts/company-hosts/import — bulk version, for the
// Download/Upload ALIS Subdomains template (same file format alis-hub's
// own AccountHealthDashboard produces — its completed templates can be
// re-uploaded here as-is).
router.post('/company-hosts/import', (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'Expected { rows: [{ hubspotCompanyId, companyName, companyHost }] }' });
  }
  const imported = bulkSetCompanyHosts(rows);
  res.json({ imported });
});

// POST /api/accounts/alis-admin-ids/discover — scrapes ALIS admin's own
// company directory and proposes ALIS Admin Company ID matches by name
// against `companies` (the client's already-loaded portfolio list, sent
// in the body — same reasoning as live-entitlements' `products` param:
// avoids this route re-fetching the whole company list itself). A
// proposal only; nothing is saved until the reviewed result is POSTed to
// /alis-admin-ids/import below.
router.post('/alis-admin-ids/discover', async (req, res, next) => {
  try {
    const companies = req.body?.companies;
    if (!Array.isArray(companies)) {
      return res.status(400).json({ error: 'Expected { companies: [{ id, name, alisAdminCompanyId }] }' });
    }
    const result = await discoverAlisAdminIds(companies);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/accounts/:id/live-entitlements?products=A,B,C — logs into ALIS
// admin and scrapes this account's real Entitlements page, grouped by ALIS
// product category and cross-checked against `products` (the company's
// HubSpot alis_products, already in the client's cache — cheaper than this
// route re-fetching the company just for one property). Needs an
// alis_admin_ids row for this account first (see the two routes above) —
// 400s with a clear message if there isn't one yet, rather than a
// confusing scrape failure.
router.get('/:id/live-entitlements', async (req, res, next) => {
  try {
    const alisAdminCompanyId = getAlisAdminId(req.params.id);
    if (!alisAdminCompanyId) {
      return res.status(400).json({ error: 'No ALIS Admin Company ID set for this account yet — enter one below before running a live check.' });
    }
    const hubspotProducts = typeof req.query.products === 'string'
      ? req.query.products.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const result = await getLiveEntitlements(alisAdminCompanyId, hubspotProducts);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/accounts/portfolio-entitlements/run — kicks off a portfolio-
// wide live entitlements scrape (server/services/portfolioEntitlementsJob.js),
// one account at a time, over every account with an ALIS Admin Company ID
// on file. Deliberately manual/separate from the normal Refresh (Aaron,
// Sep 2026) — a real ALIS admin login+scrape per account is slow, and this
// hits production on purpose only when asked. `companies` (name lookup)
// comes from the client's already-loaded portfolio, same as discover/
// live-entitlements above. 202 + poll /status rather than blocking the
// request for what could be a very long run.
router.post('/portfolio-entitlements/run', (req, res) => {
  const companies = req.body?.companies;
  if (!Array.isArray(companies)) {
    return res.status(400).json({ error: 'Expected { companies: [{ id, name }] }' });
  }
  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  const accounts = listAlisAdminIds().map((r) => ({
    hubspotCompanyId: r.hubspot_company_id,
    companyName: nameById.get(r.hubspot_company_id) || null,
    alisAdminCompanyId: r.alis_admin_company_id,
  }));
  if (accounts.length === 0) {
    return res.status(400).json({ error: 'No accounts have an ALIS Admin Company ID on file yet.' });
  }
  const started = startPortfolioEntitlementsCheck(accounts);
  if (!started) {
    return res.status(409).json({ error: 'A portfolio entitlement check is already running.' });
  }
  res.status(202).json({ started: true, total: accounts.length });
});

// GET /api/accounts/portfolio-entitlements/status — job progress plus the
// current %-enabled-per-flag rollup computed from whatever's been captured
// so far (so results are visible mid-run, not just after it finishes, and
// persist across page reloads since they're read from the DB, not job
// memory).
router.get('/portfolio-entitlements/status', (req, res) => {
  res.json({ job: getPortfolioEntitlementsStatus(), rollup: getPortfolioEntitlementRollup() });
});

module.exports = router;
