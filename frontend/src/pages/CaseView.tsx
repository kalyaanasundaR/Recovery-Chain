import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getCase, getCaseHistory, decideCase, executeCase, verifyCase } from '../lib/api';
import {
    money,
    moneyMaybe,
    pct,
    policyVerdict as safetyCheck,
    outcomeVerdict as outcome,
    riskWord,
    WHY_FAILED,
    ACTION,
    CATEGORY,
} from '../lib/format';
import { Card, Pill, Button, Spinner, ErrorNote } from '../ui';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
            <div className="text-sm font-medium text-slate-400">{label}</div>
            <div className="text-sm text-slate-200 sm:col-span-2">{children}</div>
        </div>
    );
}

export default function CaseView() {
    const { caseId = '' } = useParams();
    const [c, setC] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState('');
    const [working, setWorking] = useState('');

    const load = () => {
        setLoading(true);
        setErr('');
        Promise.all([getCase(caseId), getCaseHistory(caseId)])
            .then(([snap, h]) => {
                setC(snap);
                setHistory(h || snap.audit_history || []);
            })
            .catch((e) => setErr(e.message))
            .finally(() => setLoading(false));
    };
    useEffect(load, [caseId]);

    async function decide(decision: 'APPROVE' | 'REJECT') {
        setWorking(decision === 'APPROVE' ? 'Approving…' : 'Rejecting…');
        try {
            await decideCase(caseId, decision, note || '(no note)');
            if (decision === 'APPROVE') {
                const ex = await executeCase(caseId).catch(() => null);
                if (ex?.execution_id) await verifyCase(caseId, ex.execution_id).catch(() => null);
            }
            await load();
            setNote('');
        } catch (e: any) {
            setErr(e.message);
        }
        setWorking('');
    }

    if (loading) return <Spinner label="Loading case…" />;
    if (err || !c) return <ErrorNote onRetry={load}>{err || 'Not found'}</ErrorNote>;

    const s = safetyCheck(c.policy_decision?.status);
    const o = outcome(c.outcome?.status);
    const r = riskWord(c.risk_assessment?.risk_level);
    const rec = c.recommendation?.top_candidate;
    const needsOk = c.policy_decision?.status === 'ESCALATE';

    return (
        <div className="fade-in mx-auto max-w-3xl space-y-6">
            <Link
                to="/cases"
                className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
            >
                <ArrowLeft size={15} /> All cases
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-slate-100">{c.customer_id}</h1>
                <p className="mt-1 text-slate-400">
                    {CATEGORY[c.risk_category] || c.risk_category} · {money(c.amount_at_risk)} at
                    risk
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone={r.tone}>Risk: {r.label}</Pill>
                    <Pill tone={s.tone}>{s.label}</Pill>
                    {c.outcome && <Pill tone={o.tone}>{o.label}</Pill>}
                </div>
            </div>

            {needsOk && (
                <Card title="This one needs your OK" subtitle={s.note}>
                    <p className="text-sm text-slate-300">
                        Suggested action:{' '}
                        <b>{rec ? ACTION[rec.action_type] || rec.action_type : '—'}</b>. Reason it
                        was held: {c.policy_decision?.reason}
                    </p>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Add a note (optional)"
                        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                    <div className="mt-3 flex gap-3">
                        <Button onClick={() => decide('APPROVE')} disabled={!!working}>
                            {working || 'Approve & run'}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => decide('REJECT')}
                            disabled={!!working}
                        >
                            Reject
                        </Button>
                    </div>
                </Card>
            )}

            <Card title="What happened">
                <div className="divide-y divide-slate-800">
                    <Line label="What failed">
                        {CATEGORY[c.risk_category] || c.risk_category} of {money(c.amount_at_risk)}
                    </Line>
                    <Line label="Why it failed">
                        {c.diagnosis
                            ? WHY_FAILED[c.diagnosis.cause_category] || c.diagnosis.cause_category
                            : 'Not worked out yet'}
                    </Line>
                    <Line label="Chance of getting it back">
                        {c.ml_shadow_prediction ? (
                            <>
                                ~{pct(c.ml_shadow_prediction.recovery_probability)}{' '}
                                <span className="text-slate-500">
                                    (a helper estimate — a person always decides)
                                </span>
                            </>
                        ) : (
                            '—'
                        )}
                    </Line>
                    <Line label="Likely recovery amount">
                        {c.expected_recoverable_value ? money(c.expected_recoverable_value) : '—'}
                    </Line>
                    <Line label="What we’ll try">
                        {rec
                            ? ACTION[rec.action_type] || rec.action_type
                            : 'Nothing suitable found'}
                    </Line>
                    <Line label="Safety check">
                        <span className="font-medium">{s.label}.</span> {s.note}
                    </Line>
                    <Line label="Action taken">
                        {c.execution_record
                            ? `${c.execution_record.status === 'COMPLETED_SIMULATED' ? 'Done (simulated)' : c.execution_record.status}`
                            : 'Not yet'}
                    </Line>
                    <Line label="Result">
                        {c.outcome ? (
                            <>
                                {o.label} — {moneyMaybe(c.outcome.actual_amount_recovered)} of{' '}
                                {moneyMaybe(c.outcome.expected_amount)} recovered
                            </>
                        ) : (
                            'Not run yet'
                        )}
                    </Line>
                </div>
            </Card>

            <Card title="History">
                <ol className="space-y-2 text-sm">
                    {history.map((h, i) => (
                        <li key={i} className="flex justify-between gap-4 text-slate-400">
                            <span className="text-slate-300">
                                {h.evidence?.action || h.to_state}
                            </span>
                            <span className="tabular-nums text-slate-500">
                                {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ''}
                            </span>
                        </li>
                    ))}
                </ol>
            </Card>
        </div>
    );
}
