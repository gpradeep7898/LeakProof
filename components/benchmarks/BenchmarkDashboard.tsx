'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight, Lightbulb } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function BenchmarkCard({ label, yourValue, categoryMedian, message }: any) {
    const diff = ((yourValue - categoryMedian) / categoryMedian) * 100;
    const isPositive = diff > 0;

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-1">{label}</div>
            <div className="flex items-end justify-between mb-2">
                <div className="text-3xl font-bold text-slate-900">
                    {yourValue}%
                </div>
                <div className={`text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{diff.toFixed(0)}% vs avg
                </div>
            </div>
            <div className="text-xs text-slate-400">
                Industry Avg: {categoryMedian}%
            </div>
            <div className="mt-3 text-xs bg-slate-50 p-2 rounded text-slate-600">
                {message}
            </div>
        </div>
    );
}

export function BenchmarkDashboard() {
    const { data: comparison, isLoading } = useQuery({ queryKey: ['benchmarks'], queryFn: () => fetcher('/api/benchmarks') });

    if (isLoading) return <div className="p-8 text-center text-slate-400">Comparing your store...</div>;
    if (!comparison) return <div className="p-8 text-center text-slate-400">No benchmark data available.</div>;

    return (
        <div className="benchmark-dashboard space-y-8">

            <div className="header">
                <h1 className="text-2xl font-bold text-slate-900">How You Compare</h1>
                <p className="text-slate-500">vs. stores like yours (Same Industry, Same Revenue)</p>
            </div>

            <div className="metrics-grid grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(comparison.comparison).map(([key, metric]: [string, any]) => (
                    <BenchmarkCard
                        key={key}
                        label={key.replace('_', ' ').toUpperCase()}
                        yourValue={metric.value}
                        categoryMedian={metric.benchmark}
                        message={metric.message}
                    />
                ))}
            </div>

            {/* Insights */}
            <div className="benchmark-insights bg-indigo-50 border border-indigo-100 p-6 rounded-xl">
                <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2 mb-4">
                    <Lightbulb className="text-indigo-600" size={20} />
                    Key Takeaways
                </h2>
                <ul className="space-y-2">
                    {comparison.insights.map((insight: string, i: number) => (
                        <li key={i} className="flex gap-2 text-indigo-800 text-sm">
                            <span>•</span> {insight}
                        </li>
                    ))}
                </ul>
            </div>

        </div>
    );
}
