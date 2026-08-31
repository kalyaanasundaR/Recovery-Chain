import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, Layers, Menu, X, ShieldCheck } from 'lucide-react';

interface AppShellProps {
    children: React.ReactNode;
}

const NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/datasets', label: 'Dataset Lab', icon: Database, end: false },
    { to: '/cases', label: 'Recovery Cases', icon: Layers, end: false },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
    }`;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
    return (
        <div className="flex h-full flex-col justify-between p-4">
            <nav className="space-y-1">
                <div className="px-3 pb-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Operations
                </div>
                {NAV.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} onClick={onNavigate} className={navLinkClass}>
                        <Icon size={17} />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3 text-[11px] font-mono space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">System boundaries</div>
                <div className="flex justify-between"><span className="text-slate-500">ML</span><span className="text-purple-300">Shadow-only</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Authority</span><span className="text-emerald-300">Policy Engine</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Execution</span><span className="text-blue-300">Simulated</span></div>
            </div>
        </div>
    );
}

export default function AppShell({ children }: AppShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#080c14] text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white">
            {/* Top bar */}
            <header className="sticky top-0 z-40 h-14 bg-slate-950/85 backdrop-blur border-b border-slate-800/80 flex items-center justify-between px-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 border border-slate-800"
                        aria-label="Open navigation"
                    >
                        <Menu size={18} />
                    </button>
                    <Link to="/" className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-500 grid place-items-center text-white font-bold font-mono text-xs">
                            RC
                        </div>
                        <span className="font-bold tracking-tight">RecoverChain</span>
                    </Link>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-purple-300 bg-purple-950/40 border border-purple-800/50 rounded-md px-2.5 py-1">
                    <ShieldCheck size={13} />
                    <span>ML shadow-only · Policy Engine is sole authority · Execution simulated</span>
                </div>
            </header>

            <div className="flex">
                {/* Desktop sidebar — plain flex column, always in normal flow */}
                <aside className="hidden lg:block w-60 shrink-0 border-r border-slate-800/80 sticky top-14 self-start h-[calc(100vh-3.5rem)]">
                    <SidebarBody />
                </aside>

                {/* Mobile drawer */}
                {drawerOpen && (
                    <div className="fixed inset-0 z-50 lg:hidden">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
                        <div className="absolute inset-y-0 left-0 w-64 bg-slate-950 border-r border-slate-800">
                            <div className="flex justify-end p-2">
                                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800">
                                    <X size={18} />
                                </button>
                            </div>
                            <SidebarBody onNavigate={() => setDrawerOpen(false)} />
                        </div>
                    </div>
                )}

                {/* Content */}
                <main className="flex-1 min-w-0">
                    <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
