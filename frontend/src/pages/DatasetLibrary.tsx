import React, { useEffect, useState } from 'react';
import { fetchDatasets, syncDatasets, uploadDataset, analyzeDataset } from '../api/client';
import { Link } from 'react-router-dom';
import { 
    Database, 
    UploadCloud, 
    RefreshCw, 
    Search,
    FileSpreadsheet,
    Cpu,
    ArrowRight,
    CheckCircle,
    Layers
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { CardSkeleton } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/EmptyState';
import SectionCard from '../components/SectionCard';

export default function DatasetLibrary() {
    const [datasets, setDatasets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isDragOver, setIsDragOver] = useState(false);

    const loadDatasets = async () => {
        setLoading(true);
        setErrorMsg("");
        try {
            const data = await fetchDatasets();
            setDatasets(data.datasets || []);
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to load datasets");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDatasets();
    }, []);

    const handleSync = async () => {
        setLoading(true);
        try {
            await syncDatasets();
            await loadDatasets();
        } catch (e: any) {
            setErrorMsg(e.message || "Sync failed");
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setUploading(true);
        setErrorMsg("");
        try {
            const res = await uploadDataset(file);
            // Automatically analyze newly uploaded dataset
            if (res.dataset_id) {
                await analyzeDataset(res.dataset_id);
            }
            await loadDatasets();
        } catch (err: any) {
            setErrorMsg(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        const file = e.dataTransfer.files[0];
        setUploading(true);
        setErrorMsg("");
        try {
            const res = await uploadDataset(file);
            if (res.dataset_id) {
                await analyzeDataset(res.dataset_id);
            }
            await loadDatasets();
        } catch (err: any) {
            setErrorMsg(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const filteredDatasets = datasets.filter(d => 
        (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.dataset_id && d.dataset_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.filename && d.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const totalRows = datasets.reduce((sum, d) => sum + (d.row_count || 0), 0);
    const totalTrained = datasets.filter(d => d.status === 'TRAINED' || d.status === 'COMPLETED').length;

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header Telemetry Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 hover-card">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1 font-bold">Total Profiled Rows</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100 tabular-nums">
                        {totalRows.toLocaleString()}
                    </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 hover-card">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1 font-bold">Registered Datasets</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-blue-400 tabular-nums">
                        {datasets.length}
                    </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 hover-card">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1 font-bold">Trained Isolated Models</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                        {totalTrained}
                    </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 hover-card">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1 font-bold">Max Ingestion Limit</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-purple-400 tabular-nums">
                        500 MB
                    </span>
                </div>
            </div>

            {/* Upload */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all ${
                    isDragOver
                        ? 'border-blue-500 bg-blue-950/20'
                        : 'border-slate-800/90 bg-slate-900/40 hover:border-slate-700'
                }`}
            >
                <div className="p-3.5 rounded-2xl bg-blue-950/50 border border-blue-800/60 text-blue-400 mb-3">
                    <UploadCloud size={28} />
                </div>
                <h3 className="text-base font-bold text-slate-100">Upload a dataset</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Drop a CSV, Parquet or XLSX. Columns are profiled and mapped to canonical fields
                    (entity, amount, timestamp, outcome); post-outcome fields are flagged as leakage.
                </p>

                <div className="mt-4 flex items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all btn-press">
                        <span>{uploading ? "Uploading…" : "Browse files"}</span>
                        <input type="file" className="hidden" accept=".csv,.parquet,.xlsx"
                            onChange={handleFileUpload} disabled={uploading} />
                    </label>
                    <button
                        onClick={handleSync}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700/80 transition-all btn-press"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Sync local files
                    </button>
                </div>
            </div>

            {errorMsg && (
                <ErrorState 
                    title="Dataset Operation Error" 
                    message={errorMsg} 
                    onRetry={loadDatasets} 
                />
            )}

            {/* Inventory Search & Grid */}
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-slate-100">Dataset Inventory</h2>
                        <p className="text-xs text-slate-400">Select a dataset to configure semantic mapping, ML readiness, or train isolated models</p>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
                        <input 
                            type="text" 
                            placeholder="Filter datasets..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <CardSkeleton />
                        <CardSkeleton />
                        <CardSkeleton />
                    </div>
                ) : filteredDatasets.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredDatasets.map(ds => {
                            const sizeMb = ds.file_size_bytes ? (ds.file_size_bytes / (1024 * 1024)).toFixed(2) : "0.00";
                            const isReady = ds.training_suitability?.readiness_status?.includes("READY");

                            return (
                                <div 
                                    key={ds.dataset_id} 
                                    className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg shadow-black/25 flex flex-col justify-between hover-card backdrop-blur-sm group"
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60 uppercase">
                                                        {ds.file_type || 'CSV'}
                                                    </span>
                                                    <span className="text-xs font-mono font-semibold text-slate-400">
                                                        {ds.dataset_id}
                                                    </span>
                                                </div>
                                                <h3 className="text-sm font-bold text-slate-100 mt-1 truncate max-w-[220px]" title={ds.name || ds.filename}>
                                                    {ds.name || ds.filename}
                                                </h3>
                                            </div>
                                            <StatusBadge status={ds.status || 'PENDING'} variant="dataset" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs">
                                            <div>
                                                <span className="text-slate-500 block text-[10px] uppercase">Dimensions</span>
                                                <span className="font-bold text-slate-200 tabular-nums">
                                                    {ds.row_count?.toLocaleString() || 0} &times; {ds.column_count || 0}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block text-[10px] uppercase">File Size</span>
                                                <span className="font-semibold text-slate-300 tabular-nums">
                                                    {sizeMb} MB
                                                </span>
                                            </div>
                                        </div>

                                        {ds.training_suitability && (
                                            <div className="text-[11px] font-mono text-slate-400 space-y-1">
                                                <div className="flex justify-between">
                                                    <span>Target Problem:</span>
                                                    <span className="text-slate-200 font-semibold">{ds.training_suitability.prediction_problem || 'payment-failure'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>ML Suitability:</span>
                                                    <span className={isReady ? "text-emerald-400 font-semibold" : "text-amber-400"}>
                                                        {ds.training_suitability.readiness_status}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                                        <span className="text-[10px] font-mono text-slate-500">
                                            {ds.upload_timestamp ? new Date(ds.upload_timestamp).toLocaleDateString() : 'N/A'}
                                        </span>
                                        <Link 
                                            to={`/dataset/${ds.dataset_id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 group-hover:bg-blue-600 text-slate-200 group-hover:text-white border border-slate-700/80 transition-all text-xs font-semibold"
                                        >
                                            Inspect Lab <ArrowRight size={13} />
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState 
                        title="No Matching Datasets Found" 
                        message="No datasets matched your search criteria. Upload a new CSV/Parquet file or clear the search query."
                        actionLabel="Sync Local Files"
                        onAction={handleSync}
                    />
                )}
            </div>
        </div>
    );
}
