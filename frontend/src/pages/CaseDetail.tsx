import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCaseSnapshot, fetchCaseAudit, submitHumanReview, advanceCase } from '../api/client';
import { 
    ArrowLeft, 
    UserCheck, 
    XCircle 
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import SectionCard from '../components/SectionCard';
import TimelineNode from '../components/TimelineNode';
import { TimelineSkeleton } from '../components/SkeletonLoader';
import { ErrorState } from '../components/EmptyState';
import SafetyBanner from '../components/SafetyBanner';

export default function CaseDetail() {
    const { caseId } = useParams();
    const [data, setData] = useState<any>(null);
    const [audit, setAudit] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reviewNote, setReviewNote] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    const loadCase = () => {
        if (!caseId) return;
        setLoading(true);
        setError('');
        Promise.all([fetchCaseSnapshot(caseId), fetchCaseAudit(caseId)])
            .then(([caseData, auditData]) => {
                setData(caseData);
                setAudit(auditData || caseData.audit_history || []);
            })
            .catch(e => setError(e.message || 'Failed to fetch case data'))
            .finally(() => setLoading(false));
    };

    const [advancing, setAdvancing] = useState(false);
    const handleAdvance = async () => {
        if (!caseId) return;
        setAdvancing(true);
        try { await advanceCase(caseId); await loadCase(); }
        catch (e: any) { alert(e.message || 'Failed to advance case'); }
        setAdvancing(false);
    };

    useEffect(() => {
        loadCase();
    }, [caseId]);

    const handleHumanReview = async (decision: string) => {
        if (!caseId) return;
        setSubmittingReview(true);
        try {
            await submitHumanReview(caseId, decision, reviewNote);
            await loadCase();
            setReviewNote('');
        } catch (e: any) {
            alert(e.message || "Failed to submit human review");
        }
        setSubmittingReview(false);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <TimelineSkeleton />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="space-y-6">
                <ErrorState 
                    title="Case Not Found" 
                    message={error || "The requested case could not be retrieved from the repository."} 
                    onRetry={loadCase}
                />
                <Link to="/cases" className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:underline">
                    <ArrowLeft size={14} /> Back to Recovery Cases
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Navigation & Header */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl shadow-black/20 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Link to="/cases" className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-xl font-bold font-mono text-slate-100">{data.case_id}</h2>
                                <StatusBadge status={data.risk_assessment?.risk_level || 'DETECTED'} variant="risk" size="md" />
                                <button onClick={handleAdvance} disabled={advancing}
                                    className="ml-2 text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">
                                    {advancing ? 'Advancing…' : 'Run pipeline'}
                                </button>
                            </div>
                            <p className="text-xs font-mono text-slate-400 mt-1">
                                Customer: <span className="text-slate-200">{data.customer_id}</span> &bull; 
                                Category: <span className="text-slate-300 font-sans">{data.risk_category}</span> &bull; 
                                State: <span className="text-emerald-400 font-bold">{data.current_state}</span>
                            </p>
                        </div>
                    </div>

                    <SafetyBanner compact />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Sequential Chronological Decision Timeline */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800 font-mono text-xs text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-slate-200">
                            Chronological Decision Chain (7 Stages)
                        </span>
                        <span>Deterministic Financial Governance</span>
                    </div>

                    {/* 1. REVENUE EVENT INGESTION */}
                    <TimelineNode 
                        step="1"
                        title="Revenue Event Ingestion"
                        status="COMPLETED"
                        source="Universal Dataset Pipeline / Ingestion Engine"
                        timestamp={data.created_at ? new Date(data.created_at).toLocaleTimeString() : undefined}
                    >
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                            <div>
                                <span className="text-slate-500 block text-[10px] uppercase">Amount At Risk</span>
                                <span className="font-bold text-slate-100">${Number(data.amount_at_risk || 0).toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block text-[10px] uppercase">Currency</span>
                                <span className="font-semibold text-slate-300">{data.currency || 'USD'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block text-[10px] uppercase">Reference ID</span>
                                <span className="font-medium text-slate-300 truncate block">{data.reference_id || 'N/A'}</span>
                            </div>
                        </div>
                    </TimelineNode>

                    {/* 2. DETERMINISTIC RISK ASSESSMENT */}
                    <TimelineNode 
                        step="2"
                        title="Deterministic Risk Assessment"
                        status="COMPLETED"
                        source="Recovery Chain Risk Scoring Engine"
                    >
                        <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Calculated Risk Score:</span>
                                <span className="font-bold text-rose-400">{data.risk_assessment ? Number(data.risk_assessment.score).toFixed(3) : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Severity Tier:</span>
                                <StatusBadge status={data.risk_assessment?.risk_level || 'UNKNOWN'} variant="risk" />
                            </div>
                            {data.risk_assessment?.primary_risk_signals && (
                                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                                    <span className="text-slate-500 block mb-1">Risk Signals:</span>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        {Object.entries(data.risk_assessment.primary_risk_signals).map(([k, v]) => (
                                            <li key={k}>{k}: {String(v)}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </TimelineNode>

                    {/* 3. DIAGNOSIS & CANDIDATE ACTION */}
                    <TimelineNode 
                        step="3"
                        title="Diagnosis & Candidate Action Recommendation"
                        status={data.diagnosis || data.recommendation ? "COMPLETED" : "PENDING"}
                        source="Case Engine Diagnostic & Action Selection"
                    >
                        {(data.diagnosis || data.recommendation) ? (
                            <div className="space-y-2.5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Root Cause:</span>
                                    <span className="font-bold text-slate-200">{data.diagnosis?.cause_category || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Recommended Action:</span>
                                    <span className="font-bold text-blue-400">{data.recommendation?.top_candidate?.action_type || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Expected Recoverable Value (ERV):</span>
                                    <span className="font-bold text-emerald-400">${Number(data.recommendation?.top_candidate?.expected_recoverable_value ?? data.expected_recoverable_value ?? 0).toFixed(2)}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 italic font-mono">No recommendation generated yet.</div>
                        )}
                    </TimelineNode>

                    {/* 4. ML SHADOW PREDICTION */}
                    <TimelineNode 
                        step="4"
                        title="ML Shadow Prediction"
                        status={data.ml_shadow_prediction?.prediction_status || 'PENDING'}
                        source="Isolated Shadow Model (Advisory Only)"
                        isML
                    >
                        <div className="space-y-2.5 bg-slate-950/60 p-3.5 rounded-xl border border-purple-900/40 font-mono text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Recovery Probability (shadow):</span>
                                <span className="font-extrabold text-purple-400 text-sm">
                                    {data.ml_shadow_prediction?.recovery_probability !== undefined && data.ml_shadow_prediction?.recovery_probability !== null
                                        ? `${(data.ml_shadow_prediction.recovery_probability * 100).toFixed(1)}%`
                                        : 'N/A'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500">Model Version:</span>
                                <span className="text-slate-300 truncate max-w-xs">{data.ml_shadow_prediction?.model_version || '—'}</span>
                            </div>
                            <div className="p-2 rounded bg-purple-950/40 border border-purple-900/60 text-[11px] text-purple-300">
                                <strong>Advisory Boundary:</strong> This prediction is shadow-only telemetry and does NOT authorize or trigger execution.
                            </div>
                        </div>
                    </TimelineNode>

                    {/* 5. DETERMINISTIC POLICY ENGINE AUTHORIZATION */}
                    <TimelineNode 
                        step="5"
                        title="Deterministic Policy Engine Authorization"
                        status={data.policy_decision?.status || 'PENDING'}
                        source="Policy Engine (Sole Authority)"
                        isPolicy
                    >
                        <div className="space-y-2.5 bg-slate-950/60 p-3.5 rounded-xl border border-indigo-900/40 font-mono text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Deterministic Authority Decision:</span>
                                <StatusBadge status={data.policy_decision?.status || 'PENDING'} variant="policy" size="md" />
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400">Rule Triggered:</span>
                                <span className="text-slate-200">{data.policy_decision?.failed_rules?.[0]?.rule_name || '—'}</span>
                            </div>
                            {data.policy_decision?.reason && (
                                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                                    <span>Reason: {data.policy_decision.reason}</span>
                                </div>
                            )}
                        </div>
                    </TimelineNode>

                    {/* 6. SIMULATED AGENT EXECUTION */}
                    <TimelineNode 
                        step="6"
                        title="Simulated Agent Execution"
                        status={data.execution_record?.status || 'PENDING'}
                        source="Mock Execution Sandbox Adapter"
                    >
                        <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Agent / Adapter:</span>
                                <span className="text-blue-400 font-semibold">{data.execution_record?.agent_type || '—'} / {data.execution_record?.adapter_used || 'MockExecutionAdapter'}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400">Adapter Result:</span>
                                <span className="text-emerald-400 font-semibold">{data.execution_record?.status || '—'}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
                                Simulated internal ledger execution &bull; No live external payment APIs or bank rails contacted.
                            </div>
                        </div>
                    </TimelineNode>

                    {/* 7. VERIFICATION & FINANCIAL OUTCOME */}
                    <TimelineNode 
                        step="7"
                        title="Verification & Financial Outcome"
                        status={data.outcome?.status || 'PENDING'}
                        source="Outcome Auditor & Verification Engine"
                    >
                        <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                            {(() => {
                                const recRaw = data.outcome?.actual_amount_recovered;
                                const rec = Number((recRaw && typeof recRaw === 'object') ? recRaw.amount : recRaw || 0);
                                const gap = Number(data.amount_at_risk || 0) - rec;
                                return (<>
                                    <div>
                                        <span className="text-slate-500 block text-[10px] uppercase">Verified Recovered</span>
                                        <span className="font-bold text-emerald-400">${rec.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-[10px] uppercase">Residual Recovery Gap</span>
                                        <span className="font-bold text-rose-400">${gap.toFixed(2)}</span>
                                    </div>
                                </>);
                            })()}
                        </div>
                    </TimelineNode>
                </div>

                {/* Right Column: Case Summary, Human Review Controller & Audit Log */}
                <div className="space-y-6">
                    {/* Financial Snapshot */}
                    <SectionCard 
                        title="Exposure Snapshot" 
                        subtitle="Governed exposure values"
                    >
                        <div className="space-y-3 font-mono text-xs">
                            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                <span className="text-slate-400">Total Exposure:</span>
                                <span className="font-bold text-slate-100">${Number(data.amount_at_risk || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                <span className="text-slate-400">Policy Authority:</span>
                                <StatusBadge status={data.policy_decision?.status || 'PENDING'} variant="policy" />
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                <span className="text-slate-400">ML Shadow Mode:</span>
                                <StatusBadge status="SHADOW_ONLY" variant="ml" />
                            </div>
                        </div>
                    </SectionCard>

                    {/* Human Review Controller (For ESCALATE or pending review) */}
                    {(data.policy_decision?.status === 'ESCALATE' || data.current_state === 'ESCALATED' || data.current_state === 'POLICY_REVIEW') && (
                        <SectionCard 
                            title="Human Review Controller" 
                            subtitle="Human-in-the-loop governance for escalated risk cases"
                            variant="highlight"
                        >
                            <div className="space-y-4 font-mono text-xs">
                                <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">Controller Notes</label>
                                    <textarea 
                                        rows={3}
                                        placeholder="Enter human controller authorization notes..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                                        value={reviewNote}
                                        onChange={e => setReviewNote(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleHumanReview('APPROVE')}
                                        disabled={submittingReview}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <UserCheck size={14} /> Approve Action
                                    </button>
                                    <button 
                                        onClick={() => handleHumanReview('REJECT')}
                                        disabled={submittingReview}
                                        className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <XCircle size={14} /> Reject Action
                                    </button>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {/* Immutable Audit Log */}
                    <SectionCard 
                        title="Immutable Audit Trail" 
                        subtitle="Cryptographically logged lifecycle state transitions"
                    >
                        {audit && audit.length > 0 ? (
                            <div className="space-y-3 font-mono text-xs max-h-96 overflow-y-auto pr-1">
                                {audit.map((entry, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-blue-400">{entry.evidence?.action || entry.to_state || 'TRANSITION'}</span>
                                            <span className="text-[10px] text-slate-500">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'N/A'}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            {entry.from_state ? `${entry.from_state} → ${entry.to_state}` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-slate-500 text-xs text-center py-6 font-mono">
                                No audit events logged yet.
                            </div>
                        )}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}
