'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    AlertTriangle, ChevronDown, ChevronUp, Shield, RefreshCw, Zap,
    Clock, RotateCcw, CheckCircle2, XCircle, Info, TrendingDown
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
export type Leak = {
    id: string
    type: string
    title: string
    description: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    estimatedMonthlyLoss: number
    confidenceScore: number
    affectedCustomersCount: number
    affectedOrdersCount: number
    dataQuality: 'high' | 'medium' | 'low'
    status: string
    priorityRank: number
    recommendedAction: {
        type: string
        title: string
        description: string
        risk_level: 'low' | 'medium' | 'high'
        expected_outcome: string
        reversible: boolean
        timeline: string
        explanation?: {
            what: string
            why: string
            impact: string
            trend: string
            evidence: string
        }
    }
    detectedAt?: string
}

type ApproveState = 'idle' | 'loading' | 'success' | 'error'

// ─── Severity Config ──────────────────────────────────────────────────────────
const SEVERITY = {
    critical: {
        badge: 'bg-red-500 text-white',
        border: 'border-red-200',
        card: 'bg-red-50/50',
        icon: 'text-red-500',
        glow: 'shadow-red-100',
    },
    high: {
        badge: 'bg-orange-500 text-white',
        border: 'border-orange-200',
        card: 'bg-orange-50/40',
        icon: 'text-orange-500',
        glow: 'shadow-orange-100',
    },
    medium: {
        badge: 'bg-amber-500 text-white',
        border: 'border-amber-200',
        card: 'bg-amber-50/30',
        icon: 'text-amber-500',
        glow: 'shadow-amber-100',
    },
    low: {
        badge: 'bg-blue-500 text-white',
        border: 'border-blue-200',
        card: 'bg-blue-50/30',
        icon: 'text-blue-500',
        glow: 'shadow-blue-100',
    },
}

