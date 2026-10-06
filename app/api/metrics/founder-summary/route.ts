import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { billingGuard } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = await getStoreFromRequest(request)
    const billingRes = await billingGuard(storeId)
    if (billingRes) return billingRes
    const m = await queryOne<{ founder_summary: string }>(
      `SELECT founder_summary FROM computed_metrics WHERE store_id = $1`,
      [storeId]
    )
    return NextResponse.json({
      summary: m?.founder_summary || 'Connect your data to see your revenue summary.',
    })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('Founder summary error:', err)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}
