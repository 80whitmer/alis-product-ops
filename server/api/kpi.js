const express = require('express');
const router = express.Router();
const { getKpiMetricHistory } = require('../db/database');

// GET /api/kpi/history — every captured KPI snapshot point (see
// server/services/kpiMetrics.js and /api/export, which writes these as a
// side effect of every load). One point per {scope_key, metric_key, day} —
// nothing to plot until this has been loaded across a few different
// calendar days.
router.get('/history', (req, res) => {
  res.json({
    tier: getKpiMetricHistory('tier'),
    portfolio: getKpiMetricHistory('portfolio'),
    arrBand: getKpiMetricHistory('arr_band'),
  });
});

module.exports = router;
