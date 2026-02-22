'use client'

import { ProfitReality } from '@/components/dashboard/ProfitReality'
import { motion } from 'framer-motion'

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 px-4 sm:px-6 lg:px-8 pt-4">Profit Operating System</h1>
        <p className="text-gray-600 max-w-2xl px-4 sm:px-6 lg:px-8">
          Real-time profit tracking and leak detection.
        </p>
      </motion.div>

      <ProfitReality />
    </div>
  )
}
