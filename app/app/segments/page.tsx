'use client'

import { useEffect, useState } from 'react'

type Segment = {
  id: string
  name: string
  customerCount: number
  totalRevenue: number
  suggestedAction: string
}

export default function CustomerSegments() {
  const [data, setData] = useState<{ segments: Segment[]; customers: Array<{ customerId: string }>; filter: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/segments?segment=${filter}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ segments: [], customers: [], filter }))
      .finally(() => setLoading(false))
  }, [filter])

  const segments = data?.segments || []
  const customers = data?.customers || []

  const icon: Record<string, string> = {
    VIP: '👑',
    Loyal: '❤️',
    'At Risk': '⚠️',
    New: '✨',
    Churned: '❌',
  }

  if (loading) return <div className="animate-pulse h-64 bg-gray-200 rounded-xl" />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Customer Segments</h1>
      <p className="text-gray-600 mb-6">Understand who&apos;s buying and who&apos;s about to leave. (Top 50 shown)</p>

      <div className="mb-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">Customer identities are anonymized by default.</div>

      {segments.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border text-center">
          <p className="text-gray-500 mb-4">No segments yet.</p>
          <a href="/app/connect" className="text-teal font-medium hover:underline">Upload CSV to segment customers →</a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4 mb-6">
            {segments.map((s) => (
              <div key={s.id} className="bg-white rounded-lg p-4 border">
                <p className="text-2xl mb-2">{icon[s.name] || '•'}</p>
                <p className="font-bold text-gray-900">{s.customerCount}</p>
                <p className="text-sm text-gray-500">Total Revenue ${Math.round(s.totalRevenue).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-teal text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              All
            </button>
            {segments.map((s) => (
              <button
                key={s.id}
                onClick={() => setFilter(s.name)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === s.name ? 'bg-teal text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Segment</th>
                  <th className="text-left p-3">Orders</th>
                  <th className="text-left p-3">Total Spent</th>
                  <th className="text-left p-3">Last Order</th>
                </tr>
              </thead>
              <tbody>
                {filter === 'all' ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-500">Select a segment to view customers.</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-500">No customers in this segment.</td>
                  </tr>
                ) : (
                  customers.map((c: { customerId: string; orders?: number; totalSpent?: number; lastOrder?: string }) => (
                    <tr key={c.customerId} className="border-t">
                      <td className="p-3 font-mono text-gray-700">{c.customerId}</td>
                      <td className="p-3">{filter}</td>
                      <td className="p-3">{c.orders ?? '—'}</td>
                      <td className="p-3">${c.totalSpent != null ? Math.round(c.totalSpent).toLocaleString() : '—'}</td>
                      <td className="p-3">{c.lastOrder || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
