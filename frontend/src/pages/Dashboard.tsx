import React, { useEffect, useState } from 'react';
import { fetchDashboardMetrics, fetchCases } from '../api/client';
import { Link } from 'react-router-dom';
import { 
    AlertCircle, 
    Clock, 
    ShieldAlert, 
    CheckCircle, 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    Activity, 
    Database, 
    ArrowRight,
    Layers,
    Shield
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import SectionCard from '../components/SectionCard';
import StatusBadge from '../components/StatusBadge';
import { MetricSkeleton, TableRowSkeleton } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/EmptyState';
import SafetyBanner from '../components/SafetyBanner';

export default function Dashboard() {
    const [metrics, setMetrics] = useState<any>(null);
    const [cases, setCases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadData = () => {
        setLoading(true);
        setError('');
        Promise.all([fetchDashboardMetrics(), fetchCases()])
            .then(([m, c]) => {
                setMetrics(m);
                setCases(c || []);
            })
            .catch(e => setError(e.message || 'Failed to load telemetry'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <MetricSkeleton />
                    <MetricSkeleton />
                    <MetricSkeleton />
                    <MetricSkeleton />
                </div>
                <div className="p-6 rounded-xl border border-slate-800/80 bg-slate-900/40 overflow-hidden">
                    <table className="w-full">
                        <tbody className="divide-y divide-slate-800/60">
                            <TableRowSkeleton cols={5} />
                            <TableRowSkeleton cols={5} />
                            <TableRowSkeleton cols={5} />
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6 animate-fade-in">
                <ErrorState 
                    title="Telemetry Stream Disconnected" 
                    message={error} 
                    onRetry={loadData} 
                />
            </div>
        );
    }

    const recentCases = cases.slice(0, 8);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Safety Architecture Disclosure */}
            <SafetyBanner />

            {/* Primary Financial Exposure Section */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                        Primary Financial Telemetry
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                        Governed Exposure Metrics
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <MetricCard 
                        title="Total Revenue At Risk" 
                        value={`$${Number(metrics?.total_revenue_at_risk || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        subtitle="Identified exposure ledger"
                        icon={<DollarSign size={20} />}
                        color="text-rose-400"
                        bg="bg-gradient-to-b from-rose-950/20 to-slate-900/80 border-rose-900/30"
                        isFinancial
                        badge="EXPOSURE"
                    />

                    <MetricCard 
                        title="Recovery Opportunities" 
                        value={`$${Number(metrics?.recovery_opportunities || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        subtitle="Expected recovery potential"
                        icon={<TrendingUp size={20} />}
                        trend="+ERV Modeled"
                        trendPositive
                        color="text-blue-300"
                        bg="bg-gradient-to-b from-blue-950/20 to-slate-900/80 border-blue-900/30"
                        isFinancial
                        badge="EXPECTED"
                    />

                    <MetricCard 
                        title="Verified Recovery" 
                        value={`$${Number(metrics?.verified_recovery || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        subtitle="Audited ledger reconciliation"
                        icon={<CheckCircle size={20} />}
                        color="text-emerald-300"
                        bg="bg-gradient-to-b from-emerald-950/20 to-slate-900/80 border-emerald-900/30"
                        isFinancial
                        badge="RESOLVED"
                    />

                    <MetricCard 
                        title="Residual Recovery Gap" 
                        value={`$${Number(metrics?.recovery_gap || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        subtitle="Net unreconciled variance"
                        icon={<TrendingDown size={20} />}
                        color="text-amber-300"
                        bg="bg-gradient-to-b from-amber-950/20 to-slate-900/80 border-amber-900/30"
                        isFinancial
                        badge="GAP"
                    />
                </div>
            </div>

            {/* Operational Distribution Panel */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                        Operational Case Inventory
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                        Lifecycle State Counters
                    </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 flex items-center gap-3.5 hover-card">
                        <div className="p-2.5 rounded-lg bg-blue-950/50 text-blue-300 border border-blue-800/50">
                            <Activity size={18} />
                        </div>
                        <div>
                            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100 tabular-nums">
                                {metrics?.active_cases || 0}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                Active Ingestion Cases
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 flex items-center gap-3.5 hover-card">
                        <div className="p-2.5 rounded-lg bg-rose-950/50 text-rose-300 border border-rose-800/50">
                            <ShieldAlert size={18} />
                        </div>
                        <div>
                            <div className="text-xl sm:text-2xl font-bold font-mono text-rose-300 tabular-nums">
                                {metrics?.high_critical_cases || 0}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                High / Critical Risk
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 flex items-center gap-3.5 hover-card">
                        <div className="p-2.5 rounded-lg bg-amber-950/50 text-amber-300 border border-amber-800/50">
                            <AlertCircle size={18} />
                        </div>
                        <div>
                            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300 tabular-nums">
                                {metrics?.pending_human_review || 0}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                Escalated For Review
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 flex items-center gap-3.5 hover-card">
                        <div className="p-2.5 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/80">
                            <Clock size={18} />
                        </div>
                        <div>
                            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-300 tabular-nums">
                                {metrics?.waiting_cases || 0}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                In Cooldown / Waiting
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions & Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-950/60 text-blue-300 border border-blue-800/60">
                        <Shield size={18} />
                    </div>
                    <div>
                        <span className="text-sm font-bold text-slate-200 block">
                            Universal Bank Dataset Pipeline
                        </span>
                        <span className="text-xs text-slate-400">
                            Profile custom institutional datasets, map canonical fields, and train isolated shadow models.
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link 
                        to="/datasets" 
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all btn-press"
                    >
                        <Database size={15} /> Dataset Lab <ArrowRight size={14} />
                    </Link>
                    <Link 
                        to="/cases" 
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all btn-press"
                    >
                        <Layers size={15} /> All Cases
                    </Link>
                </div>
            </div>

            {/* Recent Cases Stream Table */}
            <SectionCard 
                title="Recent Recovery Cases Stream"
                subtitle="Live case states governed by the Deterministic Policy Engine"
                action={
                    <Link to="/cases" className="text-xs font-mono font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors">
                        View Complete Inventory <ArrowRight size={13} />
                    </Link>
                }
            >
                {recentCases.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800/80 font-mono text-slate-400 text-[11px] uppercase tracking-wider">
                                    <th className="py-3 px-3">Case ID</th>
                                    <th className="py-3 px-3">Customer Entity</th>
                                    <th className="py-3 px-3 text-right">Amount At Risk</th>
                                    <th className="py-3 px-3">Risk Tier</th>
                                    <th className="py-3 px-3 text-center">ML Shadow Prob</th>
                                    <th className="py-3 px-3 text-center">Policy Authority</th>
                                    <th className="py-3 px-3">Lifecycle State</th>
                                    <th className="py-3 px-3 text-right">Decision Record</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {recentCases.map(c => (
                                    <tr key={c.case_id} className="hover:bg-slate-800/40 transition-colors group">
                                        <td className="py-3.5 px-3 font-bold text-slate-100">
                                            <Link to={`/case/${c.case_id}`} className="hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                                                {c.case_id}
                                            </Link>
                                        </td>
                                        <td className="py-3.5 px-3 text-slate-300 font-medium">
                                            {c.customer_id}
                                        </td>
                                        <td className="py-3.5 px-3 text-right font-bold text-slate-100 tabular-nums">
                                            ${Number(c.amount_at_risk || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-3.5 px-3">
                                            <StatusBadge status={c.risk_level || 'UNKNOWN'} variant="risk" />
                                        </td>
                                        <td className="py-3.5 px-3 text-center tabular-nums">
                                            {c.recovery_probability !== undefined && c.recovery_probability !== null ? (
                                                <span className="text-purple-300 font-bold px-2 py-0.5 rounded bg-purple-950/50 border border-purple-800/50 text-[11px]">
                                                    {(c.recovery_probability * 100).toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 text-[11px]">&mdash;</span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-3 text-center">
                                            <StatusBadge status={c.policy_status || 'PENDING'} variant="policy" />
                                        </td>
                                        <td className="py-3.5 px-3 font-sans">
                                            <span className="text-emerald-400 font-semibold text-xs">
                                                {c.current_state}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-3 text-right">
                                            <Link 
                                                to={`/case/${c.case_id}`} 
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-700 transition-all font-sans text-xs font-semibold"
                                            >
                                                Inspect <ArrowRight size={12} />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState 
                        title="No Ingested Cases" 
                        message="Upload and profile a bank dataset in the Dataset Lab to generate deterministic recovery cases."
                        actionLabel="Go to Dataset Lab"
                        actionHref="/datasets"
                    />
                )}
            </SectionCard>
        </div>
    );
}
