import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET() {
  try {
    const storeId = await getDefaultStoreId()
    const rows = await query<{
      product_id: string
      product_name: string
      category: string
      price: string
      total_sold: string
      revenue: string
      margin_pct: string
      repeat_rate: string
      suitability_score: string
    }>(
      `SELECT p.product_id, p.product_name, p.category, p.price,
              COALESCE(pi.total_sold, 0) AS total_sold,
              COALESCE(pi.revenue, 0) AS revenue,
              COALESCE(pi.margin_pct, 0) AS margin_pct,
              COALESCE(pi.repeat_rate, 0) AS repeat_rate,
              COALESCE(pi.suitability_score, 0) AS suitability_score
       FROM products p
       LEFT JOIN product_intelligence pi ON pi.product_id = p.product_id AND pi.store_id = p.store_id
       WHERE p.store_id = $1
       ORDER BY COALESCE(pi.revenue, 0) DESC`,
      [storeId]
    )

    const products = rows.map((r) => ({
      id: r.product_id,
      name: r.product_name || r.product_id,
      category: r.category || 'General',
      price: parseFloat(r.price || '0'),
      totalSold: parseInt(r.total_sold || '0'),
      revenue: parseFloat(r.revenue || '0'),
      marginPct: parseFloat(r.margin_pct || '0'),
      repeatRate: parseFloat(r.repeat_rate || '0'),
      suitabilityScore: parseInt(r.suitability_score || '0'),
    }))

    return NextResponse.json({ products, total: products.length })
  } catch (err) {
    console.error('Product intelligence error:', err)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }
}
