import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Database, 
    Layers, 
    Menu, 
    X, 
    Lock,
    Activity,
    Shield
} from 'lucide-react';
import SafetyBanner from './SafetyBanner';

interface AppShellProps {
    children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    // Determine current section name for breadcrumb
    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Intelligence Dashboard';
        if (path === '/datasets') return 'Universal Dataset Lab';
        if (path.startsWith('/dataset/')) return 'Dataset Analysis & ML Studio';
        if (path === '/cases') return 'Recovery Cases Inventory';
        if (path.startsWith('/case/')) return 'Case Decision Record';
        return 'Financial Recovery Command Center';
    };

    const navLinkClass = (isActive: boolean) => 
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 relative ${
            isActive 
                ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/25 border border-blue-500/40 font-bold' 
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
        }`;

    const sidebarClass = `fixed lg:static inset-y-0 left-0 z-30 w-64 bg-slate-900/95 lg:bg-slate-900/40 border-r border-slate-800/80 flex flex-col justify-between p-4 transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    } transition-transform duration-200 ease-in-out backdrop-blur-md lg:backdrop-blur-none`;

    return (
        <div className="min-h-screen bg-[#080c14] text-slate-100 font-sans flex flex-col antialiased selection:bg-blue-600 selection:text-white">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 h-16 flex items-center justify-between px-4 sm:px-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="lg:hidden p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
                        aria-label="Toggle navigation menu"
                    >
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                    
                    <Link to="/" className="flex items-center gap-2.5 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold font-mono text-sm shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform border border-blue-400/20">
                            RC
                        </div>
                        <div>
                            <span className="font-extrabold tracking-tight text-base text-slate-100 font-mono">RecoverChain</span>
                            <span className="text-[10px] text-blue-300 font-mono ml-2 px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 hidden sm:inline">
                                v1.0.0-rc
                            </span>
                        </div>
                    </Link>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="hidden md:flex items-center gap-2.5 text-xs font-mono text-slate-400 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Policy Engine: <strong className="text-emerald-300">ACTIVE</strong></span>
                        <span className="text-slate-700">|</span>
                        <span>ML: <strong className="text-purple-300">SHADOW</strong></span>
                    </div>

                    <SafetyBanner compact />
                </div>
            </header>

            <div className="flex-1 flex">
                {/* Collapsible Sidebar */}
                <aside className={sidebarClass}>
                    <div className="space-y-6">
                        {/* Navigation Links */}
                        <div className="space-y-1">
                            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-3 py-2">
                                Operations
                            </div>
                            
                            <NavLink 
                                to="/" 
                                end
                                onClick={() => setSidebarOpen(false)}
                                className={({ isActive }) => navLinkClass(isActive)}
                            >
                                <LayoutDashboard size={17} />
                                <span>Dashboard</span>
                            </NavLink>

                            <NavLink 
                                to="/datasets" 
                                onClick={() => setSidebarOpen(false)}
                                className={({ isActive }) => navLinkClass(isActive)}
                            >
                                <Database size={17} />
                                <span>Dataset Lab</span>
                            </NavLink>

                            <NavLink 
                                to="/cases" 
                                onClick={() => setSidebarOpen(false)}
                                className={({ isActive }) => navLinkClass(isActive)}
                            >
                                <Layers size={17} />
                                <span>Recovery Cases</span>
                            </NavLink>
                        </div>

                        {/* Telemetry Architecture Panel */}
                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5 text-xs">
                            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span>System Boundaries</span>
                                <Lock size={12} className="text-slate-500" />
                            </div>
                            <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">ML Mode:</span>
                                    <span className="text-purple-300 font-semibold px-1 py-0.2 rounded bg-purple-950/60 border border-purple-800/50">SHADOW_ONLY</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Authority:</span>
                                    <span className="text-emerald-300 font-semibold px-1 py-0.2 rounded bg-emerald-950/60 border border-emerald-800/50">POLICY ENGINE</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Execution:</span>
                                    <span className="text-blue-300 font-semibold px-1 py-0.2 rounded bg-blue-950/60 border border-blue-800/50">SIMULATED</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Footer */}
                    <div className="pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1 font-mono">
                        <div>RecoverChain AI Controller</div>
                        <div>Deterministic Financial Governance</div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
                    {/* Breadcrumbs / Page Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/70 pb-4">
                        <div className="space-y-0.5">
                            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                                RecoverChain / {getPageTitle()}
                            </div>
                            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-100">
                                {getPageTitle()}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 font-mono bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Live Telemetry Stream
                            </span>
                        </div>
                    </div>

                    {children}
                </main>
            </div>

            {/* Persistent Global Footer */}
            <footer className="bg-slate-900/80 border-t border-slate-800/80 py-3 px-6 text-center text-[11px] text-slate-400 font-mono flex flex-wrap justify-between items-center gap-2">
                <span>RecoverChain AI &bull; Autonomous Revenue Recovery Engine</span>
                <span>Deterministic Policy Engine Authority &bull; Advisory ML Shadow Only &bull; Sandbox Mode</span>
            </footer>
        </div>
    );
}
