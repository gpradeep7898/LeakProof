import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { getDefaultStoreId } from '@/lib/store'
import { ProfitCalculator } from '@/lib/services/profitCalculator'
import { queryOne } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const storeId = await getDefaultStoreId()
    const { searchParams } = new URL(request.url)
    const timeframe = parseInt(searchParams.get('timeframe') || '30', 10)

    const calculator = new ProfitCalculator()
    const summary = await calculator.getProfitSummary(storeId, timeframe)

    const metrics = await queryOne<{ repeat_rate: string }>(
      'SELECT repeat_rate FROM computed_metrics WHERE store_id = $1',
      [storeId]
    )

    const totalRevenue = parseFloat(summary?.total_revenue?.toString() || '0')
    const totalCogs = parseFloat(summary?.total_cogs?.toString() || '0')
    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0

    return NextResponse.json({
      total_revenue: totalRevenue,
      net_profit: parseFloat(summary?.total_net_profit?.toString() || '0'),
      total_net_profit: parseFloat(summary?.total_net_profit?.toString() || '0'),
      total_cogs: totalCogs,
      total_shipping: parseFloat(summary?.total_shipping?.toString() || '0'),
      total_discounts: parseFloat(summary?.total_discounts?.toString() || '0'),
      total_fees: parseFloat(summary?.total_fees?.toString() || '0'),
      total_ads: parseFloat(summary?.total_ads?.toString() || '0'),
      total_returns: parseFloat(summary?.total_returns?.toString() || '0'),
      gross_margin: grossMargin,
      repeat_rate: parseFloat(metrics?.repeat_rate || '0'),
      ltv_cac_ratio: 3.0,
      founder_summary: summary?.order_count
        ? `Based on ${summary.order_count} orders in the last ${timeframe} days. Revenue: $${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`
        : 'Upload order data to see your profit snapshot.',
      trend: 0,
    })
  } catch (err) {
    console.error('Profit summary error:', err)
    return NextResponse.json({ error: 'Failed to load profit summary' }, { status: 500 })
  }
}
