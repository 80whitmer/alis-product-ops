/**
 * database.js
 * Uses sql.js (pure JS SQLite — no native compilation required), same
 * pattern as alis-hub's server/db/database.js. DB persisted to disk
 * manually on every write via saveToDisk().
 *
 * Only table so far is `decisions` — the durable decision log (view #6 in
 * docs/CONTEXT.md). The other views either aren't built yet or don't need
 * persisted state (Contract Truth is a live on-demand HubSpot lookup, not
 * cached — see server/api/accounts.js).
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'product-ops.sqlite');

let db;

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('DB loaded from disk:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('DB created (new):', DB_PATH);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS decisions (
      id            TEXT PRIMARY KEY,
      subject       TEXT NOT NULL,
      outcome       TEXT NOT NULL,
      evidence      TEXT,
      decided_by    TEXT NOT NULL,
      decided_at    TEXT NOT NULL,
      related_url   TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function saveToDisk() {
  const buf = Buffer.from(db.export());
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buf);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = [];
  stmt.bind(params);
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveToDisk();
}

function listDecisions() {
  return queryAll('SELECT * FROM decisions ORDER BY decided_at DESC');
}

function addDecision({ id, subject, outcome, evidence, decidedBy, decidedAt, relatedUrl }) {
  run(
    `INSERT INTO decisions (id, subject, outcome, evidence, decided_by, decided_at, related_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, subject, outcome, evidence || null, decidedBy, decidedAt, relatedUrl || null]
  );
}

function deleteDecision(id) {
  run('DELETE FROM decisions WHERE id = ?', [id]);
}

module.exports = { initDb, listDecisions, addDecision, deleteDecision };
