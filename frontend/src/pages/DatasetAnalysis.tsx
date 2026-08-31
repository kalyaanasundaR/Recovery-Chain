import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
    fetchDatasetDetail, 
    checkMlReadiness, 
    startMlTraining, 
    fetchModels, 
    confirmDatasetMapping, 
    predictDataset, 
    fetchDatasetPreview, 
    generateCasesFromDataset 
} from '../api/client';
import { 
    ArrowLeft, 
    CheckCircle, 
    Layers, 
    Zap, 
    Activity,
    RefreshCw
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import SectionCard from '../components/SectionCard';
import { ErrorState } from '../components/EmptyState';

export default function DatasetAnalysis() {
    const { datasetId } = useParams();
    const [dataset, setDataset] = useState<any>(null);
    const [models, setModels] = useState<any[]>([]);
    const [mappings, setMappings] = useState<any[]>([]);
    const [previewData, setPreviewData] = useState<any>(null);
    
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [trainingState, setTrainingState] = useState("");
    
    const [shadowInput, setShadowInput] = useState<any>({});
    const [predictionResult, setPredictionResult] = useState<any>(null);
    const [predicting, setPredicting] = useState(false);
    const [caseGenResult, setCaseGenResult] = useState<any>(null);
    const [generatingCases, setGeneratingCases] = useState(false);
    
    const pollingInterval = useRef<any>(null);

    const loadData = async () => {
        if (!datasetId) return;
        try {
            const ds = await fetchDatasetDetail(datasetId);
            setDataset(ds);
            
            // Only initialize mapping state if we are in MAPPING_REVIEW and mappings are empty
            if (ds.status === 'MAPPING_REVIEW' && mappings.length === 0 && ds.recoverchain_signals) {
                setMappings(ds.recoverchain_signals.map((m: any) => ({
                    original_column: m.original_column,
                    canonical_field: m.canonical_field,
                    action: m.canonical_field === "UNKNOWN" ? "unused" : "confirm",
                    confidence: m.confidence,
                    reason: m.reason
                })));
            }

            const ms = await fetchModels(datasetId);
            setModels(ms || []);
            const prev = await fetchDatasetPreview(datasetId, 10).catch(() => null);
            if (prev) setPreviewData(prev);
            
            if (ds.status === 'TRAINING') {
                if (!pollingInterval.current) {
                    pollingInterval.current = setInterval(loadData, 3000);
                }
            } else {
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                    pollingInterval.current = null;
                }
            }
        } catch (e: any) {
            console.error(e);
            setErrorMsg(`Unable to load dataset. ${e.message}`);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, [datasetId]);

    const handleConfirmMapping = async () => {
        if (!datasetId) return;
        setErrorMsg("");
        try {
            await confirmDatasetMapping(datasetId, mappings);
            await checkMlReadiness(datasetId).catch(console.warn);
            await loadData();
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to confirm mappings.");
        }
    };

    const handleReadiness = async () => {
        if (!datasetId) return;
        setErrorMsg("");
        try {
            await checkMlReadiness(datasetId);
            await loadData();
        } catch (e: any) {
            setErrorMsg(e.message || "ML Readiness check failed.");
        }
    };

    const handleTrain = async () => {
        if (!datasetId) return;
        setErrorMsg("");
        try {
            await startMlTraining(datasetId);
            await loadData();
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to start training.");
        }
    };
    
    const handlePredict = async () => {
        if (!datasetId) return;
        setPredicting(true);
        setErrorMsg("");
        setPredictionResult(null);
        try {
            const res = await predictDataset(datasetId, shadowInput);
            setPredictionResult(res);
        } catch(e: any) {
            setErrorMsg("Prediction failed: " + (e.message || "Unknown error"));
        }
        setPredicting(false);
    };

    if (loading) return (
        <div className="p-12 text-center text-slate-400 font-mono">
            Loading dataset intelligence & ML studio state...
        </div>
    );

    if (!dataset) return (
        <div className="space-y-6">
            <ErrorState 
                title="Dataset Not Found" 
                message="The requested dataset could not be located in the repository." 
            />
            <Link to="/datasets" className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:underline">
                <ArrowLeft size={14} /> Back to Dataset Lab
            </Link>
        </div>
    );

    const suit = dataset.training_suitability || null;
    const status = dataset.status || "UNKNOWN";
    const isTraining = status === 'TRAINING';
    
    const activeModel = models.length > 0 ? models[0] : null;
    const requiredCanonicalFields = activeModel ? Object.values(activeModel.canonical_feature_mapping || {}) : [];
    const uniqueInferenceFields = Array.from(new Set(requiredCanonicalFields)).filter((f: any) => f !== 'OUTCOME' && f !== 'TARGET' && f !== 'UNKNOWN');

    return (
        <div className="space-y-8">
            {/* Header Card */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl shadow-black/20 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Link to="/datasets" className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
                                <ArrowLeft size={16} />
                            </Link>
                            <h2 className="text-xl font-bold text-slate-100 font-mono tracking-tight truncate">
                                {dataset.name || dataset.filename}
                            </h2>
                            <StatusBadge status={status} variant="dataset" />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pl-9">
                            <span>ID: {dataset.dataset_id}</span>
                            <span>&bull;</span>
                            <span>Rows: <strong className="text-slate-200">{dataset.row_count ? dataset.row_count.toLocaleString() : 'N/A'}</strong></span>
                            <span>&bull;</span>
                            <span>Cols: <strong className="text-slate-200">{dataset.column_count ?? 'N/A'}</strong></span>
                            <span>&bull;</span>
                            <span>Format: <strong className="text-blue-400 uppercase">{dataset.file_type || 'CSV'}</strong></span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isTraining && (
                            <span className="inline-flex items-center gap-2 bg-blue-950 text-blue-300 text-xs font-mono px-3 py-1.5 rounded-xl border border-blue-800 animate-pulse">
                                <RefreshCw size={13} className="animate-spin" /> Training Model in Background...
                            </span>
                        )}

                    </div>
                </div>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
                <ErrorState 
                    title="Workflow Error" 
                    message={errorMsg} 
                />
            )}

            {/* DATA QUALITY PROFILE */}
            {dataset.data_quality_report && (
                <SectionCard 
                    title="Data Quality & Anomaly Profile" 
                    subtitle="Automated statistical assessment of null rates, duplicates, and column completeness"
                    badge={
                        <span className="text-xs font-mono font-bold bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                            Score: {dataset.data_quality_report.score ?? 'N/A'}/100
                        </span>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="flex flex-col items-center justify-center p-6 bg-slate-950/60 rounded-2xl border border-slate-800">
                            <span className="text-4xl font-extrabold font-mono text-blue-400">
                                {dataset.data_quality_report.score ?? 'N/A'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 uppercase mt-1">Quality Index</span>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                                Profile Assessment Findings
                            </h4>
                            {dataset.data_quality_report.breakdown && (
                                <ul className="space-y-1.5">
                                    {dataset.data_quality_report.breakdown.map((b: string, i: number) => {
                                        const isIssue = b.startsWith('-');
                                        return (
                                            <li key={i} className={`text-xs font-mono flex items-center gap-2 p-2 rounded-lg ${isIssue ? 'bg-rose-950/30 text-rose-300 border border-rose-900/40' : 'bg-slate-950/40 text-slate-300 border border-slate-800/60'}`}>
                                                <span className="font-bold">{b.split(':')[0]}</span>:
                                                <span className="text-slate-400">{b.split(':').slice(1).join(':')}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </SectionCard>
            )}

            {/* BOUNDED DATASET PREVIEW */}
            {previewData && previewData.rows && previewData.rows.length > 0 && (
                <SectionCard 
                    title="Bounded Dataset Sample Preview" 
                    subtitle="Sample rows mapped to inferred canonical concepts (bounded preview, full file preserved on disk)"
                >
                    <div className="overflow-x-auto -mx-6 -my-6">
                        <table className="min-w-full text-xs text-left">
                            <thead className="bg-slate-950 text-slate-300 uppercase font-mono font-semibold border-b border-slate-800">
                                <tr>
                                    {previewData.columns?.map((c: any, i: number) => (
                                        <th key={i} className="px-4 py-3 border-r border-slate-800/80 last:border-r-0 whitespace-nowrap">
                                            <div className="text-slate-200">{c.original_name}</div>
                                            <div className="text-[10px] text-blue-400 font-mono lowercase tracking-normal">[{c.canonical_concept}]</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                                {previewData.rows.slice(0, 10).map((r: any, ri: number) => (
                                    <tr key={ri} className="hover:bg-slate-800/40 transition-colors">
                                        {previewData.columns?.map((c: any, ci: number) => (
                                            <td key={ci} className="px-4 py-2.5 text-slate-300 border-r border-slate-800/40 last:border-r-0 truncate max-w-xs">
                                                {r[c.original_name] !== null && r[c.original_name] !== undefined ? String(r[c.original_name]) : <span className="text-slate-600">null</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            )}

            {/* MAPPING REVIEW (When in MAPPING_REVIEW) */}
            {status === 'MAPPING_REVIEW' && (
                <SectionCard 
                    title="Semantic Mapping Review" 
                    subtitle="Automatic progression halted due to ambiguous column names or low-confidence inference. Confirm column meanings to proceed."
                    variant="highlight"
                    badge={
                        <span className="text-xs font-mono font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                            ACTION REQUIRED
                        </span>
                    }
                >
                    <div className="space-y-4">
                        {mappings.map((m, idx) => (
                            <div key={idx} className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="w-full sm:w-1/4 font-bold text-slate-200 text-sm">{m.original_column}</div>
                                    <select 
                                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 flex-1 text-slate-200 focus:outline-none focus:border-blue-500"
                                        value={m.canonical_field}
                                        onChange={(e) => {
                                            const newM = [...mappings];
                                            newM[idx].canonical_field = e.target.value;
                                            setMappings(newM);
                                        }}
                                    >
                                        <option value="UNKNOWN">UNKNOWN / UNUSED</option>
                                        <option value="TARGET">TARGET / OUTCOME</option>
                                        <option value="AMOUNT">AMOUNT / BALANCE</option>
                                        <option value="CUSTOMER_ID">CUSTOMER_ID / ENTITY_ID</option>
                                        <option value="TIMESTAMP">TIMESTAMP / SETTLEMENT_DATE</option>
                                        <option value="STATUS">STATUS</option>
                                    </select>
                                    <select 
                                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 w-32 text-slate-200 focus:outline-none focus:border-blue-500"
                                        value={m.action}
                                        onChange={(e) => {
                                            const newM = [...mappings];
                                            newM[idx].action = e.target.value;
                                            setMappings(newM);
                                        }}
                                    >
                                        <option value="confirm">Confirm</option>
                                        <option value="unused">Ignore</option>
                                    </select>
                                </div>
                                {(m as any).reason && (
                                    <div className="flex items-center gap-2 text-slate-400 text-[11px] pt-1">
                                        <StatusBadge status={(m as any).confidence} variant="confidence" />
                                        <span>{(m as any).reason}</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        <button 
                            onClick={handleConfirmMapping} 
                            className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-600/30 transition-all font-mono text-xs"
                        >
                            Confirm Mapping & Proceed &rarr;
                        </button>
                    </div>
                </SectionCard>
            )}

            {/* ML READINESS CONTRACT & TRAINING */}
            {status !== 'MAPPING_REVIEW' && status !== 'PENDING' && status !== 'UPLOADED' && status !== 'PROFILING' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ML Readiness Card */}
                    <SectionCard 
                        title="ML Readiness Contract" 
                        subtitle="Strict validation schema determining if dataset can train isolated shadow models"
                        action={
                            <button 
                                onClick={handleReadiness} 
                                className="text-xs font-mono text-blue-400 hover:text-blue-300 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                            >
                                Re-assess Contract
                            </button>
                        }
                    >
                        {suit ? (
                            <div className="space-y-4 font-mono text-xs">
                                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                    <span className="text-slate-400">Classification:</span>
                                    <StatusBadge status={suit.overall_classification || suit.readiness_status} variant="ml" size="md" />
                                </div>

                                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-[11px]">
                                    <div>
                                        <span className="text-slate-500 block uppercase">Target Field</span>
                                        <span className="font-bold text-slate-200">{suit.target_column || 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block uppercase">Problem Task</span>
                                        <span className="font-bold text-purple-400">{suit.prediction_problem || 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block uppercase">Entity Field</span>
                                        <span className="font-bold text-slate-200">{suit.entity_column || 'None'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block uppercase">Temporal Split</span>
                                        <span className="font-bold text-slate-200">{suit.temporal_split?.strategy || 'Random Split'}</span>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-slate-400 block mb-2 font-semibold">Approved Features:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {suit.feature_columns?.map((f: string, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 text-[11px] rounded border border-emerald-800">
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {suit.excluded_columns?.length > 0 && (
                                    <div>
                                        <span className="text-slate-400 block mb-2 font-semibold">Excluded Features (Leakage / Identifiers):</span>
                                        <ul className="space-y-1">
                                            {suit.excluded_columns.map((f: string, i: number) => (
                                                <li key={i} className="text-[11px] flex justify-between bg-rose-950/30 text-rose-300 p-1.5 rounded border border-rose-900/40">
                                                    <span className="font-bold">{f}</span>
                                                    <span className="opacity-80">{suit.exclusion_reasons?.[f] || 'Leakage/Identifier'}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-slate-500 text-center py-8 font-mono text-xs">
                                ML Readiness has not been assessed.
                            </div>
                        )}
                    </SectionCard>

                    {/* Model Training & Registry Card */}
                    <SectionCard 
                        title="Model Training Engine" 
                        subtitle="Train isolated shadow ML models bounded strictly to this dataset's feature schema"
                    >
                        <div className="space-y-4">
                            <button 
                                onClick={handleTrain} 
                                disabled={isTraining || !suit || (!suit.readiness_status?.includes('READY') && !suit.overall_classification?.includes('READY'))} 
                                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-mono font-bold text-xs py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Zap size={15} />
                                {isTraining ? "Training in progress..." : "Start Isolated ML Training"}
                            </button>

                            {models.length > 0 ? (
                                <div className="space-y-3 pt-2">
                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block">
                                        Persisted Model Registry Artifacts
                                    </span>
                                    {models.map((mod, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-slate-200 truncate">{mod.model_id}</span>
                                                <StatusBadge status={mod.task} variant="ml" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                                                <div>Created: <span className="text-slate-200">{new Date(mod.created_at).toLocaleDateString()}</span></div>
                                                <div>Algorithm: <span className="text-purple-300 font-semibold">{mod.model_version || 'XGBoost'}</span></div>
                                                {mod.final_test_metrics?.roc_auc && <div>ROC-AUC: <span className="text-emerald-400 font-bold">{mod.final_test_metrics.roc_auc.toFixed(3)}</span></div>}
                                                {mod.final_test_metrics?.pr_auc && <div>PR-AUC: <span className="text-emerald-400 font-bold">{mod.final_test_metrics.pr_auc.toFixed(3)}</span></div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-center py-6 font-mono text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                                    No trained artifacts for this dataset yet.
                                </div>
                            )}
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* SHADOW PREDICTION & CASE GENERATION CONSOLE */}
            {activeModel && (
                <SectionCard 
                    title="Shadow Prediction & Case Generation Console" 
                    subtitle="Test model inference on canonical feature inputs or batch-generate recovery cases into the Case Engine"
                    variant="purple"
                    badge={
                        <span className="text-xs font-mono font-bold bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800">
                            SHADOW ONLY
                        </span>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4 bg-slate-950/60 p-5 rounded-xl border border-slate-800 font-mono text-xs">
                            <span className="text-slate-400 font-bold uppercase tracking-wider block">
                                Input Canonical Features
                            </span>
                            {uniqueInferenceFields.length === 0 && <p className="text-slate-500">No canonical features required.</p>}
                            {uniqueInferenceFields.map((field: any) => (
                                <div key={field}>
                                    <label className="block text-[11px] text-slate-400 mb-1">{field}</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                                        placeholder={`Enter ${field}`}
                                        value={shadowInput[field] || ''}
                                        onChange={(e) => setShadowInput({...shadowInput, [field]: e.target.value})}
                                    />
                                </div>
                            ))}

                            <div className="pt-2 space-y-2">
                                <button 
                                    onClick={() => handlePredict()}
                                    disabled={predicting}
                                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
                                >
                                    <Activity size={14} />
                                    {predicting ? "Running Shadow Inference..." : "Run Shadow Prediction"}
                                </button>

                                <button 
                                    onClick={async () => {
                                        if (!datasetId) return;
                                        setGeneratingCases(true);
                                        setErrorMsg("");
                                        setCaseGenResult(null);
                                        try {
                                            const data = await generateCasesFromDataset(datasetId, 25);
                                            setCaseGenResult(data);
                                        } catch(e: any) {
                                            setErrorMsg("Failed to generate cases: " + (e.message || "Unknown error"));
                                        }
                                        setGeneratingCases(false);
                                    }}
                                    disabled={generatingCases}
                                    className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold py-2.5 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <Layers size={14} />
                                    {generatingCases ? "Generating Cases..." : "Generate Cases from Dataset"}
                                </button>

                                {caseGenResult && (
                                    <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-emerald-300 text-xs space-y-1">
                                        <div className="font-bold flex items-center gap-1.5">
                                            <CheckCircle size={14} /> Generated {caseGenResult.cases_generated} Recovery Cases
                                        </div>
                                        <div className="text-[11px] text-emerald-400">
                                            Seen: {caseGenResult.counters?.rows_seen || 0} &bull; Accepted: {caseGenResult.counters?.rows_accepted || 0} &bull; Skipped: {caseGenResult.counters?.rows_skipped || 0}
                                        </div>
                                        <Link to="/cases" className="inline-block pt-1 font-bold text-blue-400 hover:underline">
                                            View Recovery Cases &rarr;
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-center">
                            {predictionResult ? (
                                <div className="w-full text-center p-8 bg-slate-950/80 border border-purple-800/80 shadow-2xl rounded-2xl space-y-3 font-mono">
                                    <StatusBadge status={predictionResult.status} variant="policy" />
                                    <div className="text-6xl font-extrabold text-purple-400">
                                        {(predictionResult.probability * 100).toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                                        Predicted Failure Risk Probability
                                    </div>
                                    <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                                        Advisory shadow score only &bull; Sole authority rests with Deterministic Policy Engine.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-slate-500 text-xs text-center italic p-12 border-2 border-dashed border-slate-800 rounded-2xl w-full font-mono">
                                    Provide canonical inputs to execute shadow risk prediction.
                                </div>
                            )}
                        </div>
                    </div>
                </SectionCard>
            )}
        </div>
    );
}

