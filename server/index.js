require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDb } = require('./db/database');
const accountsRouter = require('./api/accounts');
const decisionsRouter = require('./api/decisions');
const exportRouter = require('./api/export');
const kpiRouter = require('./api/kpi');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors({ origin: 'http://localhost:5174' }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/accounts', accountsRouter);
app.use('/api/decisions', decisionsRouter);
app.use('/api/export', exportRouter);
app.use('/api/kpi', kpiRouter);
app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

app.use((err, req, res, next) => {
  console.error('[Express Error Handler]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\nalis-product-ops server running at http://localhost:${PORT}\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
