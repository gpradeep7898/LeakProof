import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET() {
  try {
    const storeId = await getDefaultStoreId()
    const m = await queryOne<{
      repeat_rate: string
      avg_reorder_days: string
      revenue_at_risk: string
      total_revenue: string
      repeat_revenue: string
      one_time_revenue: string
      founder_summary: string
    }>(
      `SELECT repeat_rate, avg_reorder_days, revenue_at_risk, total_revenue, repeat_revenue, one_time_revenue, founder_summary
       FROM computed_metrics WHERE store_id = $1`,
      [storeId]
    )

    if (!m) {
      return NextResponse.json({
        repeatRate: 0,
        avgReorderDays: 0,
        revenueAtRisk: 0,
        totalRevenue: 0,
        repeatRevenue: 0,
        oneTimeRevenue: 0,
        founderSummary: 'Connect your data to see your revenue summary.',
      })
    }

    return NextResponse.json({
      repeatRate: parseFloat(m.repeat_rate || '0'),
      avgReorderDays: parseFloat(m.avg_reorder_days || '0'),
      revenueAtRisk: parseFloat(m.revenue_at_risk || '0'),
      totalRevenue: parseFloat(m.total_revenue || '0'),
      repeatRevenue: parseFloat(m.repeat_revenue || '0'),
      oneTimeRevenue: parseFloat(m.one_time_revenue || '0'),
      founderSummary: m.founder_summary || 'Connect your data to see your revenue summary.',
    })
  } catch (err) {
    console.error('Metrics summary error:', err)
    return NextResponse.json({ error: 'Failed to load metrics' }, { status: 500 })
  }
}
