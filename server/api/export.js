const express = require('express');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getActiveRequestRows } = require('../services/hubspotRequests');

// GET /api/export — the V1 "just serve up the data" endpoint. Returns raw,
// unscored rows for the two sheets Trisha's/BI's team plug into their own
// existing spreadsheet/DOMO setup: the account roster, and every currently
// active enhancement/escalation/support request with account context
// (ARR/tier) attached. No queue, no scoring, no decision log here.
router.get('/', async (req, res, next) => {
  try {
    const companies = await getAllHomeOfficeCompanies();
    const companiesById = new Map(companies.map((c) => [c.id, c]));
    const requests = await getActiveRequestRows({ lookbackDays: 120, companiesById });
    res.json({ generatedAt: new Date().toISOString(), companies, requests });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
