'use client'

import { useEffect, useState } from 'react'

type Leak = {
  id: string
  type: string
  description: string
  estimatedMonthlyLoss: number
  confidenceScore: number
  confidenceExplanation: string
  recommendedAction: string
  priorityRank: number
  affectedCount: number
}

export default function RevenueLeakMap() {
  const [data, setData] = useState<{ leaks: Leak[]; totalAtRisk: number; totalLeaks: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaks')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ leaks: [], totalAtRisk: 0, totalLeaks: 0 }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-64 bg-gray-200 rounded-xl" />

  const leaks = data?.leaks || []
  const totalAtRisk = data?.totalAtRisk || 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Revenue Leak Map</h1>
      <p className="text-gray-600 mb-6">Ranked by dollar impact. Focus on the top 3.</p>

      {leaks.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
          <p className="text-gray-500 mb-4">No revenue leaks detected.</p>
          <p className="text-sm text-gray-400">Upload your CSV data to identify where money is slipping through the cracks.</p>
          <a href="/app/connect" className="inline-block mt-4 text-teal font-medium hover:underline">
            Connect Data →
          </a>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-sm text-gray-500">Total Leaks Found</p>
              <p className="text-2xl font-bold text-gray-900">{leaks.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-sm text-gray-500">Total at Risk</p>
              <p className="text-2xl font-bold text-red-600">${Math.round(totalAtRisk).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-sm text-gray-500">% of Revenue</p>
              <p className="text-2xl font-bold text-amber-600">~10%</p>
            </div>
          </div>

          <h2 className="font-bold text-gray-900 mb-4">Leaks (Highest Impact First)</h2>
          <div className="space-y-4">
            {leaks.map((leak, i) => (
              <div
                key={leak.id}
                className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-smooth"
              >
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-700 rounded text-sm font-medium">
                        #{leak.priorityRank}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-700 rounded text-xs">
                        {Math.round(leak.confidenceScore)}% Confidence
                      </span>
                      <span className="text-sm text-gray-500">{leak.affectedCount} customers affected</span>
                      <span className="text-sm text-green-600">✓ Actionable</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{leak.description.split('.')[0]}</h3>
                    <p className="text-gray-600 text-sm">{leak.description}</p>
                    <p className="text-sm text-gray-500 mt-2">{leak.recommendedAction}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">IMPACT</p>
                    <p className="text-2xl font-bold text-red-600">${Math.round(leak.estimatedMonthlyLoss).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
