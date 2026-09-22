/**
 * Generic HubSpot request plumbing, extracted from alis-hub's
 * server/services/hubspotTickets.js (bearer-auth-over-raw-https + 429
 * backoff + batch chunking). Kept as its own module here since
 * hubspotAccounts.js and hubspotDeals.js both need it and neither owns it.
 */
const https = require('https');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hubspotRequestOnce(method, path, body) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return Promise.reject(new Error('HUBSPOT_PRIVATE_APP_TOKEN is not set in server/.env'));
  }

  const bodyStr = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: raw ? JSON.parse(raw) : {} });
        } catch {
          reject(new Error('Non-JSON response from HubSpot'));
        }
      });
    });

    req.on('timeout', () => req.destroy(new Error(`HubSpot ${path} timed out after 30s`)));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** Retries on 429 with Retry-After (or exponential backoff), same as alis-hub. */
async function hubspotRequest(method, path, body, attempt = 1) {
  const res = await hubspotRequestOnce(method, path, body);
  if (res.status === 429 && attempt < 5) {
    const retryAfterHeader = Number(res.headers?.['retry-after']);
    const delayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : 1000 * 2 ** (attempt - 1);
    await sleep(delayMs);
    return hubspotRequest(method, path, body, attempt + 1);
  }
  return res;
}

/** HubSpot's batch/read and search IN-filter endpoints cap inputs per call — chunk to stay under it. */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const HUBSPOT_OBJECT_TYPE = { ticket: '0-5', deal: '0-3', company: '0-2', contact: '0-1', task: '0-27' };

function hubspotRecordUrl(objectType, id) {
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  return portalId && id != null ? `https://app.hubspot.com/contacts/${portalId}/record/${HUBSPOT_OBJECT_TYPE[objectType]}/${id}` : null;
}

module.exports = { hubspotRequest, chunk, hubspotRecordUrl, HUBSPOT_OBJECT_TYPE };
