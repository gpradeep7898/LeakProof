'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Page, Layout, Button } from '@shopify/polaris'
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, RefreshCw,
  Zap, ChevronRight, DollarSign, Target, BarChart3,
  ArrowUpRight, ArrowDownRight, Shield, Lightbulb
} from 'lucide-react'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

// ─── Types ───────────────────────────────────────────────────────────────────
type ProfitSummary = {
  currentMonth: {
    revenue: number; netProfit: number; grossProfit: number
    orderCount: number; avgMarginPct: number; profitChangePct: number
  }
  waterfall: Array<{ label: string; value: number; type: 'positive' | 'negative' | 'total' }>
  customers: {
    total: number; vip: number; atRisk: number; lapsed: number
    avgLtv: number; ltvCacRatio: number; repeatRate: number
  }
  leaks: { total: number; totalMonthlyLoss: number; criticalCount: number }
  founderInsight: string
}

type Leak = {
  id: string; type: string; title: string; description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  estimatedMonthlyLoss: number; confidenceScore: number
  affectedCustomersCount: number; recommendedAction: Record<string, unknown>
  status: string
}

type Benchmark = {
  groupKey?: string
  benchmark?: { industryCategory?: string; revenueRange?: string }
  metrics: {
    repeatCustomerRate: number; avgOrderValue: number
    grossMarginPct: number; netProfitMarginPct: number; ltvCacRatio: number
  }
  merchantMetrics: {
    repeatCustomerRate: number; avgOrderValue: number
    grossMarginPct: number; netProfitMarginPct: number; ltvCacRatio: number
  } | null
  vsMedian: Record<string, number>
  hasData: boolean
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function ProfitHero({ summary, loading }: { summary: ProfitSummary | null; loading: boolean }) {
  if (loading) return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-8 border border-gray-700 h-48 animate-pulse" />
  )

  const profit = summary?.currentMonth.netProfit ?? 0
  const change = summary?.currentMonth.profitChangePct ?? 0
  const isUp = change >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 rounded-3xl p-8 border border-gray-700/50 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-80 h-80 bg-teal/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-2">True Profit This Month</p>
        <div className="flex items-end gap-4 mb-3">
          <h2 className={`text-6xl font-black ${profit >= 0 ? 'text-white' : 'text-red-400'}`}>
            {profit < 0 ? '-' : ''}${Math.abs(Math.round(profit)).toLocaleString()}
          </h2>
          <div className={`flex items-center gap-1 mb-2 px-3 py-1 rounded-full text-sm font-semibold ${isUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
            {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {Math.abs(change).toFixed(1)}% vs last month
          </div>
        </div>

        {summary?.founderInsight && (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-200 text-sm font-medium leading-relaxed">{summary.founderInsight}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function MetricCard({ label, value, benchmark, unit = '', icon: Icon, positive, loading }: {
  label: string; value: number | null; benchmark: number | null
  unit?: string; icon: React.ElementType; positive?: boolean; loading?: boolean
}) {
  if (loading) return <div className="bg-white rounded-2xl p-6 border border-gray-100 h-32 animate-pulse" />

  const diff = value !== null && benchmark !== null ? ((value - benchmark) / benchmark) * 100 : null
  const isGood = diff !== null ? (positive ? diff >= 0 : diff <= 0) : null

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 20px 40px -12px rgba(14,165,164,0.15)' }}
      className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-teal/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-teal" />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-3xl font-black text-gray-900 mb-2">
        {unit === '$' && '$'}{value !== null ? (unit === '$' ? Math.round(value).toLocaleString() : value.toFixed(1)) : '—'}{unit !== '$' && unit}
      </p>
      {benchmark !== null && (
        <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg w-fit ${isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}>
          {isGood ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs median` : 'vs category median'}
        </div>
      )}
      {benchmark !== null && (
        <p className="text-xs text-gray-400 mt-1">Category median: {unit === '$' ? '$' : ''}{benchmark}{unit !== '$' ? unit : ''}</p>
      )}
    </motion.div>
  )
}

