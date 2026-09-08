import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getStoreFromRequest } from '@/lib/store'

// DTC industry medians (static benchmarks — replace with DB-backed benchmarks later)
const CATEGORY_MEDIANS = {
    repeat_customer_rate: 28.5,
    avg_order_value: 95,
    gross_margin_pct: 42,
    net_profit_margin_pct: 12,
    ltv_cac_ratio: 3.2,
}

export async function GET(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req)

        // Compute merchant metrics from real order + customer data
        const metrics = await queryOne<{
            repeat_rate: string
            avg_order_value: string
            gross_margin_pct: string
        }>(`
      SELECT
        COALESCE(
          COUNT(*) FILTER (WHERE total_orders >= 2) * 100.0 / NULLIF(COUNT(*), 0),
          0
        )::text AS repeat_rate,
        COALESCE(
          (SELECT AVG(total_price) FROM orders WHERE store_id = $1), 0
        )::text AS avg_order_value,
        COALESCE(
          (SELECT AVG(CASE WHEN total_price > 0 THEN (total_price - cogs) / total_price * 100 ELSE 0 END)
           FROM orders WHERE store_id = $1 AND cogs > 0), 0
        )::text AS gross_margin_pct
      FROM customers
      WHERE store_id = $1
    `, [storeId])

        const repeatRate = parseFloat(metrics?.repeat_rate || '0')
        const aov = parseFloat(metrics?.avg_order_value || '0')
        const grossMargin = parseFloat(metrics?.gross_margin_pct || '0')
        const hasData = aov > 0

        const merchantMetrics = hasData ? {
            repeatCustomerRate: repeatRate,
            avgOrderValue: aov,
            grossMarginPct: grossMargin,
            netProfitMarginPct: 0,
            ltvCacRatio: 0,
        } : null

        const vsMedian = hasData ? {
            repeatCustomerRate: repeatRate - CATEGORY_MEDIANS.repeat_customer_rate,
            avgOrderValue: aov - CATEGORY_MEDIANS.avg_order_value,
            grossMarginPct: grossMargin - CATEGORY_MEDIANS.gross_margin_pct,
        } : {}

        return NextResponse.json({
            groupKey: 'dtc_general',
            benchmark: { industryCategory: 'Direct-to-Consumer', revenueRange: 'General' },
            metrics: {
                repeatCustomerRate: CATEGORY_MEDIANS.repeat_customer_rate,
                avgOrderValue: CATEGORY_MEDIANS.avg_order_value,
                grossMarginPct: CATEGORY_MEDIANS.gross_margin_pct,
                netProfitMarginPct: CATEGORY_MEDIANS.net_profit_margin_pct,
                ltvCacRatio: CATEGORY_MEDIANS.ltv_cac_ratio,
            },
            merchantMetrics,
            vsMedian,
            hasData,
        })
    } catch (err) {
        console.error('[Benchmarks] Error:', err)
        return NextResponse.json({ error: 'Failed to load benchmarks' }, { status: 500 })
    }
}
