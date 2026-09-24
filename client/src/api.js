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

export const getExportData = (forceRefresh = false) => request(`/export${forceRefresh ? '?refresh=true' : ''}`);
export const getContractTruth = (id) => request(`/accounts/${id}/contract-truth`);
export const getKeyContacts = (id) => request(`/accounts/${id}/contacts`);
export const getKpiHistory = () => request('/kpi/history');
export const setAlisAdminId = (id, alisAdminCompanyId, companyName) =>
  request(`/accounts/${id}/alis-admin-id`, { method: 'PUT', body: JSON.stringify({ alisAdminCompanyId, companyName }) });
export const importAlisAdminIds = (rows) => request('/accounts/alis-admin-ids/import', { method: 'POST', body: JSON.stringify({ rows }) });
export const discoverAlisAdminIds = (companies) =>
  request('/accounts/alis-admin-ids/discover', { method: 'POST', body: JSON.stringify({ companies }) });
export const runPortfolioEntitlementsCheck = (companies) =>
  request('/accounts/portfolio-entitlements/run', { method: 'POST', body: JSON.stringify({ companies }) });
export const getPortfolioEntitlementsStatus = () => request('/accounts/portfolio-entitlements/status');
export const clearAlisAdminId = (id) => request(`/accounts/${id}/alis-admin-id`, { method: 'DELETE' });
export const setCompanyHost = (id, companyHost, companyName) =>
  request(`/accounts/${id}/company-host`, { method: 'PUT', body: JSON.stringify({ companyHost, companyName }) });
export const importCompanyHosts = (rows) => request('/accounts/company-hosts/import', { method: 'POST', body: JSON.stringify({ rows }) });
export const clearCompanyHost = (id) => request(`/accounts/${id}/company-host`, { method: 'DELETE' });
export const getLiveEntitlements = (id, products = []) =>
  request(`/accounts/${id}/live-entitlements${products.length ? `?products=${encodeURIComponent(products.join(','))}` : ''}`);
export const getDecisions = () => request('/decisions');
export const createDecision = (decision) => request('/decisions', { method: 'POST', body: JSON.stringify(decision) });
export const deleteDecisionById = (id) => request(`/decisions/${id}`, { method: 'DELETE' });
