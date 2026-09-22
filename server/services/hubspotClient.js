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

// `pipeline`/`dealstage` and `hs_pipeline`/`hs_pipeline_stage` come back
// from the API as opaque internal IDs, not the label shown in the HubSpot
// UI — this resolves them, for whichever object type is asked for. Cached
// for the process lifetime (pipeline config rarely changes). Ported from
// alis-hub's server/services/hubspotTickets.js.
const pipelineStageLabelCachePromises = new Map();
async function getPipelineStageLabels(objectType) {
  if (!pipelineStageLabelCachePromises.has(objectType)) {
    pipelineStageLabelCachePromises.set(objectType, (async () => {
      const { status, body } = await hubspotRequest('GET', `/crm/v3/pipelines/${objectType}`);
      if (status !== 200) {
        throw new Error(`HubSpot ${objectType} pipelines lookup failed (${status}): ${JSON.stringify(body)}`);
      }
      const labels = new Map();
      for (const pipeline of body.results || []) {
        for (const stage of pipeline.stages || []) {
          labels.set(`${pipeline.id}:${stage.id}`, { pipeline: pipeline.label, stage: stage.label });
        }
      }
      return labels;
    })().catch((err) => {
      pipelineStageLabelCachePromises.delete(objectType);
      throw err;
    }));
  }
  return pipelineStageLabelCachePromises.get(objectType);
}

/**
 * Company IDs associated with a batch of objects (tickets, deals, ...) via
 * the v4 batch associations endpoint — one call per <=100 objects instead
 * of one call per object. Returns a Map<objectId, companyId[]>. Generic
 * over `fromObjectType` since both hubspotRequests.js (tickets) and
 * hubspotDealsSummary.js (deals) need the identical company join, just
 * against a different source object.
 */
async function batchGetCompanyIdsFor(fromObjectType, objectIds) {
  const result = new Map();
  for (const batch of chunk(objectIds, 100)) {
    const { status, body } = await hubspotRequest('POST', `/crm/v4/associations/${fromObjectType}/companies/batch/read`, {
      inputs: batch.map((id) => ({ id })),
    });
    // HubSpot's v4 batch associations endpoint returns 207 (Multi-Status)
    // even on full success — confirmed live 2026-09-21 (body.status
    // "COMPLETE", every input resolved). Only a body.status other than
    // COMPLETE (or a non-2xx) means something actually went wrong.
    if (status >= 300 || (body.status && body.status !== 'COMPLETE')) {
      throw new Error(`HubSpot ${fromObjectType}->company batch associations failed (${status}): ${JSON.stringify(body)}`);
    }
    for (const entry of body.results || []) {
      const objectId = entry.from?.id;
      // toObjectId comes back as a raw JSON number (confirmed live
      // 2026-09-21), while every company ID elsewhere in this app (from
      // the v3 search/batch-read endpoints) is a string — stringify here
      // so callers can key a Map by company ID without every lookup
      // silently missing on a type mismatch.
      const companyIds = (entry.to || []).map((t) => String(t.toObjectId ?? t.id));
      if (objectId) result.set(objectId, companyIds);
    }
  }
  return result;
}

module.exports = { hubspotRequest, chunk, hubspotRecordUrl, HUBSPOT_OBJECT_TYPE, getPipelineStageLabels, batchGetCompanyIdsFor };