const RISK = {
    low: { label: 'Low Risk', color: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-500' },
    medium: { label: 'Medium Risk', color: 'text-amber-600 bg-amber-50', dot: 'bg-amber-500' },
    high: { label: 'High Risk', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' },
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LeakCard({ leak, onApproved }: { leak: Leak; onApproved?: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false)
    const [approveState, setApproveState] = useState<ApproveState>('idle')
    const [approveMessage, setApproveMessage] = useState('')

    const s = SEVERITY[leak.severity] || SEVERITY.medium
    const action = leak.recommendedAction
    const risk = RISK[action?.risk_level || 'medium'] || RISK.medium
    const explanation = action?.explanation

    const handleApprove = async () => {
        setApproveState('loading')
        try {
            const res = await fetch('/api/v1/actions/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actionId: leak.id }),
            })
            const data = await res.json()

            if (res.ok && data.success) {
                setApproveState('success')
                setApproveMessage(data.message || 'Fix executed successfully!')
                onApproved?.(leak.id)
            } else {
                setApproveState('error')
                setApproveMessage(data.message || data.error || 'Execution failed. Retry?')
            }
        } catch {
            setApproveState('error')
            setApproveMessage('Network error. Please retry.')
        }
    }

    const handleRetry = () => {
        setApproveState('idle')
        setApproveMessage('')
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border ${s.border} ${s.card} shadow-sm hover:shadow-md ${s.glow} transition-all overflow-hidden`}
        >
            {/* ── Header ── */}
            <div className="p-6 pb-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${s.badge}`}>
                                {leak.severity}
                            </span>
                            {leak.priorityRank > 0 && (
                                <span className="text-xs text-gray-500 font-medium">
                                    #{leak.priorityRank} priority
                                </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leak.confidenceScore >= 0.8 ? 'bg-emerald-50 text-emerald-600' :
                                    leak.confidenceScore >= 0.6 ? 'bg-amber-50 text-amber-600' :
                                        'bg-gray-100 text-gray-600'
                                }`}>
                                {Math.round(leak.confidenceScore * 100)}% confidence
                            </span>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 leading-snug">{leak.title}</h3>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500 font-medium">MONTHLY IMPACT</p>
                        <p className="text-2xl font-black text-red-600">
                            ${Math.round(leak.estimatedMonthlyLoss).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">/month</p>
                    </div>
                </div>

                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{leak.description}</p>

                {/* Meta info */}
                <div className="flex gap-3 mt-3 text-xs text-gray-400">
                    {leak.affectedCustomersCount > 0 && (
                        <span>{leak.affectedCustomersCount.toLocaleString()} customers affected</span>
                    )}
                    {leak.affectedOrdersCount > 0 && (
                        <span>{leak.affectedOrdersCount.toLocaleString()} orders</span>
                    )}
                    <span className={`font-medium ${leak.dataQuality === 'high' ? 'text-emerald-500' :
                            leak.dataQuality === 'medium' ? 'text-amber-500' : 'text-gray-400'
                        }`}>
                        {leak.dataQuality} data quality
                    </span>
                </div>
            </div>

            {/* ── Action Box ── */}
            {action && (
                <div className="mx-4 mb-4 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">RECOMMENDED FIX</p>
                            <p className="font-bold text-gray-900 text-sm">{action.title}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${risk.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                        </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-3 leading-relaxed">{action.description}</p>

                    <div className="flex gap-3 text-xs text-gray-500 mb-4">
                        {action.reversible !== undefined && (
                            <span className={`flex items-center gap-1 ${action.reversible ? 'text-emerald-600' : 'text-amber-600'}`}>
                                <RotateCcw className="w-3 h-3" />
                                {action.reversible ? 'Reversible' : 'Not reversible'}
                            </span>
                        )}
                        {action.timeline && (
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {action.timeline}
                            </span>
                        )}
                    </div>

                    {/* Approve button area */}
                    <AnimatePresence mode="wait">
                        {approveState === 'idle' && (
                            <motion.button
                                key="approve"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={handleApprove}
                                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Zap className="w-4 h-4" /> Approve &amp; Fix Now
                            </motion.button>
                        )}

                        {approveState === 'loading' && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4 animate-spin" /> Executing fix…
                            </motion.div>
                        )}

                        {approveState === 'success' && (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                className="w-full py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-semibold text-sm flex items-center gap-2 px-4"
                            >
                                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                                <span>{approveMessage}</span>
                            </motion.div>
                        )}

                        {approveState === 'error' && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="space-y-2"
                            >
                                <div className="w-full py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2 px-4">
                                    <XCircle className="w-4 h-4 flex-shrink-0" />
                                    {approveMessage}
                                </div>
                                <button
                                    onClick={handleRetry}
                                    className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                                >
                                    Retry
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Expandable Explanation ── */}
            {explanation && (
                <>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full px-6 py-3 flex items-center justify-between text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50/60 transition-colors border-t border-gray-100"
                    >
                        <span className="flex items-center gap-2 font-medium">
                            <Info className="w-4 h-4" /> Why This Matters
                        </span>
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <AnimatePresence>
                        {expanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <div className="px-6 pb-6 space-y-4">
                                    {[
                                        { label: 'What\'s Happening', content: explanation.what, icon: AlertTriangle },
                                        { label: 'Why It Matters', content: explanation.why, icon: Info },
                                        { label: 'Dollar Impact', content: explanation.impact, icon: TrendingDown },
                                        { label: 'Trend', content: explanation.trend, icon: RefreshCw },
                                        { label: 'Evidence', content: explanation.evidence, icon: Shield },
                                    ].filter((item) => item.content).map((item) => (
                                        <div key={item.label} className="flex gap-3">
                                            <item.icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{item.label}</p>
                                                <p className="text-sm text-gray-700 leading-relaxed">{item.content}</p>
                                            </div>
                                        </div>
                                    ))}

                                    {action?.expected_outcome && (
                                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                            <p className="text-xs font-bold text-emerald-600 mb-1">EXPECTED OUTCOME</p>
                                            <p className="text-sm text-emerald-800">{action.expected_outcome}</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </motion.div>
    )
}
