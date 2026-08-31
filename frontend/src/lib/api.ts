// One place for every backend call. Endpoints unchanged; names are plain.
const BASE = '/api';
const KEY = { 'X-API-Key': 'test-api-key' };

async function j(res: Response) {
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
    }
    return res.json();
}

// -- overview -----------------------------------------------------------------
export const getOverview = () => fetch(`${BASE}/dashboard/metrics`).then(j);

// -- cases ------------------------------------------------------------------
export const listCases = () => fetch(`${BASE}/cases`).then(j);
export const getCase = (id: string) => fetch(`${BASE}/system/cases/${id}`).then(j);
export const getCaseHistory = (id: string) => fetch(`${BASE}/cases/${id}/audit`).then(j);
export const runCase = (id: string) =>
    fetch(`${BASE}/cases/${id}/advance`, { method: 'POST', headers: KEY }).then(j);
export const executeCase = (id: string) =>
    fetch(`${BASE}/cases/${id}/execute`, { method: 'POST', headers: KEY }).then(j);
export const verifyCase = (id: string, reference: string) =>
    fetch(`${BASE}/cases/${id}/verify`, {
        method: 'POST', headers: { ...KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_reference: reference }),
    }).then(j);
export const decideCase = (id: string, decision: 'APPROVE' | 'REJECT', note: string) =>
    fetch(`${BASE}/cases/${id}/human-review`, {
        method: 'POST', headers: { ...KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
    }).then(j);

// -- data import ----------------------------------------------------------
export const uploadData = (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/datasets/upload`, { method: 'POST', body: fd }).then(j);
};
export const analyzeData = (id: string) =>
    fetch(`${BASE}/datasets/${id}/analyze`, { method: 'POST' }).then(j);
export const getImport = (id: string) => fetch(`${BASE}/datasets/${id}`).then(j);
export const getImportStatus = (id: string) =>
    fetch(`${BASE}/datasets/${id}/workflow-status`).then(j);
export const previewData = (id: string, limit = 8) =>
    fetch(`${BASE}/datasets/${id}/preview?limit=${limit}`).then(j);
export const confirmColumns = (id: string, mappings: any[]) =>
    fetch(`${BASE}/datasets/${id}/mapping`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
    }).then(j);
export const prepareForCases = (id: string) =>
    fetch(`${BASE}/datasets/${id}/ml-readiness`, { method: 'POST' }).then(j);
export const buildCases = (id: string, maxCases = 100) =>
    fetch(`${BASE}/datasets/${id}/generate-cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_cases: maxCases }),
    }).then(j);
