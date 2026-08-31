import React, { useEffect, useState } from 'react';
import { StepProps } from '../types';
import { BigStat, Note, Row } from '../../ui';

export default function S03Quality({ ctx, next, setAction }: StepProps) {
    const [detail, setDetail] = useState(false);
    useEffect(() => { setAction({ label: 'Proceed →', onClick: next }); }, []);

    const d = ctx.detail || {};
    const q = d.data_quality_report || {};
    const cols: any[] = d.columns_profile || [];
    const leakage: any[] = d.leakage_detection || [];

    const totalMissing = cols.reduce((s, c) => s + (c.missing_count || 0), 0);
    const colsWithMissing = cols.filter(c => (c.missing_count || 0) > 0);
    const constants = cols.filter(c => c.is_constant);
    const score = typeof q.score === 'number' ? Math.round(q.score) : null;
    const tone = score === null ? 'gray' : score >= 85 ? 'green' : score >= 60 ? 'amber' : 'red';

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Data quality</h1>
            <p className="mt-3 text-[--muted]">
                {Number(d.row_count ?? 0).toLocaleString()} records examined.
            </p>

            <div className="mt-8 flex items-end gap-10">
                <BigStat label="Quality score" value={score === null ? '—' : `${score}`} tone={tone as any} sub="out of 100" />
            </div>

            {Array.isArray(q.breakdown) && q.breakdown.length > 0 && (
                <ul className="mt-6 space-y-1">
                    {q.breakdown.map((b: string, i: number) => (
                        <Row key={i} ok={b.trim().startsWith('+')} warn={b.trim().startsWith('-')}>
                            {b.replace(/^[+-]\d+(\.\d+)?:\s*/, '')}
                        </Row>
                    ))}
                </ul>
            )}

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[--faint]">Completeness</h2>
            <ul className="mt-2">
                <Row ok={totalMissing === 0} warn={totalMissing > 0}>
                    {totalMissing === 0 ? 'No missing values' : `${totalMissing.toLocaleString()} missing values across ${colsWithMissing.length} column(s)`}
                </Row>
                <Row ok={constants.length === 0} warn={constants.length > 0}>
                    {constants.length === 0 ? 'No constant (zero-signal) columns' : `${constants.length} constant column(s): ${constants.map(c => c.column_name).join(', ')}`}
                </Row>
                <Row ok={leakage.length === 0} warn={leakage.length > 0}>
                    {leakage.length === 0
                        ? 'No leakage risk (no post-outcome fields)'
                        : `${leakage.length} field(s) flagged as post-outcome and excluded: ${leakage.map(l => l.column).join(', ')}`}
                </Row>
            </ul>

            <button onClick={() => setDetail(v => !v)} className="mt-5 text-sm font-medium text-sky-400 hover:underline">
                {detail ? 'Hide column detail' : 'Review column detail'}
            </button>
            {detail && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-[--line]">
                    <table className="w-full text-xs">
                        <thead className="bg-white/[0.03] text-left text-[--muted]">
                            <tr><th className="px-3 py-2">Column</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Unique</th><th className="px-3 py-2">Missing</th></tr>
                        </thead>
                        <tbody className="divide-y divide-[--line] text-[--ink]">
                            {cols.map(c => (
                                <tr key={c.column_name}>
                                    <td className="px-3 py-1.5 font-mono">{c.column_name}</td>
                                    <td className="px-3 py-1.5 text-[--muted]">{c.dtype}</td>
                                    <td className="px-3 py-1.5 tabular">{c.unique_count}</td>
                                    <td className="px-3 py-1.5 tabular">{c.missing_count} ({Math.round((c.missing_rate || 0) * 100)}%)</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-8">
                <Note>
                    This is a dataset-level check. Row-by-row validation — invalid amounts, unparseable dates,
                    ambiguous results, already-paid rows — runs when recovery cases are built in step&nbsp;06,
                    and the counts are shown there.
                </Note>
            </div>
        </div>
    );
}
