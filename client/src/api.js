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
export const getDecisions = () => request('/decisions');
export const createDecision = (decision) => request('/decisions', { method: 'POST', body: JSON.stringify(decision) });
export const deleteDecisionById = (id) => request(`/decisions/${id}`, { method: 'DELETE' });
