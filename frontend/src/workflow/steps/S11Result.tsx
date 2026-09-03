import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StepProps } from '../types';
import { useSnap } from './useSnap';
import { verifyCase } from '../../lib/api';
import { Spinner, ErrorNote, Note, KV, BigStat, Button, CountUp } from '../../ui';
import { money, moneyMaybe, ACTION, outcomeVerdict } from '../../lib/format';
import { useMotionPref } from '../../lib/motion';
import { markWorkflowDone } from '../../lib/progress';

export default function S11Result({ ctx, patch, setAction }: StepProps) {
    const nav = useNavigate();
    const [motion] = useMotionPref();
    const { snap, loading, err, refresh } = useSnap(ctx, patch);
    const [verifying, setVerifying] = useState(false);
    const tried = useRef(false);

    // reaching the Verified Result step completes the process — unlock the report
    useEffect(() => {
        setAction(null);
        markWorkflowDone();
    }, []);

    // if the action just ran but wasn't verified (escalated path), verify now
    useEffect(() => {
        if (!snap || tried.current) return;
        if (snap.execution_record?.status === 'COMPLETED_SIMULATED' && !snap.outcome) {
            tried.current = true;
            setVerifying(true);
            verifyCase(ctx.activeCaseId!, snap.execution_record.execution_id)
                .then(refresh)
                .catch(() => {})
                .finally(() => setVerifying(false));
        }
    }, [snap]);

    if (loading || !snap || verifying) {
        return err ? (
            <ErrorNote onRetry={refresh}>{err}</ErrorNote>
        ) : (
            <Spinner label={verifying ? 'Verifying the outcome…' : 'Loading result…'} />
        );
    }

    const o = snap.outcome;
    const ccy = snap.currency || 'INR';
    const top = snap.recommendation?.top_candidate;
    const v = outcomeVerdict(o?.status);

    return (
        <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">
                Recovery result
            </div>

            {o ? (
                <>
                    <div className="mt-3">
                        <BigStat label={snap.customer_id} value={v.label} tone={v.tone as any} />
                    </div>
                    <div className="mt-8 rounded-2xl border border-[--line] bg-[--panel] px-5 py-2">
                        <KV k="Original amount at risk" v={moneyMaybe(o.expected_amount, ccy)} />
                        <KV
                            k="Actual amount recovered"
                            v={
                                <span className="text-emerald-300 tabular">
                                    <CountUp
                                        motion={motion}
                                        to={Number(
                                            o.actual_amount_recovered?.amount ??
                                                o.actual_amount_recovered ??
                                                0,
                                        )}
                                        format={(n) => money(n, ccy)}
                                    />
                                </span>
                            }
                        />
                        <KV
                            k="Recovery action"
                            v={top ? ACTION[top.action_type] || top.action_type : '—'}
                        />
                        <KV k="Final status" v={v.label} />
                        <KV
                            k="Reconciliation"
                            v={
                                <span className="text-sm text-[--muted]">
                                    {o.reconciliation_status}
                                </span>
                            }
                        />
                    </div>
                    <div className="mt-8">
                        <Note>
                            Verified against the sandbox settlement source ({o.verification_source}
                            ). The outcome is checked independently — running an action does not by
                            itself mean money was recovered.
                        </Note>
                    </div>
                </>
            ) : (
                <>
                    <div className="mt-3">
                        <BigStat
                            label={snap.customer_id}
                            value="No recovery attempted"
                            tone="gray"
                        />
                    </div>
                    <div className="mt-6 rounded-2xl border border-[--line] bg-[--panel] px-5 py-4 text-sm text-[--muted]">
                        {snap.policy_decision?.reason ||
                            'The policy check did not approve an action, so nothing was executed or verified.'}
                    </div>
                </>
            )}

            <div className="mt-10 flex flex-wrap gap-3">
                <Button onClick={() => nav('/cases')}>
                    Review all {ctx.caseCount ?? ''} cases →
                </Button>
                <Button variant="ghost" onClick={() => nav('/insights')}>
                    Open the report
                </Button>
            </div>
        </div>
    );
}