function WaterfallChart({ data, loading }: { data: Array<{ label: string; value: number; type: string }> | undefined; loading: boolean }) {
  if (loading) return <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
  if (!data || data.length === 0) return null

  const revenue = data.find((d) => d.label === 'Revenue')?.value || 0
  const maxAbs = revenue

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const width = maxAbs > 0 ? Math.abs(item.value) / maxAbs * 100 : 0
        const isNegative = item.value < 0
        const isTotal = item.type === 'total'

        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-28 text-right flex-shrink-0">{item.label}</span>
            <div className="flex-1 h-8 bg-gray-50 rounded-lg overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className={`h-full rounded-lg ${isTotal ? 'bg-teal' : isNegative ? 'bg-red-400/70' : 'bg-emerald-400/80'}`}
              />
            </div>
            <span className={`text-sm font-bold w-24 text-right flex-shrink-0 ${isTotal ? 'text-teal' : isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
              {isNegative ? '-' : '+'}${Math.abs(Math.round(item.value)).toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const SEVERITY_STYLES = {
  critical: 'bg-red-500/10 border-red-500/30 text-red-600',
  high: 'bg-orange-500/10 border-orange-500/30 text-orange-600',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
  low: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
}

function LeakPreviewCard({ leak, onApprove }: { leak: Leak; onApprove: (id: string) => void }) {
  const authedFetch = useAuthenticatedFetch()
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)

  const handleApprove = async () => {
    setApproving(true)
    try {
      const r = await authedFetch('/api/v1/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: leak.id }),
      })
      if (r.ok) {
        setApproved(true)
        onApprove(leak.id)
      }
    } finally {
      setApproving(false)
    }
  }

  const action = leak.recommendedAction as { title?: string; description?: string; risk_level?: string }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 transition-all ${SEVERITY_STYLES[leak.severity] || SEVERITY_STYLES.medium}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${SEVERITY_STYLES[leak.severity]}`}>
            {leak.severity}
          </span>
          <h3 className="font-bold text-gray-900 mt-2 leading-snug">{leak.title}</h3>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">IMPACT</p>
          <p className="text-xl font-black text-red-600">${Math.round(leak.estimatedMonthlyLoss).toLocaleString()}<span className="text-xs font-medium">/mo</span></p>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{leak.description}</p>

      {action?.title && (
        <div className="bg-white/80 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-1">FIX: {action.title}</p>
          <p className="text-xs text-gray-600 line-clamp-2">{action.description}</p>
        </div>
      )}

      {approved ? (
        <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
          <Shield className="w-4 h-4" /> Fix approved &amp; executing
        </div>
      ) : (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {approving ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Executing…</>
          ) : (
            <><Zap className="w-4 h-4" /> Approve &amp; Fix Now</>
          )}
        </button>
      )}
    </motion.div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ProfitDashboard() {
  const authedFetch = useAuthenticatedFetch()
  const [summary, setSummary] = useState<ProfitSummary | null>(null)
  const [leaks, setLeaks] = useState<Leak[]>([])
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadData = useCallback(async () => {
    try {
      const [profitRes, leaksRes, benchRes] = await Promise.all([
        authedFetch('/api/v1/profit/summary'),
        authedFetch('/api/v1/leaks?limit=3'),
        authedFetch('/api/v1/benchmarks/me'),
      ])

      const [profitData, leaksData, benchData] = await Promise.all([
        profitRes.json(),
        leaksRes.json(),
        benchRes.json(),
      ])

      if (profitRes.ok && !profitData.error) setSummary(profitData)
      setLeaks(Array.isArray(leaksData?.leaks) ? leaksData.leaks : [])
      if (benchRes.ok && !benchData.error) setBenchmark(benchData)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleScan = async () => {
    setScanning(true)
    try {
      await authedFetch('/api/v1/leaks', { method: 'POST' })
      await loadData()
    } finally {
      setScanning(false)
    }
  }

  const bm = benchmark?.merchantMetrics
  const bmMedian = benchmark?.metrics

  return (
    <Page
      title="Profit Operating System"
      subtitle="Auto-refreshes every 60s"
      primaryAction={{
        content: scanning ? 'Scanning…' : 'Scan for Leaks',
        onAction: handleScan,
        loading: scanning,
      }}
    >
      <Layout>
        <Layout.Section>
          <div className="space-y-8">
            {/* Profit Hero */}
            <ProfitHero summary={summary} loading={loading} />

            {/* Key Metrics vs Benchmarks */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-teal" /> Key Metrics vs. Category
                </h2>
                {bmMedian && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    Benchmarked against {benchmark?.groupKey?.split('_')[0] || 'general'} DTC median
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Repeat Rate" value={bm?.repeatCustomerRate ?? null} benchmark={bmMedian?.repeatCustomerRate ?? null} unit="%" icon={RefreshCw} positive loading={loading} />
                <MetricCard label="Avg Order Value" value={bm?.avgOrderValue ?? null} benchmark={bmMedian?.avgOrderValue ?? null} unit="$" icon={DollarSign} positive loading={loading} />
                <MetricCard label="Gross Margin" value={bm?.grossMarginPct ?? null} benchmark={bmMedian?.grossMarginPct ?? null} unit="%" icon={TrendingUp} positive loading={loading} />
                <MetricCard label="LTV:CAC Ratio" value={bm?.ltvCacRatio ?? null} benchmark={bmMedian?.ltvCacRatio ?? null} unit=":1" icon={Target} positive loading={loading} />
              </div>
            </motion.div>

            {/* Customer Segments Quick Stats */}
            {!loading && summary !== null && (summary.customers.total || 0) > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Customers', value: summary.customers.total ?? 0, icon: Users },
                    { label: 'VIP Customers', value: summary.customers.vip ?? 0, icon: Shield },
                    { label: 'At Risk', value: summary.customers.atRisk ?? 0, icon: AlertTriangle },
                    { label: 'Lapsed', value: summary.customers.lapsed ?? 0, icon: TrendingDown },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100">
                        <stat.icon className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-black text-gray-900">{stat.value.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Top Priority Leaks */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" /> Top Priority Leaks
                  {summary && summary.leaks.totalMonthlyLoss > 0 && (
                    <span className="px-3 py-1 bg-red-50 text-red-600 text-sm font-bold rounded-full">
                      ${Math.round(summary.leaks.totalMonthlyLoss).toLocaleString()}/mo total
                    </span>
                  )}
                </h2>
                <Link href="/app/leaks" className="text-sm text-teal font-semibold hover:underline flex items-center gap-1">
                  View All Leaks <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {loading ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
              ) : leaks.length === 0 ? (
                <div className="bg-gradient-to-br from-teal/5 to-emerald-50 rounded-2xl p-12 border border-teal/20 text-center">
                  <Shield className="w-12 h-12 text-teal mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No Active Leaks Detected</h3>
                  <p className="text-gray-600 mb-4">Upload your Shopify data or connect your store to start scanning.</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={handleScan} className="px-4 py-2 bg-teal text-white rounded-xl text-sm font-semibold hover:bg-teal-600">
                      Run Scan
                    </button>
                    <Link href="/app/connect" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">
                      Connect Data
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-3 gap-4">
                  {leaks.map((leak) => (
                    <LeakPreviewCard key={leak.id} leak={leak} onApprove={() => loadData()} />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Profit Waterfall */}
            {!loading && summary?.waterfall && summary.waterfall.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-teal" /> Profit Breakdown — This Month
                </h2>
                <WaterfallChart data={summary.waterfall} loading={false} />
              </motion.div>
            )}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
