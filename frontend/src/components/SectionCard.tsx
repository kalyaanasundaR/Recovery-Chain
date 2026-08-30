import React from 'react';

interface SectionCardProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerClassName?: string;
    badge?: React.ReactNode;
    variant?: 'default' | 'highlight' | 'danger' | 'purple';
}

export default function SectionCard({
    title,
    subtitle,
    action,
    children,
    className = "",
    headerClassName = "",
    badge,
    variant = 'default'
}: SectionCardProps) {
    let borderClass = 'border-slate-800/80 bg-slate-900/60';
    let headerGlow = 'bg-slate-900/80';
    
    if (variant === 'highlight') {
        borderClass = 'border-blue-800/60 bg-blue-950/15 shadow-blue-950/20';
        headerGlow = 'bg-blue-950/40';
    } else if (variant === 'danger') {
        borderClass = 'border-rose-800/60 bg-rose-950/15 shadow-rose-950/20';
        headerGlow = 'bg-rose-950/40';
    } else if (variant === 'purple') {
        borderClass = 'border-purple-800/60 bg-purple-950/15 shadow-purple-950/20';
        headerGlow = 'bg-purple-950/40';
    }

    return (
        <div className={`rounded-xl border ${borderClass} shadow-xl shadow-black/30 overflow-hidden backdrop-blur-sm ${className}`}>
            {(title || subtitle || action || badge) && (
                <div className={`px-5 sm:px-6 py-3.5 border-b border-slate-800/80 flex flex-wrap justify-between items-center gap-3 ${headerGlow} ${headerClassName}`}>
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight">{title}</h2>
                            {badge}
                        </div>
                        {subtitle && <p className="text-[11px] text-slate-400 font-mono">{subtitle}</p>}
                    </div>
                    {action && <div className="flex items-center gap-2">{action}</div>}
                </div>
            )}
            <div className="p-5 sm:p-6">
                {children}
            </div>
        </div>
    );
}
