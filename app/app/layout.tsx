'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Map,
  CheckSquare,
  Users,
  Package,
  Database,
  Zap,
} from 'lucide-react'

const nav = [
  { href: '/app', label: 'Money Snapshot', icon: LayoutDashboard },
  { href: '/app/leaks', label: 'Revenue Leak Map', icon: Map },
  { href: '/app/actions', label: 'Action Engine', icon: CheckSquare },
  { href: '/app/segments', label: 'Customer Segments', icon: Users },
  { href: '/app/products', label: 'Product Catalog', icon: Package },
  { href: '/app/connect', label: 'Data Connect', icon: Database },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 bg-white/80 backdrop-blur-xl border-r border-gray-200/80 flex flex-col shadow-sm">
        <Link
          href="/app"
          className="p-4 flex items-center gap-3 border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-teal/20">
            LP
          </div>
          <span className="font-semibold text-gray-900">LeakProof</span>
        </Link>
        <nav className="flex-1 p-3">
          {nav.map((n) => {
            const isActive = path === n.href || (n.href !== '/app' && path.startsWith(n.href))
            const Icon = n.icon
            return (
              <Link key={n.href} href={n.href}>
                <motion.div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-200 ${
                    isActive
                      ? 'bg-teal text-white shadow-md shadow-teal/25'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                  <span className="font-medium text-sm">{n.label}</span>
                </motion.div>
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-teal/5 border border-teal/10">
            <span className="text-gray-700 flex items-center gap-2 text-sm font-medium">
              <Zap className="w-4 h-4 text-teal" />
              Founder Mode
            </span>
            <span className="px-2 py-0.5 bg-teal/20 text-teal rounded-md text-xs font-semibold">
              Active
            </span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
