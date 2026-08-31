import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Home, PlayCircle, ListChecks, Menu, X } from 'lucide-react';

const NAV = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/run', label: 'New recovery run', icon: PlayCircle, end: false },
    { to: '/cases', label: 'Cases', icon: ListChecks, end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`;

function Nav({ onGo }: { onGo?: () => void }) {
    return (
        <nav className="space-y-1 p-4">
            {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={onGo} className={linkClass}>
                    <Icon size={18} /> {label}
                </NavLink>
            ))}
            <p className="px-3 pt-6 text-xs leading-relaxed text-slate-500">
                A recovery run turns a list of failed payments into cases, decides the safest
                way to chase each one, and shows you what came back. A person approves anything risky.
            </p>
        </nav>
    );
}

export default function Shell({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="min-h-full bg-slate-950 text-slate-200">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur">
                <div className="flex items-center gap-3">
                    <button onClick={() => setOpen(true)} className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800">
                        <Menu size={18} />
                    </button>
                    <Link to="/" className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-xs font-bold text-white">RC</span>
                        <span className="font-semibold">RecoverChain</span>
                    </Link>
                </div>
                <span className="hidden text-xs text-slate-500 sm:block">
                    Actions are simulated · a person approves anything risky
                </span>
            </header>

            <div className="mx-auto flex max-w-[1200px]">
                <aside className="hidden w-56 shrink-0 border-r border-slate-800 lg:block">
                    <div className="sticky top-14"><Nav /></div>
                </aside>

                {open && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
                        <div className="absolute inset-y-0 left-0 w-64 bg-slate-950">
                            <div className="flex justify-end p-2">
                                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X size={18} /></button>
                            </div>
                            <Nav onGo={() => setOpen(false)} />
                        </div>
                    </div>
                )}

                <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
            </div>
        </div>
    );
}
