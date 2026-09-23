async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const getAccounts = () => request('/accounts');
export const getExportData = () => request('/export');
export const getContractTruth = (id) => request(`/accounts/${id}/contract-truth`);
export const getKeyContacts = (id) => request(`/accounts/${id}/contacts`);
export const getKpiHistory = () => request('/kpi/history');
export const setAlisAdminId = (id, alisAdminCompanyId, companyName) =>
  request(`/accounts/${id}/alis-admin-id`, { method: 'PUT', body: JSON.stringify({ alisAdminCompanyId, companyName }) });
export const importAlisAdminIds = (rows) => request('/accounts/alis-admin-ids/import', { method: 'POST', body: JSON.stringify({ rows }) });
export const clearAlisAdminId = (id) => request(`/accounts/${id}/alis-admin-id`, { method: 'DELETE' });
export const getLiveEntitlements = (id) => request(`/accounts/${id}/live-entitlements`);
export const getDecisions = () => request('/decisions');
export const createDecision = (decision) => request('/decisions', { method: 'POST', body: JSON.stringify(decision) });
export const deleteDecisionById = (id) => request(`/decisions/${id}`, { method: 'DELETE' });
