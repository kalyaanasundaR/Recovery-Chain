import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { useSnap } from './useSnap';
import { Spinner, ErrorNote, Note, BigStat } from '../../ui';
import { money, moneyMaybe, pct, WHY_FAILED, CATEGORY } from '../../lib/format';

export default function S07Analysis({ ctx, patch, next, setAction }: StepProps) {
    const { snap, loading, err, refresh } = useSnap(ctx, patch);
    useEffect(() => { setAction(snap ? { label: 'Proceed →', onClick: next } : null); }, [snap]);

    if (loading || !snap) return err ? <ErrorNote onRetry={refresh}>{err}</ErrorNote> : <Spinner label="Loading case…" />;

    const dx = snap.diagnosis;
    const pred = snap.ml_shadow_prediction;
    const ccy = snap.currency || 'INR';
    const others = (ctx.caseCount || 1) > 1;

    return (
        <div className="max-w-2xl">
            <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[--faint]">{snap.case_id}</span>
                {others && (
                    <span className="text-xs text-[--faint]">highest-value of {ctx.caseCount} cases</span>
                )}
            </div>

            <div className="mt-3">
                <BigStat label={`${snap.customer_id} · ${CATEGORY[snap.risk_category] || snap.risk_category}`}
                    value={`${money(snap.amount_at_risk, ccy)}`} tone="red" sub="at risk" />
            </div>

            <div className="mt-10 grid gap-8 sm:grid-cols-3">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">Why it’s at risk</div>
                    <div className="mt-2 text-lg font-medium">
                        {dx ? (WHY_FAILED[dx.cause_category] || dx.cause_category) : 'Not determined'}
                    </div>
                    {dx && <div className="mt-1 text-sm text-[--muted]">Confidence {pct(dx.confidence)}</div>}
                </div>
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">Recovery probability</div>
                    <div className="mt-2 text-lg font-medium text-sky-300">
                        {pred ? pct(pred.recovery_probability) : '—'}
                    </div>
                    <div className="mt-1 text-sm text-[--muted]">advisory estimate</div>
                </div>
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">Expected recovery</div>
                    <div className="mt-2 text-lg font-medium text-emerald-300">
                        {snap.expected_recoverable_value ? moneyMaybe(snap.expected_recoverable_value, ccy) : '—'}
                    </div>
                    <div className="mt-1 text-sm text-[--muted]">amount × probability</div>
                </div>
            </div>

            <div className="mt-10">
                <Note>
                    Risk level and cause come from RecoverChain’s <b>rule-based</b> engines (deterministic-v1.0).
                    The recovery probability is an <b>advisory model</b> ({pred?.model_version || 'baseline'},
                    running shadow-only) — it never decides an action; a person or the policy engine does.
                </Note>
            </div>
        </div>
    );
}
