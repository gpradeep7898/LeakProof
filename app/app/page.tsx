'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle, Users, RefreshCw, ChevronRight, Zap } from 'lucide-react'

type Metrics = {
  repeatRate: number
  avgReorderDays: number
  revenueAtRisk: number
  totalRevenue: number
  repeatRevenue: number
  oneTimeRevenue: number
  founderSummary: string
}

type Action = {
  id: string
  description: string
  potentialGain: number
  why?: string
  nextStep?: string
}

export default function MoneySnapshot() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/metrics/summary').then((r) => r.json()),
      fetch('/api/actions').then((r) => r.json()),
    ])
      .then(([m, a]) => {
        if (m.error) throw new Error(m.error)
        setMetrics(m)
        setActions(a.actions || [])
      })
      .catch((err) => setError(err.message || 'Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  const hasData = metrics && (metrics.totalRevenue > 0 || metrics.revenueAtRisk > 0)
  const founderSummary = metrics?.founderSummary || 'Connect your data to see your revenue summary.'

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Money Snapshot</h1>
        <p className="text-gray-600 max-w-2xl">
          Where money leaks, why it happens, and what to fix first. Insight-first—no spreadsheets.
        </p>
      </motion.div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!hasData ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-2xl p-12 border border-gray-200 shadow-sm text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-teal/10 flex items-center justify-center mx-auto mb-6">
            <TrendingUp className="w-8 h-8 text-teal" />
          </div>
          <p className="text-gray-600 mb-4 text-lg">{founderSummary}</p>
          <Link
            href="/app/connect"
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal text-white rounded-xl font-medium hover:bg-teal-600 transition-colors"
          >
            Connect Data to See Insights <ChevronRight className="w-5 h-5" />
          </Link>
        </motion.div>
      ) : (
        <>
          {/* Founder Summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-5 bg-gradient-to-r from-teal/10 to-amber-500/10 border border-teal/20 rounded-2xl"
          >
            <p className="text-gray-800 font-medium">{founderSummary}</p>
          </motion.div>

          {/* Metric cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid md:grid-cols-3 gap-6"
          >
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 12px 40px -12px rgba(14, 165, 164, 0.25)' }}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-teal" />
                <span className="text-sm font-medium text-gray-500">Repeat Customer %</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{metrics?.repeatRate?.toFixed(1) ?? 0}%</p>
              <p className="text-sm text-gray-500 mt-1">of revenue from repeat buyers</p>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 12px 40px -12px rgba(239, 68, 68, 0.2)' }}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium text-gray-500">Revenue at Risk</span>
              </div>
              <p className="text-3xl font-bold text-red-600">${Math.round(metrics?.revenueAtRisk ?? 0).toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">lapsed high-value customers</p>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, boxShadow: '0 12px 40px -12px rgba(14, 165, 164, 0.2)' }}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-5 h-5 text-teal" />
                <span className="text-sm font-medium text-gray-500">Avg Reorder Cycle</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{Math.round(metrics?.avgReorderDays ?? 0)} days</p>
              <p className="text-sm text-gray-500 mt-1">between repeat purchases</p>
            </motion.div>
          </motion.div>

          {/* Actions / Priority list */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Priority Actions
            </h2>
            {actions.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center">
                <p className="text-gray-500 mb-4">No actions yet. Connect more data or check Revenue Leak Map.</p>
                <Link href="/app/leaks" className="text-teal font-medium hover:underline">
                  View Revenue Leak Map →
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {actions.slice(0, 6).map((card, i) => (
                  <Link key={card.id} href="/app/actions">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * i }}
                      whileHover={{ y: -4, boxShadow: '0 12px 40px -12px rgba(14, 165, 164, 0.15)' }}
                      className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-teal/30 transition-all h-full"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-700 rounded-lg text-xs font-semibold">
                          #{i + 1}
                        </span>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">POTENTIAL</p>
                          <p className="text-lg font-bold text-teal">${Math.round(card.potentialGain).toLocaleString()}</p>
                        </div>
                      </div>
                      <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{card.description}</h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{card.why || ''}</p>
                      <div className="pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                          <span>Recommendation</span>
                        </p>
                        <p className="text-sm text-gray-700 line-clamp-2">{card.nextStep || ''}</p>
                      </div>
                    </motion.div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}
