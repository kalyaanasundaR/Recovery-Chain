import React from 'react';
import { STEPS, Action } from './types';
import { Button, Spinner } from '../ui';

export default function Frame({ idx, action, children }:
    { idx: number; action: Action | null; children: React.ReactNode }) {
    const step = STEPS[idx];
    const [busy, setBusy] = React.useState('');

    async function run(fn?: () => void | Promise<void>, label?: string) {
        if (!fn) return;
        setBusy(label || 'Working…');
        try { await fn(); } finally { setBusy(''); }
    }

    return (
        <div className="flex min-h-[70vh] flex-col">
            <div key={idx} className="step-in flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[--faint]">
                    Step {step.n} — {step.title}
                </div>
                <div className="mt-6">{children}</div>
            </div>

            {(action || busy) && (
                <div className="mt-10 flex items-center justify-between gap-4 border-t border-[--line] pt-6">
                    <div>{busy && <Spinner label={busy} />}</div>
                    <div className="flex items-center gap-3">
                        {action?.secondary && (
                            <Button variant="ghost" onClick={() => run(action.secondary!.onClick)}>
                                {action.secondary.label}
                            </Button>
                        )}
                        {action && (
                            <Button
                                disabled={action.disabled || !!busy}
                                onClick={() => run(action.onClick, action.busy)}
                            >
                                {action.label}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
