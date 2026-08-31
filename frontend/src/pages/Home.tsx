import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getOverview, listCases } from '../lib/api';
import { money, policyVerdict, outcomeVerdict, riskWord } from '../lib/format';
import { Card, Button, Spinner, ErrorNote, Pill, BigStat } from '../ui';

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

    if (loading) return <Spinner label="Loading…" />;
    if (err) return <ErrorNote onRetry={load}>{err}</ErrorNote>;

    const needYou = cases.filter(c => c.policy_status === 'ESCALATE');
    const recent = [...cases].slice(0, 8);

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Overview</h1>
                    <p className="mt-1 text-[--muted]">Everything that has been through a recovery run.</p>
                </div>
                <Link to="/"><Button>New recovery run <ArrowRight size={16} /></Button></Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <BigStat label="Money at risk" value={money(m.total_revenue_at_risk)} sub="across open cases" />
                <BigStat label="Likely to recover" value={money(m.recovery_opportunities)} tone="blue" sub="expected value" />
                <BigStat label="Recovered" value={money(m.verified_recovery)} tone="green" sub="verified" />
                <BigStat label="Still missing" value={money(m.recovery_gap)} tone="red" sub="at risk − recovered" />
            </div>

            {needYou.length > 0 && (
                <Card title={`${needYou.length} case${needYou.length > 1 ? 's' : ''} need approval`}
                    subtitle="Above the automated limit — a person must approve.">
                    <ul className="divide-y divide-[--line]">
                        {needYou.map(c => (
                            <li key={c.case_id} className="flex items-center justify-between py-3">
                                <span><b>{c.customer_id}</b><span className="ml-2 text-[--muted]">{money(c.amount_at_risk)}</span></span>
                                <Link to={`/cases/${c.case_id}`} className="text-sm font-medium text-sky-400 hover:underline">Review →</Link>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Card title="Recent cases" right={<Link to="/cases" className="text-sm text-sky-400 hover:underline">See all</Link>}>
                {recent.length === 0 ? (
                    <p className="text-sm text-[--muted]">No cases yet. Start a recovery run.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-[--faint]">
                                <tr><th className="pb-2 pr-4">Customer</th><th className="pb-2 pr-4">Amount</th><th className="pb-2 pr-4">Risk</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Result</th></tr>
                            </thead>
                            <tbody className="divide-y divide-[--line]">
                                {recent.map(c => {
                                    const s = policyVerdict(c.policy_status);
                                    const o = outcomeVerdict(c.outcome_status);
                                    const r = riskWord(c.risk_level);
                                    return (
                                        <tr key={c.case_id} className="hover:bg-white/[0.03]">
                                            <td className="py-3 pr-4"><Link to={`/cases/${c.case_id}`} className="font-medium hover:text-sky-400">{c.customer_id}</Link></td>
                                            <td className="py-3 pr-4 tabular text-[--muted]">{money(c.amount_at_risk)}</td>
                                            <td className="py-3 pr-4"><Pill tone={r.tone}>{r.label}</Pill></td>
                                            <td className="py-3 pr-4"><Pill tone={s.tone}>{s.label}</Pill></td>
                                            <td className="py-3">{c.outcome_status ? <Pill tone={o.tone}>{o.label}</Pill> : <span className="text-[--faint]">—</span>}</td>
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
