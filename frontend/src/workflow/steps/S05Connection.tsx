import React, { useEffect } from 'react';
import { StepProps } from '../types';
import { Note } from '../../ui';

export default function S05Connection({ ctx, next, setAction }: StepProps) {
    useEffect(() => { setAction({ label: 'Proceed →', onClick: next }); }, []);
    const d = ctx.detail || {};

    return (
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Data connection</h1>
            <p className="mt-3 text-[--muted]">Whether this data links to other datasets.</p>

            <div className="mt-8 flex flex-col items-center gap-3">
                <div className="rounded-xl border border-[--line] bg-[--panel] px-6 py-4 text-center">
                    <div className="font-mono text-sm">{d.name || d.filename}</div>
                    <div className="mt-1 text-xs text-[--faint]">
                        {Number(d.row_count ?? 0).toLocaleString()} records · {d.column_count} columns
                    </div>
                </div>
                <div className="text-[--faint]">│</div>
                <div className="rounded-xl border border-dashed border-[--line] px-6 py-3 text-sm text-[--muted]">
                    stands alone
                </div>
            </div>

            <div className="mt-8">
                <Note tone="amber">
                    <b>Not available in the current system.</b> RecoverChain processes one dataset per run.
                    Linking several files (for example payments&nbsp;↔&nbsp;customers&nbsp;↔&nbsp;invoices) on a
                    shared key is not implemented — there is no relationship-detection or join step in the
                    backend today. This run continues with the single file you uploaded.
                </Note>
            </div>
        </div>
    );
}
