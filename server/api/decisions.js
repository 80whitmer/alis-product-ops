const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { listDecisions, addDecision, deleteDecision } = require('../db/database');

router.get('/', (req, res) => {
  res.json({ decisions: listDecisions() });
});

router.post('/', (req, res) => {
  const { subject, outcome, evidence, decidedBy, decidedAt, relatedUrl } = req.body || {};
  if (!subject || !outcome || !decidedBy || !decidedAt) {
    return res.status(400).json({ error: 'subject, outcome, decidedBy, and decidedAt are required' });
  }
  const id = randomUUID();
  addDecision({ id, subject, outcome, evidence, decidedBy, decidedAt, relatedUrl });
  res.status(201).json({ id });
});

router.delete('/:id', (req, res) => {
  deleteDecision(req.params.id);
  res.status(204).end();
});

module.exports = router;
