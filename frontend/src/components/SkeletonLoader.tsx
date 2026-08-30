import React from 'react';

export function MetricSkeleton() {
    return (
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
                <div className="h-3 w-28 rounded skeleton-shimmer"></div>
                <div className="h-5 w-5 rounded skeleton-shimmer"></div>
            </div>
            <div className="h-8 w-36 rounded skeleton-shimmer"></div>
            <div className="h-3 w-20 rounded skeleton-shimmer"></div>
        </div>
    );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
    return (
        <tr className="border-b border-slate-800/80">
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} className="px-6 py-4">
                    <div className="h-4 rounded skeleton-shimmer w-full max-w-[120px]"></div>
                </td>
            ))}
        </tr>
    );
}

export function CardSkeleton() {
    return (
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="h-5 w-40 rounded skeleton-shimmer"></div>
            <div className="h-4 w-full rounded skeleton-shimmer"></div>
            <div className="h-4 w-3/4 rounded skeleton-shimmer"></div>
            <div className="h-10 w-full rounded skeleton-shimmer mt-4"></div>
        </div>
    );
}

export function TimelineSkeleton() {
    return (
        <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                        <div className="h-4 w-36 rounded skeleton-shimmer"></div>
                        <div className="h-4 w-16 rounded skeleton-shimmer"></div>
                    </div>
                    <div className="h-12 w-full rounded skeleton-shimmer"></div>
                </div>
            ))}
        </div>
    );
}
