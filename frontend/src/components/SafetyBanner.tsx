import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface SafetyBannerProps {
    compact?: boolean;
}

export default function SafetyBanner({ compact = false }: SafetyBannerProps) {
    if (compact) {
        return (
            <div className="flex items-center gap-2 bg-purple-950/40 text-purple-300 text-[11px] px-3 py-1.5 rounded-lg border border-purple-800/60 font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span>ML: SHADOW-ONLY &bull; POLICY ENGINE: DETERMINISTIC AUTHORITY &bull; EXECUTION: SIMULATED</span>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-r from-slate-900/90 via-indigo-950/30 to-purple-950/20 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5 shadow-lg shadow-black/20 text-xs text-slate-300">
            <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 flex-shrink-0 mt-0.5">
                <ShieldCheck size={18} />
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-wider text-indigo-300 font-mono text-[11px]">
                        Institutional Safety Architecture & Governance
                    </span>
                    <span className="bg-purple-950 text-purple-300 text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-purple-800/60">
                        SHADOW-ONLY
                    </span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                    Machine learning recovery predictors operate strictly in advisory <strong>SHADOW_ONLY</strong> mode. All execution thresholds, cooldown windows, and customer contacts are authorized exclusively by the <strong>Deterministic Policy Engine</strong>. Execution outcomes are simulated in an isolated sandbox without connecting live banking APIs, Stripe, or payment gateways.
                </p>
            </div>
        </div>
    );
}
