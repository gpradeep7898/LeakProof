'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight, Lightbulb, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Link from 'next/link';

function MetricCard({ label, value, benchmark, trend }: { label: string, value: string, benchmark?: number, trend?: number }) {
    const isPositive = trend && trend > 0;
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-1">{label}</div>
            <div className="text-2xl font-bold text-slate-900 mb-2">{value}</div>
            {benchmark !== undefined && (
                <div className="text-xs text-slate-400">
                    vs Benchmark: <span className={benchmark > parseFloat(value) ? 'text-red-500' : 'text-emerald-500'}>{benchmark}%</span>
                </div>
            )}
            {trend !== undefined && (
                <div className={`text-xs flex items-center gap-1 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(trend)}% vs last month
                </div>
            )}
        </div>
    );
}

import { LeakCard } from '@/components/leaks/LeakCard';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

export function ProfitReality() {
    const queryClient = useQueryClient();
    const authedFetch = useAuthenticatedFetch();
    const fetcher = (url: string) => authedFetch(url).then((res) => res.json());
    const { data: profit, isLoading: profitLoading } = useQuery({ queryKey: ['profit-summary'], queryFn: () => fetcher('/api/profit/summary') });
    const { data: leaks, isLoading: leaksLoading } = useQuery({ queryKey: ['leaks'], queryFn: () => fetcher('/api/leaks') });
    const recalc = useMutation({
        mutationFn: () => authedFetch('/api/recalculate', { method: 'POST' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Recalc failed'))),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profit-summary'] });
            queryClient.invalidateQueries({ queryKey: ['leaks'] });
            queryClient.invalidateQueries({ queryKey: ['segments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['actions'] });
            toast.success('Metrics recalculated. Refreshing data...');
        },
        onError: (e: Error) => toast.error(e.message || 'Recalculation failed'),
    });
    // Benchmarks query could go here

    if (profitLoading || leaksLoading) return <div className="p-8 text-center text-slate-400">Loading Profit OS...</div>;

    // Formatting
    const netProfit = profit?.net_profit || 0;
    const isProfitPositive = netProfit >= 0;

    // Prepare chart data
    const chartData = profit ? [
        { name: 'Net Profit', value: Number(profit.total_net_profit || 0), fill: '#10b981' },
        { name: 'COGS', value: Number(profit.total_cogs || 0), fill: '#64748b' },
        { name: 'Ad Spend', value: Number(profit.total_ads || 0), fill: '#f59e0b' },
        { name: 'Shipping', value: Number(profit.total_shipping || 0), fill: '#3b82f6' },
        { name: 'Discounts', value: Number(profit.total_discounts || 0), fill: '#ef4444' },
        { name: 'Fees/Returns', value: Number(profit.total_fees || 0) + Number(profit.total_returns || 0), fill: '#a855f7' },
    ].sort((a, b) => b.value - a.value) : [];

    return (
        <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {/* Hero Section */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <h1 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">True Profit This Month</h1>
                    <div className="flex items-baseline gap-4">
                        <div className="text-5xl sm:text-7xl font-bold tracking-tight">
                            ${netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        {profit?.trend && (
                            <div className={`text-lg font-medium px-3 py-1 rounded-full ${profit.trend > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {profit.trend > 0 ? '+' : ''}{profit.trend}%
                            </div>
                        )}
                    </div>

                    {/* Run Recalculate */}
                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={() => recalc.mutate()}
                            disabled={recalc.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={recalc.isPending ? 'animate-spin' : ''} />
                            {recalc.isPending ? 'Recalculating...' : 'Run Recalculate'}
                        </button>
                    </div>

                    {/* Founder Summary */}
                    <div className="mt-8 flex items-start gap-3 bg-white/10 p-4 rounded-lg backdrop-blur-sm max-w-2xl">
                        <Lightbulb className="text-amber-400 shrink-0 mt-0.5" size={20} />
                        <p className="text-slate-200 leading-relaxed">
                            {profit?.founder_summary || "Analyzing your margins... detecting opportunities."}
                        </p>
                    </div>
                </div>

                {/* Abstract Background Decoration */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard
                    label="Gross Margin"
                    value={`${profit?.gross_margin || 0}%`}
                // benchmark={benchmarks?.gross_margin}
                />
                <MetricCard
                    label="LTV:CAC Ratio"
                    value={(profit?.ltv_cac_ratio || 0).toFixed(1)}
                // benchmark={benchmarks?.ltv_cac_ratio}
                />
                <MetricCard
                    label="Repeat Rate"
                    value={`${profit?.repeat_rate || 0}%`}
                // trend={profit?.repeat_rate_trend}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Priority Leaks */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slate-900">Top Revenue Leaks</h2>
                        <Link href="/app/leaks" className="text-sm font-medium text-blue-600 hover:text-blue-800">View All →</Link>
                    </div>

                    {leaks && leaks.slice(0, 3).map((leak: any) => (
                        <LeakCard key={leak.id} leak={leak} />
                    ))}

                    {!leaks?.length && (
                        <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-500">
                            No critical leaks detected yet. Good job!
                        </div>
                    )}
                </div>

                {/* Profit Breakdown Chart (Placeholder for Waterfall) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                    <h2 className="text-xl font-bold text-slate-900 mb-6">Where Your Money Goes</h2>

                    {profit ? (
                        <div className="flex-1 min-h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={chartData}
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Amount']}
                                        cursor={{ fill: 'transparent' }}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                        {
                                            chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))
                                        }
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded">
                            Loading breakdown...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
