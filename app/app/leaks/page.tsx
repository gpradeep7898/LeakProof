'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Page, Layout, Button } from '@shopify/polaris'
import { RefreshCw, Filter, Search, AlertTriangle, Zap } from 'lucide-react'
import LeakCard, { type Leak } from '@/app/components/leaks/LeakCard'

export default function LeaksPage() {
  const [leaks, setLeaks] = useState<Leak[]>([])
  const [totalAtRisk, setTotalAtRisk] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all')
  const [search, setSearch] = useState('')

  const loadLeaks = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/leaks?limit=50')
      const data = await res.json()
      setLeaks(data.leaks || [])
      setTotalAtRisk(data.totalAtRisk || 0)
    } catch {
      setLeaks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLeaks()
  }, [loadLeaks])

  const handleScan = async () => {
    setScanning(true)
    try {
      await fetch('/api/v1/leaks', { method: 'POST' })
      await loadLeaks()
    } finally {
      setScanning(false)
    }
  }

  const filteredLeaks = leaks
    .filter((l) => severityFilter === 'all' || l.severity === severityFilter)
    .filter((l) =>
      search.trim() === '' ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.description.toLowerCase().includes(search.toLowerCase())
    )

  const criticalCount = leaks.filter((l) => l.severity === 'critical').length
  const highCount = leaks.filter((l) => l.severity === 'high').length

  return (
    <Page
      title="Revenue Leak Map"
      subtitle="Every profit drain, ranked by monthly impact. Click to fix."
      primaryAction={{
        content: scanning ? 'Scanning…' : 'Re-scan Now',
        onAction: handleScan,
        loading: scanning,
      }}
    >
      <Layout>
        <Layout.Section>
          <div className="space-y-6">
            {/* Summary bar */}
            {!loading && leaks.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl p-5 flex flex-wrap gap-6"
              >
                <div>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Total at Risk</p>
                  <p className="text-3xl font-black text-red-600">${Math.round(totalAtRisk).toLocaleString()}<span className="text-sm font-medium text-red-400">/mo</span></p>
                </div>
                {criticalCount > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Critical Leaks</p>
                    <p className="text-3xl font-black text-red-700">{criticalCount}</p>
                  </div>
                )}
                {highCount > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">High Priority</p>
                    <p className="text-3xl font-black text-orange-700">{highCount}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Leaks</p>
                  <p className="text-3xl font-black text-gray-700">{leaks.length}</p>
                </div>
              </motion.div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leaks…"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent bg-white"
                />
              </div>

              <div className="flex gap-2">
                <Filter className="w-4 h-4 text-gray-400 self-center" />
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${severityFilter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Leak List */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-72 bg-gray-100 rounded-2xl animate-pulse" />)}
              </div>
            ) : filteredLeaks.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-700 mb-2">
                  {search || severityFilter !== 'all' ? 'No matching leaks' : 'No Leaks Detected'}
                </h3>
                <p className="text-gray-500 mb-4">
                  {search || severityFilter !== 'all'
                    ? 'Try a different search or filter'
                    : 'Your data is either clean or you need to upload order history first.'}
                </p>
                {!search && severityFilter === 'all' && (
                  <button onClick={handleScan} className="px-5 py-2.5 bg-teal text-white rounded-xl font-semibold hover:bg-teal-600 transition-all">
                    Run Scan
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLeaks.map((leak) => (
                  <LeakCard key={leak.id} leak={leak} onApproved={() => loadLeaks()} />
                ))}
              </div>
            )}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
