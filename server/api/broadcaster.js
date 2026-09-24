// Simple in-process SSE broadcaster — ported from alis-hub's own
// server/api/broadcaster.js (Sep 2026, Aaron: port the ALIS Photo
// Migrator's live-log idea to product-ops too). Each channel (a jobId, or
// a fixed name for a singleton job) gets its own set of connected clients;
// when a job emits progress, it calls broadcast(channel, event, data).
const clients = new Map(); // channel -> Set<res>

function subscribe(channel, res) {
  if (!clients.has(channel)) clients.set(channel, new Set());
  clients.get(channel).add(res);
}

function unsubscribe(channel, res) {
  clients.get(channel)?.delete(res);
}

function broadcast(channel, eventName, data) {
  const subs = clients.get(channel);
  if (!subs || subs.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

module.exports = { subscribe, unsubscribe, broadcast };
