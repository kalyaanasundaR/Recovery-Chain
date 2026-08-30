// API Client for RecoverChain Backend

const BASE_URL = '/api'; // Proxied via Vite

export async function fetchDashboardMetrics() {
    const res = await fetch(`${BASE_URL}/dashboard/metrics`);
    if (!res.ok) throw new Error("Failed to fetch metrics");
    return res.json();
}

export async function fetchCases() {
    const res = await fetch(`${BASE_URL}/cases`);
    if (!res.ok) throw new Error("Failed to fetch cases");
    return res.json();
}

export async function fetchCaseDetail(caseId: string) {
    const res = await fetch(`${BASE_URL}/cases/${caseId}`);
    if (!res.ok) throw new Error("Failed to fetch case detail");
    return res.json();
}

/** Full 7-stage lifecycle snapshot (nested risk_assessment / diagnosis /
 *  ml_shadow_prediction / recommendation / policy_decision / execution_record /
 *  outcome / audit_history). */
export async function fetchCaseSnapshot(caseId: string) {
    const res = await fetch(`${BASE_URL}/system/cases/${caseId}`);
    if (!res.ok) throw new Error("Failed to fetch case snapshot");
    return res.json();
}

export async function fetchCaseAudit(caseId: string) {
    const res = await fetch(`${BASE_URL}/cases/${caseId}/audit`);
    if (!res.ok) throw new Error("Failed to fetch case audit");
    return res.json();
}

export async function advanceCase(caseId: string) {
    const res = await fetch(`${BASE_URL}/cases/${caseId}/advance`, {
        method: 'POST',
        headers: { 'X-API-Key': 'test-api-key' },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function submitHumanReview(caseId: string, decision: string, note: string) {
    // Note: Human review passes through backend policy/execution boundaries
    const res = await fetch(`${BASE_URL}/cases/${caseId}/human-review`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key'
        },
        body: JSON.stringify({ decision, note })
    });
    if (!res.ok) throw new Error("Failed to submit human review");
    return res.json();
}

// Dataset Lab APIs
export async function fetchDatasets() {
    const res = await fetch(`${BASE_URL}/datasets`);
    if (!res.ok) throw new Error("Failed to fetch datasets");
    return res.json();
}

export async function fetchDatasetDetail(datasetId: string) {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}`);
    if (!res.ok) throw new Error("Failed to fetch dataset detail");
    return res.json();
}

export async function syncDatasets() {
    const res = await fetch(`${BASE_URL}/datasets/sync`, { method: 'POST' });
    if (!res.ok) throw new Error("Failed to sync datasets");
    return res.json();
}

export async function analyzeDataset(datasetId: string) {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/analyze`, { method: 'POST' });
    if (!res.ok) throw new Error("Failed to analyze dataset");
    return res.json();
}

export async function uploadDataset(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/datasets/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Failed to upload dataset");
    }
    return res.json();
}
export const checkMlReadiness = async (datasetId: string) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/ml-readiness`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const startMlTraining = async (datasetId: string) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/train`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const fetchModels = async (datasetId: string) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/models`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};
export const confirmDatasetMapping = async (datasetId: string, mappings: any[]) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings })
    });
    if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Mapping failed");
    }
    return res.json();
};

export const fetchDatasetWorkflowStatus = async (datasetId: string) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/workflow-status`);
    if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Failed to fetch workflow status");
    }
    return res.json();
};

export const predictDataset = async (datasetId: string, features: any) => {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_features: features })
    });
    if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Prediction failed");
    }
    return res.json();
};

export async function fetchDatasetPreview(datasetId: string, limit: number = 25) {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/preview?limit=${limit}`);
    if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Failed to fetch dataset preview");
    }
    return res.json();
}

export async function generateCasesFromDataset(datasetId: string, maxCases: number = 25) {
    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/generate-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_cases: maxCases })
    });
    if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to generate cases");
    }
    return res.json();
}
