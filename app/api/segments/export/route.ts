import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { query } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

/** Export anonymized customer IDs only - no PII */
export async function GET(request: NextRequest) {
  try {
    const storeId = await getDefaultStoreId()
    const { searchParams } = new URL(request.url)
    const segmentFilter = searchParams.get('segment') || 'all'

    if (segmentFilter === 'all') {
      const all = await query<{ customer_id: string }>(
        'SELECT customer_id FROM customers WHERE store_id = $1',
        [storeId]
      )
      const customerIds = all.map((c) => `Customer #${c.customer_id}`)
      return NextResponse.json({ customerIds, count: customerIds.length })
    }

    const members = await query<{ customer_id: string }>(
      `SELECT c.customer_id FROM customers c
       JOIN segment_members sm ON sm.customer_id = c.customer_id
       JOIN customer_segments cs ON cs.segment_id = sm.segment_id
       WHERE cs.store_id = $1 AND cs.segment_name = $2`,
      [storeId, segmentFilter]
    )

    const customerIds = members.map((m) => `Customer #${m.customer_id}`)
    return NextResponse.json({ customerIds, count: customerIds.length })
  } catch (err) {
    console.error('Segment export error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
