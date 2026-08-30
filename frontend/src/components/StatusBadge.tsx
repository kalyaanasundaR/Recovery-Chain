import React from 'react';

interface StatusBadgeProps {
    status: string;
    variant?: 'policy' | 'risk' | 'dataset' | 'ml' | 'execution' | 'confidence' | 'default';
    size?: 'xs' | 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, variant = 'default', size = 'sm' }: StatusBadgeProps) {
    const s = (status || 'UNKNOWN').toUpperCase();
    
    let colorClasses = 'bg-slate-900/80 text-slate-300 border-slate-700/80';
    let dotColor = 'bg-slate-400';

    if (variant === 'policy' || s === 'PERMITTED' || s === 'APPROVED' || s === 'COMPLETED' || s === 'SUCCESS' || s === 'VERIFIED') {
        if (s === 'PERMITTED' || s === 'APPROVED' || s === 'COMPLETED' || s === 'SUCCESS' || s === 'VERIFIED') {
            colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 shadow-sm shadow-emerald-950/40';
            dotColor = 'bg-emerald-400 shadow-sm shadow-emerald-400/50';
        } else if (s === 'DENIED' || s === 'REJECTED' || s === 'FAILED') {
            colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-700/60 shadow-sm shadow-rose-950/40';
            dotColor = 'bg-rose-400 shadow-sm shadow-rose-400/50';
        } else if (s === 'ESCALATE' || s === 'WAIT' || s === 'PENDING_REVIEW' || s === 'WAITING_HUMAN_REVIEW') {
            colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-700/60 shadow-sm shadow-amber-950/40';
            dotColor = 'bg-amber-400 shadow-sm shadow-amber-400/50';
        }
    } else if (variant === 'risk' || s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') {
        if (s === 'CRITICAL') {
            colorClasses = 'bg-rose-950/80 text-rose-200 border-rose-600 font-bold shadow-sm shadow-rose-950/60';
            dotColor = 'bg-rose-400 animate-pulse';
        } else if (s === 'HIGH') {
            colorClasses = 'bg-orange-950/60 text-orange-300 border-orange-700/70';
            dotColor = 'bg-orange-400';
        } else if (s === 'MEDIUM') {
            colorClasses = 'bg-amber-950/50 text-amber-300 border-amber-800/60';
            dotColor = 'bg-amber-400';
        } else if (s === 'LOW') {
            colorClasses = 'bg-slate-900/60 text-slate-300 border-slate-700/60';
            dotColor = 'bg-slate-400';
        }
    } else if (variant === 'dataset') {
        if (s === 'TRAINED' || s === 'COMPLETED' || s === 'ML_READY') {
            colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60';
            dotColor = 'bg-emerald-400';
        } else if (s === 'MAPPING_REVIEW' || s === 'AMBIGUOUS' || s === 'READY_FOR_ANALYSIS') {
            colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-700/60';
            dotColor = 'bg-amber-400';
        } else if (s === 'TRAINING' || s === 'PROFILING' || s === 'ANALYZING') {
            colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-700/60';
            dotColor = 'bg-blue-400 animate-ping';
        } else if (s === 'FAILED') {
            colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-700/60';
            dotColor = 'bg-rose-400';
        }
    } else if (variant === 'ml' || s.includes('SHADOW') || s.includes('READY')) {
        if (s.includes('SHADOW')) {
            colorClasses = 'bg-purple-950/70 text-purple-200 border-purple-600/70 font-semibold shadow-sm shadow-purple-950/50';
            dotColor = 'bg-purple-400';
        } else if (s.includes('READY')) {
            colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60';
            dotColor = 'bg-emerald-400';
        } else if (s.includes('UNSUITABLE') || s.includes('BLOCKED')) {
            colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-700/60';
            dotColor = 'bg-rose-400';
        }
    } else if (variant === 'confidence') {
        if (s === 'HIGH') {
            colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50';
            dotColor = 'bg-emerald-400';
        } else if (s === 'MEDIUM') {
            colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-700/50';
            dotColor = 'bg-blue-400';
        } else if (s === 'LOW' || s === 'AMBIGUOUS') {
            colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-700/50';
            dotColor = 'bg-amber-400';
        }
    }

    const sizeClasses = 
        size === 'lg' ? 'px-3 py-1 text-xs font-semibold tracking-wider' :
        size === 'md' ? 'px-2.5 py-0.5 text-[11px] font-medium tracking-wider' :
        size === 'xs' ? 'px-1.5 py-0.2 text-[9px] font-medium' :
        'px-2 py-0.5 text-[10px] font-medium tracking-wider';

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border uppercase font-mono transition-colors ${sizeClasses} ${colorClasses}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`}></span>
            {status}
        </span>
    );
}
