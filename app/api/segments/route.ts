import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { query } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'

export async function GET(request: NextRequest) {
  try {
    const storeId = await getStoreFromRequest(request)
    const { searchParams } = new URL(request.url)
    const segmentFilter = searchParams.get('segment') || 'all'

    const segments = await query<{
      segment_id: string
      segment_name: string
      customer_count: string
      total_revenue: string
      suggested_action: string
    }>(
      `SELECT segment_id, segment_name, customer_count, total_revenue, suggested_action
       FROM customer_segments WHERE store_id = $1 ORDER BY total_revenue DESC`,
      [storeId]
    )

    const segmentList = segments.map((s) => ({
      id: s.segment_id,
      name: s.segment_name,
      customerCount: parseInt(s.customer_count || '0'),
      totalRevenue: parseFloat(s.total_revenue || '0'),
      suggestedAction: s.suggested_action || '',
    }))

    let customers: Array<{ customerId: string; orders: number; totalSpent: number; lastOrder: string }> = []
    if (segmentFilter !== 'all') {
      const members = await query<{ customer_id: string; total_orders: string; total_spend: string; last_order_date: string }>(
        `SELECT c.customer_id, c.total_orders, c.total_spend, c.last_order_date
         FROM customers c
         JOIN segment_members sm ON sm.customer_id = c.customer_id
         JOIN customer_segments cs ON cs.segment_id = sm.segment_id AND cs.store_id = c.store_id
         WHERE cs.store_id = $1 AND cs.segment_name = $2
         LIMIT 50`,
        [storeId, segmentFilter]
      )
      customers = members.map((m) => ({
        customerId: m.customer_id,
        orders: parseInt(m.total_orders || '0'),
        totalSpent: parseFloat(m.total_spend || '0'),
        lastOrder: m.last_order_date || '',
      }))
    }

    return NextResponse.json({
      segments: segmentList,
      customers,
      filter: segmentFilter,
    })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('Segments error:', err)
    return NextResponse.json({ error: 'Failed to load segments' }, { status: 500 })
  }
}
