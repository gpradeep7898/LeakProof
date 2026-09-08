'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'react-hot-toast'
import { Page, Layout } from '@shopify/polaris'
import {
  AlertTriangle, CheckCircle2, Clock, Filter, Zap, RefreshCw,
  ArrowUpDown, RotateCcw, ChevronDown, ChevronUp,
  Play, XCircle, Shield,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
type Action = {
  id: string
  action_type: string
  title: string
  description: string
  risk_level: 'low' | 'medium' | 'high'
  reversible: boolean
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected'
  requires_approval: boolean
  expected_impact: number
  actual_impact: number
  baseline_value: number
  variance: number
  configuration: Record<string, unknown>
  undo_data: Record<string, unknown> | null
  approved_at: string | null
  executed_at: string | null
  measurement_date: string | null
  leak_title: string
  leak_type: string
  leak_severity: string
  created_at: string
}

const STATUS_CONFIG = {
  pending: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  executing: { label: 'Executing…', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500 animate-pulse' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  rejected: { label: 'Rejected', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
}

const RISK_CONFIG = {
  low: { label: 'Low Risk', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  medium: { label: 'Medium Risk', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  high: { label: 'High Risk', color: 'text-red-700 bg-red-50 border-red-200' },
}

// ─── Action Card ─────────────────────────────────────────────────────────────
function ActionCard({ action, onUpdate }: { action: Action; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const statusCfg = STATUS_CONFIG[action.status] || STATUS_CONFIG.pending
  const riskCfg = RISK_CONFIG[action.risk_level] || RISK_CONFIG.medium

  const handleApprove = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message || 'Action executed!')
        onUpdate()
      } else {
        toast.error(data.message || data.error || 'Execution failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await fetch(`/api/v1/actions/${action.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      toast('Action rejected')
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async () => {
    setLoading(true)
    try {
      await fetch(`/api/v1/actions/${action.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      })
      toast.success('Action marked for reversal')
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const variance = action.variance || 0
  const isOutperforming = variance >= 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${riskCfg.color}`}>
                {riskCfg.label}
              </span>
              {action.reversible && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reversible
                </span>
              )}
            </div>

            <h3 className="font-bold text-gray-900 text-base leading-snug mb-1">{action.title}</h3>
            {action.leak_title && (
              <p className="text-xs text-gray-500 mb-2">
                From leak: <span className="font-medium text-gray-700">{action.leak_title}</span>
              </p>
            )}
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{action.description}</p>
          </div>

          <div className="text-right shrink-0 min-w-[100px]">
            <p className="text-xs text-gray-500 font-medium">IMPACT</p>
            <p className="text-2xl font-black text-teal">${Math.round(action.expected_impact).toLocaleString()}</p>
            <p className="text-xs text-gray-400">/month expected</p>

            {action.actual_impact > 0 && (
              <div className={`mt-2 text-xs font-semibold ${isOutperforming ? 'text-emerald-600' : 'text-red-600'}`}>
                ${Math.round(action.actual_impact).toLocaleString()} actual
                {variance !== 0 && <span className="ml-1">({variance > 0 ? '+' : ''}{Math.round(variance)})</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {action.status === 'pending' && (
            <>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Approve &amp; Execute
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 disabled:opacity-50 transition-all"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}

          {action.status === 'executing' && (
            <div className="flex-1 py-2.5 bg-purple-50 text-purple-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Executing…
            </div>
          )}

          {action.status === 'completed' && (
            <>
              <div className="flex-1 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Completed
              </div>
              {action.reversible && action.undo_data && (
                <button
                  onClick={handleUndo}
                  disabled={loading}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                  title="Undo this action"
                >
                  <RotateCcw className="w-4 h-4" /> Undo
                </button>
              )}
            </>
          )}

          {action.status === 'failed' && (
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl font-semibold text-sm hover:bg-red-100 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-all"
            title="Show details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100"
          >
            <div className="px-6 py-4 bg-gray-50/60 space-y-3 text-sm">
              {action.created_at && (
                <div className="flex gap-3 text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium">Created</p>
                    <p className="text-gray-500">{new Date(action.created_at).toLocaleString()}</p>
                  </div>
                </div>
              )}
              {action.executed_at && (
                <div className="flex gap-3 text-gray-600">
                  <Play className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium">Executed</p>
                    <p className="text-gray-500">{new Date(action.executed_at).toLocaleString()}</p>
                  </div>
                </div>
              )}
              {action.measurement_date && (
                <div className="flex gap-3 text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Outcome Measured</p>
                    <p className="text-gray-500">
                      Actual: ${Math.round(action.actual_impact).toLocaleString()}/mo vs ${Math.round(action.expected_impact).toLocaleString()}/mo expected
                      <span className={`ml-2 font-semibold ${isOutperforming ? 'text-emerald-600' : 'text-red-600'}`}>
                        ({variance > 0 ? '+' : ''}{Math.round(variance)} variance)
                      </span>
                    </p>
                  </div>
                </div>
              )}
              {action.undo_data && action.status === 'completed' && (
                <div className="p-3 bg-gray-100 rounded-xl text-xs font-mono text-gray-600 overflow-auto max-h-24">
                  {JSON.stringify(action.undo_data, null, 2)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all')
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [sortBy, setSortBy] = useState<'impact' | 'created'>('impact')
  const [bulkLoading, setBulkLoading] = useState(false)

  const loadActions = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/actions')
      const data = await res.json()
      setActions(data.actions || [])
      setSummary(data.summary || {})
    } catch {
      setActions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadActions()
  }, [loadActions])

  const filteredActions = actions
    .filter((a) => filter === 'all' || a.status === filter)
    .filter((a) => riskFilter === 'all' || a.risk_level === riskFilter)
    .sort((a, b) =>
      sortBy === 'impact' ? b.expected_impact - a.expected_impact
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  const pendingLowRisk = actions.filter((a) => a.status === 'pending' && a.risk_level === 'low')

  const handleBulkApproveLowRisk = async () => {
    setBulkLoading(true)
    let successCount = 0
    for (const action of pendingLowRisk) {
      try {
        const res = await fetch('/api/v1/actions/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId: action.id }),
        })
        const data = await res.json()
        if (data.success) successCount++
      } catch {
        // continue
      }
    }
    toast.success(`Approved & executed ${successCount} low-risk fixes!`)
    setBulkLoading(false)
    loadActions()
  }

  const totalExpectedImpact = (summary.totalExpectedImpact as number) || 0
  const totalActualImpact = (summary.totalActualImpact as number) || 0

  const secondaryActions = pendingLowRisk.length > 0 ? [{
    content: bulkLoading ? 'Approving…' : `Approve All Low-Risk (${pendingLowRisk.length})`,
    onAction: handleBulkApproveLowRisk,
    loading: bulkLoading,
  }] : undefined

  return (
    <Page
      title="Action Approval Queue"
      subtitle="Review, approve, and track profit-recovery actions. Each fix has a clear expected impact."
      secondaryActions={secondaryActions}
    >
      <Layout>
        <Layout.Section>
          <div className="space-y-6">
            {/* Summary stats */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Pending', value: summary.pending || 0 },
                { label: 'Approved', value: summary.approved || 0 },
                { label: 'Executing', value: summary.executing || 0 },
                { label: 'Completed', value: summary.completed || 0 },
                { label: 'Failed', value: summary.failed || 0 },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
                  <p className="text-2xl font-black text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                </div>
              ))}
            </motion.div>

            {/* Impact summary */}
            {totalExpectedImpact > 0 && (
              <div className="bg-gradient-to-r from-teal/10 to-emerald-50 border border-teal/20 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Expected Recovery</p>
                  <p className="text-3xl font-black text-teal">${Math.round(totalExpectedImpact).toLocaleString()}<span className="text-sm font-medium text-gray-500">/mo</span></p>
                </div>
                {totalActualImpact > 0 && (
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-600">Actual Recovered</p>
                    <p className="text-3xl font-black text-emerald-600">${Math.round(totalActualImpact).toLocaleString()}<span className="text-sm font-medium text-gray-500">/mo</span></p>
                  </div>
                )}
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {(['all', 'pending', 'completed', 'failed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${filter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}

                <div className="w-px bg-gray-200" />

                <Filter className="w-4 h-4 text-gray-400 self-center" />
                {(['all', 'low', 'medium', 'high'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskFilter(r)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${riskFilter === r ? 'bg-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setSortBy(sortBy === 'impact' ? 'created' : 'impact')}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 flex items-center gap-1.5"
              >
                <ArrowUpDown className="w-4 h-4" /> {sortBy === 'impact' ? 'By Impact' : 'By Date'}
              </button>
            </div>

            {/* Action list */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
              </div>
            ) : filteredActions.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <Shield className="w-12 h-12 text-teal mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">No Actions Yet</h3>
                <p className="text-gray-500 mb-4">Run a leak scan to automatically generate prioritized fixes.</p>
                <button
                  onClick={async () => {
                    await fetch('/api/v1/leaks', { method: 'POST' })
                    loadActions()
                  }}
                  className="px-5 py-2.5 bg-teal text-white rounded-xl font-semibold hover:bg-teal-600 transition-all"
                >
                  Scan for Leaks
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence>
                  {filteredActions.map((action) => (
                    <ActionCard key={action.id} action={action} onUpdate={loadActions} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
