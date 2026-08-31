import React from 'react';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple';

const TONE: Record<Tone, string> = {
    green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    red: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    blue: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
    gray: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
    purple: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
};

export function Pill({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {children}
        </span>
    );
}

export function Card({ title, subtitle, right, children, className = '' }: {
    title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode;
    children: React.ReactNode; className?: string;
}) {
    return (
        <section className={`rounded-xl border border-slate-800 bg-slate-900/50 ${className}`}>
            {(title || right) && (
                <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
                    <div>
                        {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
                        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
                    </div>
                    {right}
                </header>
            )}
            <div className="p-5">{children}</div>
        </section>
    );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone }) {
    const color = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-rose-300' :
        tone === 'amber' ? 'text-amber-300' : 'text-slate-100';
    return (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
        </div>
    );
}

export function Button({ variant = 'primary', className = '', ...p }:
    React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
    const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const v = variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-500'
        : variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-500'
            : 'border border-slate-700 text-slate-200 hover:bg-slate-800';
    return <button className={`${base} ${v} ${className}`} {...p} />;
}

export function Spinner({ label }: { label?: string }) {
    return (
        <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
            {label || 'Loading…'}
        </div>
    );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
            <p className="font-medium text-slate-300">{title}</p>
            {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
        </div>
    );
}

export function ErrorNote({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
    return (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {children}
            {onRetry && <button onClick={onRetry} className="ml-3 underline">try again</button>}
        </div>
    );
}
