import React from 'react';

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: string;
    trendPositive?: boolean;
    color?: string;
    bg?: string;
    isFinancial?: boolean;
    badge?: string;
}

export default function MetricCard({
    title,
    value,
    subtitle,
    icon,
    trend,
    trendPositive,
    color = "text-slate-100",
    bg = "bg-slate-900/70 border-slate-800/80",
    isFinancial = false,
    badge
}: MetricCardProps) {
    return (
        <div className={`p-5 rounded-xl border ${bg} shadow-lg shadow-black/30 flex flex-col justify-between hover-card backdrop-blur-sm group relative overflow-hidden`}>
            {/* Top Row: Title, Badge, Icon */}
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                            {title}
                        </span>
                        {badge && (
                            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60 uppercase">
                                {badge}
                            </span>
                        )}
                    </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/80 text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-950/40 group-hover:border-blue-800/60 transition-all border border-slate-700/60 flex-shrink-0">
                    {icon}
                </div>
            </div>
            
            {/* Numeric Figure */}
            <div className="mt-4">
                <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${color} ${isFinancial ? 'font-mono' : ''}`}>
                    {value}
                </div>
                
                {(subtitle || trend) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {trend && (
                            <span className={`font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded border ${
                                trendPositive 
                                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50' 
                                    : 'bg-rose-950/50 text-rose-300 border-rose-800/50'
                            }`}>
                                {trend}
                            </span>
                        )}
                        {subtitle && <span className="text-slate-400 text-[11px] font-mono">{subtitle}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
