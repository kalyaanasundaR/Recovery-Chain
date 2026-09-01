import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview, listCases, getSystemSummary, getSystemHealth, getModels } from '../lib/api';
import { computeInsights } from '../lib/insights';
import { money, pct, WHY_FAILED, ACTION, CATEGORY, riskWord } from '../lib/format';
import { Card, BigStat, Pill, Spinner, ErrorNote, Empty, Note } from '../ui';

function Bar({ label, value, max, right, tone = 'blue' }:
    { label: React.ReactNode; value: number; max: number; right?: React.ReactNode; tone?: string }) {
    const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    const color = tone === 'green' ? 'bg-emerald-500/60' : tone === 'red' ? 'bg-rose-500/60'
        : tone === 'amber' ? 'bg-amber-500/60' : 'bg-sky-500/60';
    return (
        <div className="py-2">
            <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-[--ink]">{label}</span>
                <span className="tabular text-[--muted]">{right}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/5">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
            </div>
        </div>
    );
}

export default function Insights() {
    const [d, setD] = useState<any>(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true); setErr('');
        Promise.all([getOverview(), listCases(), getSystemSummary(), getSystemHealth(), getModels()])
            .then(([metrics, cases, summary, health, models]) =>
                setD({ metrics, cases: cases || [], summary, health, models, ins: computeInsights(cases || []) }))
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    if (loading) return <Spinner label="Building the report…" />;
    if (err) return <ErrorNote onRetry={load}>{err}</ErrorNote>;

    const { metrics: m, ins, summary: s, health: h, models } = d;

    if (ins.total === 0) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold">Insights</h1>
                <Empty title="No recovery runs yet">
                    <Link to="/" className="font-medium text-sky-400 hover:underline">Start a run</Link> and the report fills in.
                </Empty>
            </div>
        );
    }

    const promoted = (models.items || []).filter((x: any) => x.status === 'SELECTED');
    const maxCauseRisk = Math.max(...ins.byCause.map((g: any) => g.atRisk), 1);
    const maxActionCount = Math.max(...ins.byAction.map((g: any) => g.count), 1);

    return (
        <div className="space-y-10">
            <div>
                <h1 className="text-2xl font-bold">Insights</h1>
                <p className="mt-1 text-[--muted]">
                    Everything {ins.total} recovery cases across {s.datasets_count} imported dataset
                    {s.datasets_count === 1 ? '' : 's'} have told us so far.
                </p>
            </div>

            {/* headline */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <BigStat label="Money at risk" value={money(ins.atRisk)} />
                <BigStat label="Recovered" value={money(ins.recovered)} tone="green" />
                <BigStat label="Still missing" value={money(ins.atRisk - ins.recovered)} tone="red" />
                <BigStat label="Recovery rate" value={pct(ins.recoveryRate)} tone="blue" sub="recovered ÷ at risk" />
            </div>

            {/* outcomes */}
            <Card title="Recovery outcomes" subtitle="Verified against the sandbox settlement source.">
                {[
                    ['Recovered in full', ins.outcomeCounts.FULLY_RECOVERED, 'green'],
                    ['Partially recovered', ins.outcomeCounts.PARTIALLY_RECOVERED, 'amber'],
                    ['Not recovered', ins.outcomeCounts.NOT_RECOVERED, 'red'],
                    ['Pending check', ins.outcomeCounts.PENDING_VERIFICATION, 'blue'],
                    ['Not run', ins.outcomeCounts.none, 'blue'],
                ].map(([label, n, tone]: any) => (
                    <Bar key={label} label={label} value={n} max={ins.total} tone={tone}
                        right={`${n} case${n === 1 ? '' : 's'}`} />
                ))}
            </Card>

            {/* by cause */}
            <Card title="Why revenue is failing" subtitle="Root cause is diagnosed by the rule-based engine.">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-[--faint]">
                            <tr><th className="pb-2 pr-4">Cause</th><th className="pb-2 pr-4">Cases</th><th className="pb-2 pr-4">At risk</th><th className="pb-2 pr-4">Recovered</th><th className="pb-2">Avg recovery odds</th></tr>
                        </thead>
                        <tbody className="divide-y divide-[--line]">
                            {ins.byCause.map((g: any) => (
                                <tr key={g.key}>
                                    <td className="py-2.5 pr-4">{WHY_FAILED[g.key] || g.key}</td>
                                    <td className="py-2.5 pr-4 tabular text-[--muted]">{g.count}</td>
                                    <td className="py-2.5 pr-4 tabular text-[--muted]">{money(g.atRisk)}</td>
                                    <td className="py-2.5 pr-4 tabular text-emerald-300">{money(g.recovered)}</td>
                                    <td className="py-2.5 tabular text-sky-300">{g.avgProb == null ? '—' : pct(g.avgProb)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* handling */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="How cases are handled" subtitle="The PolicyEngine is the sole authority.">
                    {[
                        ['Approved — acted automatically', ins.policyCounts.PERMITTED, 'green'],
                        ['Sent for human approval', ins.policyCounts.ESCALATE, 'amber'],
                        ['Waiting (cooling period)', ins.policyCounts.WAIT, 'amber'],
                        ['Blocked by a rule', ins.policyCounts.DENIED, 'red'],
                    ].map(([label, n, tone]: any) => (
                        <Bar key={label} label={label} value={n} max={ins.total} tone={tone}
                            right={`${n}`} />
                    ))}
                    <div className="mt-4 flex items-center gap-3">
                        <BigStat label="Automation rate" value={pct(ins.automationRate)} tone="blue" />
                        <p className="text-sm text-[--muted]">
                            of cases were safe to act on without a person.
                            {ins.escalatedCount > 0 && ` ${ins.escalatedCount} needed sign-off.`}
                        </p>
                    </div>
                </Card>

                <Card title="Actions the system chose">
                    {ins.byAction.map((g: any) => (
                        <Bar key={g.key} label={ACTION[g.key] || g.key} value={g.count} max={maxActionCount}
                            right={`${g.count}`} />
                    ))}
                </Card>
            </div>

            {/* risk + category */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Risk mix">
                    {ins.byRisk.map((g: any) => {
                        const r = riskWord(g.key);
                        return <Bar key={g.key} label={<Pill tone={r.tone}>{r.label}</Pill>} value={g.count}
                            max={ins.total} tone={r.tone} right={`${g.count} · ${money(g.atRisk)}`} />;
                    })}
                </Card>
                <Card title="Where the risk sits">
                    {ins.byCategory.map((g: any) => (
                        <Bar key={g.key} label={CATEGORY[g.key] || g.key} value={g.atRisk} max={maxCauseRisk}
                            right={money(g.atRisk)} />
                    ))}
                </Card>
            </div>

            {/* the system */}
            <Card title="How RecoverChain works" subtitle="Straight from the running system.">
                <div className="grid gap-6 sm:grid-cols-3">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-[--faint]">Machine learning</div>
                        <div className="mt-1 font-medium">{h.ml_subsystem?.mode}</div>
                        <div className="text-sm text-[--muted]">{h.ml_subsystem?.authority?.toLowerCase().replace(/_/g, ' ')}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-[--faint]">Decision authority</div>
                        <div className="mt-1 font-medium">Policy engine</div>
                        <div className="text-sm text-[--muted]">{h.policy_engine?.authority?.toLowerCase().replace(/_/g, ' ')}, gate {h.policy_engine?.execution_gate?.toLowerCase()}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-[--faint]">Execution</div>
                        <div className="mt-1 font-medium">{h.execution_engine?.mode?.toLowerCase().replace(/_/g, ' ')}</div>
                        <div className="text-sm text-[--muted]">{h.execution_engine?.adapter} · live gateways: {String(h.execution_engine?.live_gateways_connected)}</div>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
                    {[
                        ['Datasets imported', s.datasets_count],
                        ['Recovery cases', s.cases_count],
                        ['Actions executed', s.executions_count],
                        ['Audit records', s.audit_records_count],
                    ].map(([k, v]: any) => (
                        <div key={k} className="rounded-xl border border-[--line] bg-[--panel] p-3">
                            <div className="text-xs text-[--faint]">{k}</div>
                            <div className="mt-0.5 text-lg font-bold tabular">{Number(v).toLocaleString()}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-6">
                    <Note>
                        {promoted.length} model run{promoted.length === 1 ? '' : 's'} recorded in the registry
                        ({models.total_count} total). No model is promoted to live scoring — recovery
                        probability is produced by the deterministic baseline and shown as advisory only.
                        Execution and settlement are simulated in a sandbox; no live payment gateway is connected.
                    </Note>
                </div>
            </Card>

            <div>
                <Link to="/cases" className="text-sm font-medium text-sky-400 hover:underline">See every case →</Link>
                <a href="/api/system/cases.csv" download
                    className="ml-5 text-sm font-medium text-sky-400 hover:underline">Download CSV</a>
            </div>
        </div>
    );
}
