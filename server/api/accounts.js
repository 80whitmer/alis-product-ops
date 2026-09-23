const express = require('express');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getContractedModulesForCompany } = require('../services/hubspotDeals');
const { getKeyContactsForCompany } = require('../services/hubspotContacts');

// GET /api/accounts — portfolio-wide, no owner scoping.
router.get('/', async (req, res, next) => {
  try {
    const companies = await getAllHomeOfficeCompanies();
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

module.exports = router;
