import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { STEPS, Action } from './types';
import { Button, Spinner } from '../ui';

export default function Frame({ idx, action, motion, children }:
    { idx: number; action: Action | null; motion: boolean; children: React.ReactNode }) {
    const step = STEPS[idx];
    const [busy, setBusy] = useState('');
    const body = useRef<HTMLDivElement>(null);

    // GSAP step-in timeline (falls back to the CSS .step-in class when motion off)
    useEffect(() => {
        if (!motion || !body.current) return;
        const el = body.current;
        const ctx = gsap.context(() => {
            gsap.fromTo(el,
                { autoAlpha: 0, y: 14, filter: 'blur(3px)' },
                { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' });
            gsap.fromTo(el.querySelectorAll('[data-stagger]'),
                { autoAlpha: 0, y: 10 },
                { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.05, delay: 0.08 });
        }, el);
        return () => ctx.revert();
    }, [idx, motion]);

    async function run(fn?: () => void | Promise<void>, label?: string) {
        if (!fn) return;
        setBusy(label || 'Working…');
        try { await fn(); } finally { setBusy(''); }
    }

    return (
        <div className="flex min-h-[70vh] flex-col">
            <div ref={body} key={idx} className={`flex-1 ${motion ? '' : 'step-in'}`}>
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
                            <Button disabled={action.disabled || !!busy} onClick={() => run(action.onClick, action.busy)}>
                                {action.label}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
