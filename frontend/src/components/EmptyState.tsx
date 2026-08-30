import React from 'react';
import { Link } from 'react-router-dom';
import { Database, AlertCircle, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
    title: string;
    description?: string;
    message?: string;
    action?: React.ReactNode;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

export function EmptyState({ 
    title, 
    description, 
    message, 
    action, 
    actionLabel, 
    actionHref, 
    onAction, 
    icon 
}: EmptyStateProps) {
    const text = description || message || '';

    return (
        <div className="p-10 sm:p-12 text-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800 flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-xl bg-slate-800/80 text-slate-400 border border-slate-700/60 shadow-md">
                {icon || <Database size={24} />}
            </div>
            <h3 className="text-base font-bold text-slate-200">{title}</h3>
            {text && <p className="text-xs text-slate-400 max-w-md leading-relaxed">{text}</p>}
            
            {action ? (
                <div className="mt-4">{action}</div>
            ) : actionLabel && (
                <div className="mt-4">
                    {actionHref ? (
                        <Link 
                            to={actionHref}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all btn-press"
                        >
                            {actionLabel}
                        </Link>
                    ) : onAction && (
                        <button 
                            onClick={onAction}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all btn-press"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
}

export function ErrorState({ title = "Operation Failed", message, onRetry }: ErrorStateProps) {
    return (
        <div className="p-5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 flex items-start gap-3.5 shadow-lg shadow-black/20">
            <AlertCircle size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
                <h4 className="text-sm font-bold text-rose-300">{title}</h4>
                <p className="text-xs text-rose-300/80 leading-relaxed font-mono">{message}</p>
                {onRetry && (
                    <button 
                        onClick={onRetry}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold bg-rose-900/60 hover:bg-rose-800 text-rose-100 px-3 py-1.5 rounded-lg border border-rose-700/60 transition-colors"
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                )}
            </div>
        </div>
    );
}
