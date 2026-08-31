import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getOverview, listCases } from '../lib/api';
import { money, safetyCheck, outcome, riskWord } from '../lib/format';
import { Stat, Card, Button, Spinner, ErrorNote, Pill } from '../ui';

export default function Home() {
    const [m, setM] = useState<any>(null);
    const [cases, setCases] = useState<any[]>([]);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true); setErr('');
        Promise.all([getOverview(), listCases()])
            .then(([o, c]) => { setM(o); setCases(c || []); })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    if (loading) return <Spinner label="Loading your numbers…" />;
    if (err) return <ErrorNote onRetry={load}>Couldn’t load: {err}</ErrorNote>;

    const needYou = cases.filter(c => c.policy_status === 'ESCALATE');
    const recent = [...cases].slice(0, 6);

    return (
        <div className="fade-in space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Home</h1>
                    <p className="mt-1 text-slate-400">Where your revenue recovery stands right now.</p>
                </div>
                <Link to="/run"><Button>Start a recovery run <ArrowRight size={16} /></Button></Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Money at risk" value={money(m.total_revenue_at_risk)} hint="across all open cases" />
                <Stat label="Likely to recover" value={money(m.recovery_opportunities)} hint="our best estimate" />
                <Stat label="Recovered so far" value={money(m.verified_recovery)} tone="green" hint="confirmed back in the account" />
                <Stat label="Still missing" value={money(m.recovery_gap)} tone="red" hint="at risk minus recovered" />
            </div>

            {needYou.length > 0 && (
                <Card title={`${needYou.length} case${needYou.length > 1 ? 's' : ''} need your approval`}
                    subtitle="These are too big or too sensitive to act on automatically.">
                    <ul className="divide-y divide-slate-800">
                        {needYou.map(c => (
                            <li key={c.case_id} className="flex items-center justify-between py-3">
                                <div>
                                    <span className="font-medium text-slate-100">{c.customer_id}</span>
                                    <span className="ml-2 text-slate-400">{money(c.amount_at_risk)}</span>
                                </div>
                                <Link to={`/cases/${c.case_id}`} className="text-sm font-medium text-blue-400 hover:underline">
                                    Review →
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Card title="Recent cases" right={<Link to="/cases" className="text-sm text-blue-400 hover:underline">See all</Link>}>
                {recent.length === 0 ? (
                    <p className="text-sm text-slate-500">No cases yet. Start a recovery run to create some.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="pb-2 pr-4">Customer</th>
                                    <th className="pb-2 pr-4">Amount</th>
                                    <th className="pb-2 pr-4">Risk</th>
                                    <th className="pb-2 pr-4">Status</th>
                                    <th className="pb-2">Result</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {recent.map(c => {
                                    const s = safetyCheck(c.policy_status);
                                    const o = outcome(c.outcome_status);
                                    const r = riskWord(c.risk_level);
                                    return (
                                        <tr key={c.case_id} className="hover:bg-slate-800/40">
                                            <td className="py-3 pr-4">
                                                <Link to={`/cases/${c.case_id}`} className="font-medium text-slate-100 hover:text-blue-400">
                                                    {c.customer_id}
                                                </Link>
                                            </td>
                                            <td className="py-3 pr-4 tabular-nums text-slate-300">{money(c.amount_at_risk)}</td>
                                            <td className="py-3 pr-4"><Pill tone={r.tone}>{r.label}</Pill></td>
                                            <td className="py-3 pr-4"><Pill tone={s.tone}>{s.label}</Pill></td>
                                            <td className="py-3">
                                                {c.outcome_status ? <Pill tone={o.tone}>{o.label}</Pill> : <span className="text-slate-600">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
