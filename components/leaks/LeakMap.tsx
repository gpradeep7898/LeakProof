'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { LeakCard } from './LeakCard';

// Fetcher
const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function LeakMap() {
    const { data: leaks = [] } = useQuery({ queryKey: ['leaks'], queryFn: () => fetcher('/api/leaks') });
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('impact');

    const filteredLeaks = useMemo(() => {
        let result = [...leaks];

        if (filter !== 'all') {
            result = result.filter((l: any) => l.leak_type === filter);
        }

        if (sort === 'impact') {
            result = result.sort((a: any, b: any) => b.estimated_monthly_loss - a.estimated_monthly_loss);
        } else if (sort === 'confidence') {
            result = result.sort((a: any, b: any) => b.confidence_score - a.confidence_score);
        }

        return result;
    }, [leaks, filter, sort]);

    const totalAtRisk = filteredLeaks.reduce((sum: number, l: any) => sum + l.estimated_monthly_loss, 0);

    return (
        <div className="leak-map space-y-6">

            <div className="header flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Revenue Leak Map</h1>
                    <p className="text-slate-500">Prioritized by dollar impact</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-500">Total at Risk</div>
                    <div className="text-3xl font-bold text-red-600">${totalAtRisk.toLocaleString()}/mo</div>
                </div>
            </div>

            {/* Filters */}
            <div className="filters flex gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm"
                >
                    <option value="all">All Leaks</option>
                    <option value="vip_churn">Churn Leaks</option>
                    <option value="vip_discount_waste">Discount Leaks</option>
                    <option value="low_margin_bestsellers">Product Leaks</option>
                </select>

                <select
                    value={sort}
                    onChange={e => setSort(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm"
                >
                    <option value="impact">Sort by Impact</option>
                    <option value="confidence">Sort by Confidence</option>
                </select>
            </div>

            {/* Visual Map */}
            <div className="leak-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLeaks.map((leak: any) => (
                    <LeakCard key={leak.id} leak={leak} />
                ))}
            </div>

            {filteredLeaks.length === 0 && (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded border border-dashed">
                    No leaks found matching your criteria.
                </div>
            )}

        </div>
    );
}
