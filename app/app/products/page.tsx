'use client'

import { useEffect, useState } from 'react'

type Product = {
  id: string
  name: string
  category: string
  price: number
  totalSold: number
  revenue: number
  marginPct: number
  repeatRate: number
  suitabilityScore: number
}

export default function ProductCatalog() {
  const [data, setData] = useState<{ products: Product[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/products/intelligence')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ products: [], total: 0 }))
      .finally(() => setLoading(false))
  }, [])

  const products = data?.products || []

  if (loading) return <div className="animate-pulse h-64 bg-gray-200 rounded-xl" />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Product Catalog</h1>
      <p className="text-gray-600 mb-6">Explore all {data?.total || 0} products in your inventory</p>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border text-center">
          <p className="text-gray-500 mb-4">No products yet.</p>
          <a href="/app/connect" className="text-teal font-medium hover:underline">Upload CSV to load products →</a>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl p-6 border shadow-sm">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-teal/20 flex items-center justify-center text-teal">□</div>
                <div>
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  <p className="text-sm text-gray-500">{p.category}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Price:</span> ${p.price.toFixed(0)}</p>
                <p><span className="text-gray-500">Total Sold:</span> {p.totalSold} units</p>
                <p><span className="text-gray-500">Revenue:</span> <span className="text-teal font-medium">${Math.round(p.revenue).toLocaleString()}</span></p>
                <p><span className="text-gray-500">Margin:</span> <span className="text-green-600">{p.marginPct.toFixed(0)}%</span></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
