import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { useSnap } from './useSnap';
import { Spinner, ErrorNote, Note, Row } from '../../ui';
import { money, moneyMaybe, pct, ACTION, WHY_FAILED } from '../../lib/format';

export default function S08Decision({ ctx, patch, next, setAction }: StepProps) {
    const { snap, loading, err, refresh } = useSnap(ctx, patch);
    useEffect(() => { setAction(snap ? { label: 'Proceed →', onClick: next } : null); }, [snap]);

    if (loading || !snap) return err ? <ErrorNote onRetry={refresh}>{err}</ErrorNote> : <Spinner label="Loading recommendation…" />;

    const rec = snap.recommendation;
    const top = rec?.top_candidate;
    const dx = snap.diagnosis;
    const ccy = snap.currency || 'USD';

    if (!top) {
        return (
            <div className="max-w-2xl">
                <h1 className="text-3xl font-bold tracking-tight">No action recommended</h1>
                <p className="mt-3 text-[--muted]">{rec?.rationale || 'The evaluator found no viable action for this case.'}</p>
            </div>
        );
    }

    const also = (rec.candidates || []).filter((c: any) => c.action_type !== top.action_type);

    return (
        <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">Recommended action</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{ACTION[top.action_type] || top.action_type}</h1>

            <ul className="mt-6">
                {dx && <Row ok>Cause: {WHY_FAILED[dx.cause_category] || dx.cause_category}</Row>}
                <Row ok>Recovery estimate for this action: {pct(top.estimated_probability)}</Row>
                <Row ok>Expected value recovered: {money(top.expected_recoverable_value, ccy)}</Row>
                {top.rationale && <Row>{top.rationale}</Row>}
            </ul>

            {also.length > 0 && (
                <>
                    <div className="mt-6 text-sm font-semibold text-[--faint]">Also considered</div>
                    <ul className="mt-2 space-y-1 text-sm text-[--muted]">
                        {also.map((c: any) => (
                            <li key={c.action_type}>
                                {ACTION[c.action_type] || c.action_type} — est. value {money(c.expected_recoverable_value, ccy)}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div className="mt-10">
                <Note>
                    Proposed by the <b>rules engine</b> ({rec.engine_version}). This is a proposal only — it does
                    not run, and it does not bypass the policy check on the next screen.
                </Note>
            </div>
        </div>
    );
}
