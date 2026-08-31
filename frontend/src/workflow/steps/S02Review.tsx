import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { Pill, KV, Note } from '../../ui';
import { ROLE_OF, confidenceTone } from '../../lib/format';

export default function S02Review({ ctx, next, setAction }: StepProps) {
    useEffect(() => { setAction({ label: 'Proceed →', onClick: next }); }, []);

    const d = ctx.detail || {};
    const cols: any[] = d.columns_profile || [];
    const detected: any[] = (ctx.status?.detected_canonical_fields || [])
        .filter((f: any) => f.canonical_field && f.canonical_field !== 'UNKNOWN');
    const pv = ctx.preview || {};

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Here’s what we read</h1>
            <p className="mt-3 text-[--muted]">Straight from your file — nothing filled in.</p>

            <div className="mt-8 rounded-2xl border border-[--line] bg-[--panel] px-5 py-2">
                <KV k="File" v={<span className="font-mono">{d.name || d.filename}</span>} />
                <KV k="Type" v={(d.file_type || '').toUpperCase()} />
                <KV k="Records" v={<span className="tabular">{Number(d.row_count ?? 0).toLocaleString()}</span>} />
                <KV k="Columns" v={<span className="tabular">{d.column_count ?? cols.length}</span>} />
            </div>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[--faint]">Detected fields</h2>
            <ul className="mt-3 space-y-2">
                {detected.length === 0 && <li className="text-sm text-[--muted]">No recognisable fields detected.</li>}
                {detected.map((f: any) => (
                    <li key={f.original_column} className="flex items-center justify-between rounded-xl border border-[--line] bg-[--panel] px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm">
                            <span className="text-emerald-400">✓</span>
                            <span className="font-mono">{f.original_column}</span>
                            <span className="text-[--faint]">→ {ROLE_OF[f.canonical_field] || f.canonical_field}</span>
                        </span>
                        <Pill tone={confidenceTone(f.confidence)}>{String(f.confidence || '').toLowerCase() || 'unknown'} confidence</Pill>
                    </li>
                ))}
            </ul>

            {pv.rows?.length > 0 && (
                <>
                    <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[--faint]">First rows</h2>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-[--line]">
                        <table className="w-full text-xs">
                            <thead className="bg-white/[0.03] text-left text-[--muted]">
                                <tr>{pv.columns.map((c: any) => <th key={c.original_name} className="px-3 py-2 font-mono">{c.original_name}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-[--line] text-[--ink]">
                                {pv.rows.slice(0, 5).map((r: any, i: number) => (
                                    <tr key={i}>{pv.columns.map((c: any) => (
                                        <td key={c.original_name} className="px-3 py-1.5">{String(r[c.original_name] ?? '')}</td>
                                    ))}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="mt-8">
                <Note>Field detection is a first guess from column names and values. You confirm the important ones in step&nbsp;04.</Note>
            </div>
        </div>
    );
}
