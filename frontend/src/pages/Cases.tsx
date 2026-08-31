import React, { useEffect, useState } from 'react';
import { fetchCases } from '../api/client';
import { Link } from 'react-router-dom';
import { Search, Filter, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { TableRowSkeleton } from '../components/SkeletonLoader';
import { EmptyState, ErrorState } from '../components/EmptyState';
import SectionCard from '../components/SectionCard';

export default function Cases() {
    const [cases, setCases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [filterState, setFilterState] = useState('ALL');

    useEffect(() => {
        loadCases();
    }, []);

    const loadCases = () => {
        setLoading(true);
        setError('');
        fetchCases()
            .then(data => setCases(data || []))
            .catch(e => setError(e.message || 'Failed to fetch cases'))
            .finally(() => setLoading(false));
    };

    const filteredCases = cases.filter(c => {
        const matchesSearch = 
            (c.case_id || '').toLowerCase().includes(search.toLowerCase()) ||
            (c.customer_id || '').toLowerCase().includes(search.toLowerCase()) ||
            (c.reference_id || '').toLowerCase().includes(search.toLowerCase());
        const matchesCategory = filterCategory === 'ALL' || c.risk_category === filterCategory;
        const matchesState = filterState === 'ALL' || c.current_state === filterState;
        return matchesSearch && matchesCategory && matchesState;
    });

    return (
        <div className="space-y-8">
            {/* Header & Safety Notice */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl shadow-black/20 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Layers size={20} className="text-blue-400" />
                            <h2 className="text-lg font-bold text-slate-100 font-mono tracking-tight">Active Recovery Cases Inventory</h2>
                        </div>
                        <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                            Complete ledger of generated recovery cases governed by the Deterministic Policy Engine with shadow ML risk scores.
                        </p>
                    </div>


                </div>
            </div>

            {/* Controls Bar: Search & Filters */}
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center shadow-lg shadow-black/20">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
                    <input 
                        type="text" 
                        placeholder="Search Case ID, Customer, Reference..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-blue-500 font-mono placeholder-slate-500"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex flex-wrap gap-3 w-full md:w-auto items-center font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                        <Filter size={13} />
                        <select 
                            className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                        >
                            <option value="ALL">All Risk Categories</option>
                            <option value="FAILED_PAYMENT">Failed Payment</option>
                            <option value="CHECKOUT_ABANDONMENT">Checkout Abandonment</option>
                            <option value="FAILED_SUBSCRIPTION">Failed Subscription</option>
                            <option value="OVERDUE_INVOICE">Overdue Invoice</option>
                            <option value="BROKEN_PROMISE">Broken Promise</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400">
                        <select 
                            className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                            value={filterState}
                            onChange={e => setFilterState(e.target.value)}
                        >
                            <option value="ALL">All Lifecycle States</option>
                            <option value="OPEN">OPEN</option>
                            <option value="ASSESSED">ASSESSED</option>
                            <option value="DIAGNOSING">DIAGNOSING</option>
                            <option value="RECOMMENDING">RECOMMENDING</option>
                            <option value="POLICY_EVALUATED">POLICY_EVALUATED</option>
                            <option value="ESCALATED">ESCALATED</option>
                            <option value="WAITING">WAITING</option>
                            <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                            <option value="FULLY_RECOVERED">FULLY_RECOVERED</option>
                            <option value="PARTIALLY_RECOVERED">PARTIALLY_RECOVERED</option>
                            <option value="CLOSED_NOT_RECOVERED">CLOSED_NOT_RECOVERED</option>
                            <option value="STOPPED">STOPPED</option>
                        </select>
                    </div>

                    <button 
                        onClick={loadCases}
                        className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl border border-slate-700 transition-colors"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {/* Error States */}
            {error && (
                <ErrorState 
                    title="Case Retrieval Error" 
                    message={error} 
                    onRetry={loadCases} 
                />
            )}

            {/* Cases Table */}
            <SectionCard 
                title={`Registered Recovery Cases (${filteredCases.length})`}
                subtitle="Chronological audit records with deterministic risk evaluations and advisory ML probabilities"
            >
                <div className="overflow-x-auto -mx-6 -my-6">
                    <table className="min-w-full text-xs text-left">
                        <thead className="bg-slate-950/90 text-slate-400 uppercase font-mono font-semibold border-b border-slate-800">
                            <tr>
                                <th className="px-6 py-3.5">Case ID</th>
                                <th className="px-6 py-3.5">Customer / Entity</th>
                                <th className="px-6 py-3.5">Amount At Risk</th>
                                <th className="px-6 py-3.5">Category</th>
                                <th className="px-6 py-3.5">Risk Level</th>
                                <th className="px-6 py-3.5">ML Shadow Prob</th>
                                <th className="px-6 py-3.5">Policy Status</th>
                                <th className="px-6 py-3.5">State</th>
                                <th className="px-6 py-3.5 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRowSkeleton key={i} cols={9} />
                                ))
                            ) : filteredCases.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-sans">
                                        <EmptyState 
                                            title="No Matching Recovery Cases"
                                            description="No cases match the active filter criteria. Try clearing filters or generating cases from the Dataset Lab."
                                            action={
                                                <button 
                                                    onClick={() => { setSearch(''); setFilterCategory('ALL'); setFilterState('ALL'); }}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl border border-slate-700 transition-colors"
                                                >
                                                    Clear All Filters
                                                </button>
                                            }
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filteredCases.map(c => (
                                    <tr key={c.case_id} className="hover:bg-slate-800/40 transition-colors group">
                                        <td className="px-6 py-4 font-bold text-blue-400 whitespace-nowrap">
                                            <Link to={`/case/${c.case_id}`} className="hover:underline flex items-center gap-1.5">
                                                {c.case_id}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 text-slate-300 whitespace-nowrap font-medium">
                                            {c.customer_id}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-100 whitespace-nowrap">
                                            ${Number(c.amount_at_risk || 0).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-sans text-[11px]">
                                            <span className="bg-slate-800/90 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                                                {c.risk_category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusBadge status={c.risk_level || 'DETECTED'} variant="risk" />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {c.recovery_probability !== undefined && c.recovery_probability !== null ? (
                                                <span className="text-purple-300 font-bold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60 text-[11px]">
                                                    {(c.recovery_probability * 100).toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 font-mono text-[11px]">--</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusBadge status={c.policy_status || 'PENDING'} variant="policy" />
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 whitespace-nowrap text-[11px]">
                                            {c.current_state}
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <Link 
                                                to={`/case/${c.case_id}`}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 opacity-80 group-hover:opacity-100 transition-opacity font-sans"
                                            >
                                                Inspect <ArrowRight size={12} />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
}
