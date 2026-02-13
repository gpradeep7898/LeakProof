'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { motion } from 'framer-motion'

type Action = {
  id: string
  description: string
  what: string
  why: string
  nextStep: string
  potentialGain: number
  confidenceScore: number
  status: string
  difficulty: string
}

export default function ActionEngine() {
  const [data, setData] = useState<{ actions: Action[]; summary: { todo: number; inProgress: number; completed: number } } | null>(null)
  const [loading, setLoading] = useState(true)

  const updateStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/actions/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to update')
      const res = await fetch('/api/actions')
      const data = await res.json()
      setData(data)
      toast.success(status === 'completed' ? 'Action completed!' : 'Status updated')
    } catch {
      toast.error('Failed to update status')
    }
  }

  useEffect(() => {
    fetch('/api/actions')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ actions: [], summary: { todo: 0, inProgress: 0, completed: 0 } }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  const actions = data?.actions || []
  const todo = data?.summary?.todo ?? 0
  const inProgress = data?.summary?.inProgress ?? 0
  const completed = data?.summary?.completed ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Action Engine</h1>
        <p className="text-gray-600">Your revenue recovery roadmap. Every insight includes a recommended fix.</p>
      </div>

      {actions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center">
          <p className="text-gray-500 mb-4">No actions yet.</p>
          <p className="text-sm text-gray-400">Upload your CSV to get prioritized recommendations.</p>
          <a href="/app/connect" className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-teal text-white rounded-xl font-medium hover:bg-teal-600">
            Connect Data →
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-3xl font-bold text-gray-900">{todo}</p>
              <p className="text-sm text-gray-500">To Do</p>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-3xl font-bold text-gray-900">{inProgress}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-3xl font-bold text-teal">{completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-3xl font-bold text-green-600">$0</p>
              <p className="text-sm text-gray-500">Recovered</p>
            </motion.div>
          </div>

          <p className="text-sm text-gray-500">Expected impact visible in ~14–30 days.</p>

          <div className="space-y-4">
            {actions.map((a) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-6 border border-gray-100 flex items-start justify-between gap-4 hover:border-teal/20 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={a.status === 'completed'}
                    onChange={() => updateStatus(a.id, a.status === 'completed' ? 'todo' : 'completed')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{a.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${a.difficulty === 'Quick Win' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.difficulty}
                      </span>
                      <span className="text-xs text-gray-500">{a.status}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">POTENTIAL GAIN</p>
                  <p className="text-lg font-bold text-teal">${Math.round(a.potentialGain).toLocaleString()}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
