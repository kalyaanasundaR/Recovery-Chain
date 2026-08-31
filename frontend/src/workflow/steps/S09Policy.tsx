import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { useSnap } from './useSnap';
import { Spinner, ErrorNote, Note, BigStat } from '../../ui';
import { ACTION, RULE_LABEL, policyVerdict } from '../../lib/format';

export default function S09Policy({ ctx, patch, next, setAction }: StepProps) {
    const { snap, loading, err, refresh } = useSnap(ctx, patch);
    useEffect(() => { setAction(snap ? { label: 'Proceed →', onClick: next } : null); }, [snap]);

    if (loading || !snap) return err ? <ErrorNote onRetry={refresh}>{err}</ErrorNote> : <Spinner label="Loading policy result…" />;

    const pol = snap.policy_decision;
    const top = snap.recommendation?.top_candidate;
    const v = policyVerdict(pol?.status);
    const rules = pol?.rules_evaluated || [];

    return (
        <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">Proposed action</div>
            <div className="mt-1 text-lg font-medium">{top ? (ACTION[top.action_type] || top.action_type) : '—'}</div>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[--faint]">Checks</h2>
            <ul className="mt-2 divide-y divide-[--line] rounded-xl border border-[--line]">
                {rules.length === 0 && <li className="px-4 py-3 text-sm text-[--muted]">No rules were applicable.</li>}
                {rules.map((r: any, i: number) => (
                    <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <span className={r.passed ? 'text-emerald-400' : 'text-amber-400'}>{r.passed ? '✓' : '⚠'}</span>
                        <span>
                            <span className="font-medium">{RULE_LABEL[r.rule_name] || r.rule_name}</span>
                            <span className="block text-[--muted]">{r.details}</span>
                        </span>
                    </li>
                ))}
            </ul>

            <div className="mt-8">
                <BigStat label="Policy result" value={v.label} tone={v.tone as any} sub={pol?.reason || v.note} />
            </div>

            <div className="mt-8">
                <Note>
                    Decided by the PolicyEngine ({pol?.policy_version}) — the only thing that can authorise an
                    action. AI proposes, policy validates, and execution only happens after approval. No component
                    can bypass this.
                </Note>
            </div>
        </div>
    );
}
