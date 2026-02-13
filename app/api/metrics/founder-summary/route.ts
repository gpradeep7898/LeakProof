import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET() {
  try {
    const storeId = await getDefaultStoreId()
    const m = await queryOne<{ founder_summary: string }>(
      `SELECT founder_summary FROM computed_metrics WHERE store_id = $1`,
      [storeId]
    )
    return NextResponse.json({
      summary: m?.founder_summary || 'Connect your data to see your revenue summary.',
    })
  } catch (err) {
    console.error('Founder summary error:', err)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}
