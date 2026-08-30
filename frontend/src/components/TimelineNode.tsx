import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface TimelineNodeProps {
    step: string | number;
    title: string;
    status: string;
    source: string;
    timestamp?: string;
    children: React.ReactNode;
    isPolicy?: boolean;
    isML?: boolean;
}

export default function TimelineNode({
    step,
    title,
    status,
    source,
    timestamp,
    children,
    isPolicy = false,
    isML = false
}: TimelineNodeProps) {
    const s = (status || 'PENDING').toUpperCase();
    const isCompleted = s === 'COMPLETED' || s === 'PERMITTED' || s === 'APPROVED' || s === 'VERIFIED' || s === 'SUCCESS';
    const isDenied = s === 'DENIED' || s === 'REJECTED' || s === 'FAILED' || s === 'BLOCKED';
    const isWait = s === 'WAIT' || s === 'ESCALATE' || s === 'PENDING_REVIEW' || s === 'WAITING_HUMAN_REVIEW';
    
    const icon = isDenied ? <XCircle className="text-rose-400" size={17} /> : 
                 isWait ? <AlertTriangle className="text-amber-400" size={17} /> :
                 isCompleted ? <CheckCircle2 className="text-emerald-400" size={17} /> : 
                 <Clock className="text-slate-500" size={17} />;

    let nodeBorder = 'border-slate-800/80 bg-slate-900/50';
    if (isPolicy) nodeBorder = 'border-emerald-800/50 bg-emerald-950/10 ring-1 ring-emerald-700/20';
    if (isML) nodeBorder = 'border-purple-800/50 bg-purple-950/15 ring-1 ring-purple-700/20';

    return (
        <div className={`rounded-xl border ${nodeBorder} p-4 sm:p-5 shadow-lg shadow-black/25 transition-all hover:border-slate-700/90 animate-slide-up`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-800/90 text-slate-300 font-mono font-bold text-xs flex items-center justify-center border border-slate-700/70 shadow-sm">
                        {step}
                    </span>
                    {icon}
                    <div>
                        <h3 className="font-bold text-sm text-slate-100">{title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-slate-400 font-mono">{source}</span>
                            {timestamp && <span className="text-[10px] text-slate-500 font-mono">&bull; {timestamp}</span>}
                        </div>
                    </div>
                </div>
                <div>
                    <StatusBadge status={status} variant={isPolicy ? 'policy' : isML ? 'ml' : 'default'} />
                </div>
            </div>
            
            <div className="pl-0 sm:pl-9 mt-2">
                {children}
            </div>
        </div>
    );
}
