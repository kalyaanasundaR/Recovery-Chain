import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { Note, Pill, Row } from '../../ui';

const SPLIT_LABEL: Record<string, string> = {
    TEMPORAL_WITH_ENTITY_ISOLATION: 'By date, and grouped by customer so no customer is in both train and test',
    TEMPORAL_CHRONOLOGICAL: 'By date — oldest rows train the model, newest rows test it',
    RANDOM_SHUFFLE: 'Random split — no date column was available to split on chronologically',
};

const EXCL_LABEL: Record<string, string> = {
    TARGET: 'the result itself — this is what a model would predict',
    IDENTIFIER: 'an ID, not a predictive signal',
    CONSTANT: 'the same value in every row — no information',
    HIGH_CARDINALITY: 'free text with too many unique values to learn from',
};
const exclText = (reason = '') =>
    EXCL_LABEL[reason] ||
    (reason.startsWith('POST_OUTCOME') ? 'only known after the outcome — using it would leak the answer' : reason);

export default function S05Connection({ ctx, next, setAction }: StepProps) {
    useEffect(() => { setAction({ label: 'Proceed →', onClick: next }); }, []);

    const d = ctx.detail || {};
    const r = ctx.readiness || {};
    const cmap: Record<string, string> = r.canonical_feature_mapping || {};
    const reasons: Record<string, string> = r.exclusion_reasons || {};
    const feats: string[] = r.feature_columns || [];
    const excl: string[] = r.excluded_columns || [];
    const cb = r.class_balance || {};
    const split = r.temporal_split || {};

    const byCanon = (cf: string) => Object.keys(cmap).find(k => cmap[k] === cf);
    const idCol = Object.keys(reasons).find(k => reasons[k] === 'IDENTIFIER');

    const core = [
        { label: 'Customer', col: idCol, note: 'who owes the money' },
        { label: 'Amount', col: byCanon('AMOUNT'), note: 'how much is at risk' },
        { label: 'Date', col: split.split_column || byCanon('TIMESTAMP'), note: 'when it failed or was due' },
        { label: 'Result', col: r.target_column, note: 'paid or failed — the outcome every case is judged on' },
    ];

    const tag = (c: string) => {
        const v = cmap[c];
        return !v || v === 'UNKNOWN' ? 'raw signal' : v.toLowerCase();
    };

    const status: string = r.readiness_status || ctx.status?.ml_readiness_status || 'UNKNOWN';
    const warnings: string[] = r.warnings || [];
    const readyTone = status.includes('READY') ? (warnings.length ? 'amber' : 'green') : 'red';

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Data connection</h1>
            <p className="mt-3 text-[--muted]">
                Your columns are now wired into the RecoverChain pipeline. Here is exactly how.
            </p>

            {/* file -> pipeline */}
            <div className="mt-8 flex items-stretch justify-center gap-4">
                <div className="flex-1 rounded-xl border border-[--line] bg-[--panel] px-5 py-4 text-center">
                    <div className="font-mono text-sm">{d.name || d.filename || 'your file'}</div>
                    <div className="mt-1 text-xs text-[--faint]">
                        {Number(d.row_count ?? 0).toLocaleString()} rows · {d.column_count ?? '—'} columns
                    </div>
                </div>
                <div className="flex items-center text-[--faint]">→</div>
                <div className="flex-1 rounded-xl border border-sky-500/30 bg-sky-500/[0.05] px-5 py-4 text-center">
                    <div className="text-sm font-semibold text-sky-200">RecoverChain pipeline</div>
                    <div className="mt-1 text-xs text-[--faint]">{r.prediction_problem || 'payment-failure-risk'}</div>
                </div>
            </div>

            {/* the four inputs */}
            <div className="mt-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">
                    The four inputs every case uses
                </div>
                <div className="mt-3 divide-y divide-[--line] rounded-xl border border-[--line] bg-[--panel] px-4">
                    {core.map(f => (
                        <div key={f.label} className="flex items-baseline justify-between gap-4 py-3">
                            <div>
                                <span className="text-sm font-medium">{f.label}</span>
                                <span className="ml-2 text-xs text-[--faint]">{f.note}</span>
                            </div>
                            <span className="font-mono text-sm text-[--ink]">{f.col || <span className="text-rose-300">missing</span>}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* model features */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[--line] bg-[--panel] p-4">
                    <div className="text-sm font-semibold">Feeds the shadow model</div>
                    <div className="mt-0.5 text-xs text-[--faint]">
                        {feats.length} column{feats.length === 1 ? '' : 's'} · the model never decides an action
                    </div>
                    <ul className="mt-2 space-y-1">
                        {feats.length === 0 && <li className="text-sm text-[--muted]">none</li>}
                        {feats.map(c => (
                            <li key={c} className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-mono">{c}</span>
                                <span className="text-xs text-[--faint]">{tag(c)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-xl border border-[--line] bg-[--panel] p-4">
                    <div className="text-sm font-semibold">Held out on purpose</div>
                    <div className="mt-0.5 text-xs text-[--faint]">{excl.length} column{excl.length === 1 ? '' : 's'}</div>
                    <ul className="mt-2 space-y-1.5">
                        {excl.map(c => (
                            <li key={c} className="text-sm">
                                <span className="font-mono">{c}</span>
                                <span className="block text-xs text-[--faint]">{exclText(reasons[c])}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* split + balance */}
            <div className="mt-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--faint]">
                    How the data is split for honest evaluation
                </div>
                <ul className="mt-3 rounded-xl border border-[--line] bg-[--panel] px-4 py-2">
                    <Row ok={split.strategy !== 'RANDOM_SHUFFLE'} warn={split.strategy === 'RANDOM_SHUFFLE'}>
                        {SPLIT_LABEL[split.strategy] || split.strategy || 'not determined'}
                    </Row>
                    <Row ok>
                        {split.train_period || 'earliest 70%'} train · {split.validation_period || 'middle 15%'} validation ·{' '}
                        {split.test_period || 'latest 15%'} test
                    </Row>
                    {(cb.positive_rate != null) && (
                        <Row warn={Number(cb.negative_rate) < 10 || Number(cb.positive_rate) < 10}>
                            Class balance: {cb.positive_rate}% failed · {cb.negative_rate}% paid
                            {cb.imbalance_ratio ? ` (${cb.imbalance_ratio})` : ''}
                        </Row>
                    )}
                </ul>
            </div>

            {/* readiness verdict */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
                <Pill tone={readyTone as any}>{status.replace(/_/g, ' ').toLowerCase()}</Pill>
                <span className="text-sm text-[--muted]">
                    {status.includes('READY')
                        ? 'This file can be turned into recovery cases.'
                        : 'This file is missing something the pipeline needs.'}
                </span>
            </div>
            {warnings.length > 0 && (
                <ul className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2">
                    {warnings.map((w, i) => <Row key={i} warn>{w}</Row>)}
                </ul>
            )}

            <div className="mt-8">
                <Note>
                    One file per run. Linking several files (payments&nbsp;↔&nbsp;customers&nbsp;↔&nbsp;invoices) on a
                    shared key isn’t built yet — there’s no join step in the backend. This run continues with the
                    single file above.
                </Note>
            </div>
        </div>
    );
}
