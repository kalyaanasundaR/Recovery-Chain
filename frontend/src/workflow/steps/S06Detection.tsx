import React, { useEffect, useRef, useState } from 'react';
import { StepProps } from '../types';
import { buildCases, listCases } from '../../lib/api';
import { ErrorNote, Note, Row, BigStat } from '../../ui';

const STAGES = [
    'Reading validated records',
    'Analysing revenue events',
    'Identifying revenue at risk',
    'Creating recovery cases',
];

export default function S06Detection({ ctx, patch, next, setAction }: StepProps) {
    const [stage, setStage] = useState(0);
    const [done, setDone] = useState<any>(null);
    const [err, setErr] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const tick = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 700);
        (async () => {
            try {
                const build = await buildCases(ctx.importId!, 200);
                const all = await listCases();
                const ids: string[] = build.case_ids || [];
                const mine = (all || []).filter((c: any) => ids.includes(c.case_id));
                const active = mine.slice().sort((a: any, b: any) => Number(b.amount_at_risk) - Number(a.amount_at_risk))[0];
                clearInterval(tick); setStage(STAGES.length - 1);
                patch({ build, caseIds: ids, caseCount: mine.length, activeCaseId: active?.case_id });
                setDone(build);
            } catch (e: any) { clearInterval(tick); setErr(e.message); }
        })();
        return () => clearInterval(tick);
    }, []);

    useEffect(() => { setAction(done ? { label: 'Proceed →', onClick: next } : null); }, [done]);

    const c = done?.counters || {};
    const skips = [
        c.invalid_amount && `${c.invalid_amount} invalid amount`,
        c.invalid_entity && `${c.invalid_entity} missing customer`,
        c.invalid_timestamp && `${c.invalid_timestamp} invalid date`,
        c.invalid_target && `${c.invalid_target} missing result`,
        c.ambiguous_target && `${c.ambiguous_target} unclear result`,
    ].filter(Boolean);

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Finding revenue at risk</h1>

            {!done && !err && (
                <ul className="mt-8 space-y-2">
                    {STAGES.map((s, i) => (
                        <li key={s} className={`flex items-center gap-3 text-sm ${i < stage ? 'text-[--muted]' : i === stage ? 'text-[--ink]' : 'text-[--faint]'}`}>
                            <span className={i < stage ? 'text-emerald-400' : i === stage ? 'pulse-soft text-sky-400' : 'text-[--faint]'}>
                                {i < stage ? '✓' : '•'}
                            </span>
                            {s}{i === stage ? '…' : ''}
                        </li>
                    ))}
                </ul>
            )}

            {err && <div className="mt-6"><ErrorNote>{err}</ErrorNote></div>}

            {done && (
                <div className="mt-8 step-in">
                    <BigStat label="Recovery cases created" value={done.cases_generated} tone="blue"
                        sub={`from ${c.rows_seen ?? '—'} rows`} />
                    <ul className="mt-6">
                        <Row ok>{c.rows_accepted ?? done.cases_generated} rows became recovery cases</Row>
                        {(c.rows_skipped ?? 0) > 0 && (
                            <Row warn>
                                {c.rows_skipped} rows skipped
                                {skips.length ? ` — ${skips.join(', ')}` : ' — already paid or nothing to recover'}
                            </Row>
                        )}
                    </ul>
                    <div className="mt-8">
                        <Note>
                            Each case ran the real pipeline: risk assessment → cause diagnosis → recovery estimate →
                            recommended action → policy check → (act, if approved) → verify. The next screens walk
                            through the highest-value case.
                        </Note>
                    </div>
                </div>
            )}
        </div>
    );
}
