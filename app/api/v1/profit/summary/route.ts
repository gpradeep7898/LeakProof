/**
 * Profit Summary API
 * GET /api/v1/profit/summary
 */
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { getStoreFromRequest } from '@/lib/store'

export async function GET(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req)

        // Current month profit
        const current = await queryOne<{
            total_revenue: string; net_profit: string; gross_profit: string
            cogs: string; shipping: string; discounts: string; fees: string
            order_count: string; avg_margin: string
        }>(`
      SELECT
        COALESCE(SUM(total_price), 0)::text AS total_revenue,
        COALESCE(SUM(net_profit), 0)::text AS net_profit,
        COALESCE(SUM(total_price - cogs), 0)::text AS gross_profit,
        COALESCE(SUM(cogs), 0)::text AS cogs,
        COALESCE(SUM(shipping_cost), 0)::text AS shipping,
        COALESCE(SUM(total_discounts), 0)::text AS discounts,
        COALESCE(SUM(platform_fees + payment_processing_fees), 0)::text AS fees,
        COUNT(*)::text AS order_count,
        COALESCE(AVG(CASE WHEN total_price > 0 THEN net_profit / total_price * 100 ELSE 0 END), 0)::text AS avg_margin
      FROM orders
      WHERE store_id = $1
        AND order_date >= DATE_TRUNC('month', NOW())
    `, [storeId])

        // Previous month profit
        const previous = await queryOne<{
            net_profit: string; total_revenue: string
        }>(`
      SELECT
        COALESCE(SUM(net_profit), 0)::text AS net_profit,
        COALESCE(SUM(total_price), 0)::text AS total_revenue
      FROM orders
      WHERE store_id = $1
        AND order_date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
        AND order_date < DATE_TRUNC('month', NOW())
    `, [storeId])

        // Customer metrics
        const customers = await queryOne<{
            total_customers: string; vip_count: string; at_risk_count: string; lapsed_count: string
            avg_ltv: string; repeat_rate: string
        }>(`
      SELECT
        COUNT(*)::text AS total_customers,
        COUNT(*) FILTER (WHERE segment = 'VIP' OR segment = 'vip')::text AS vip_count,
        COUNT(*) FILTER (WHERE segment = 'At Risk' OR segment = 'at_risk')::text AS at_risk_count,
        COUNT(*) FILTER (WHERE segment = 'Lapsed' OR segment = 'lapsed')::text AS lapsed_count,
        COALESCE(AVG(lifetime_value), 0)::text AS avg_ltv,
        COALESCE(
          COUNT(*) FILTER (WHERE total_orders >= 2) * 100.0 / NULLIF(COUNT(*), 0),
          0
        )::text AS repeat_rate
      FROM customers
      WHERE store_id = $1
    `, [storeId])

        // Leak summary
        const leakSummary = await queryOne<{
            total_leaks: string; total_monthly_loss: string; critical_count: string
        }>(`
      SELECT
        COUNT(*)::text AS total_leaks,
        COALESCE(SUM(estimated_monthly_loss), 0)::text AS total_monthly_loss,
        COUNT(*) FILTER (WHERE severity = 'critical')::text AS critical_count
      FROM revenue_leaks
      WHERE store_id = $1 AND status = 'detected'
    `, [storeId])

        // Waterfall data: revenue → breakdown
        const currentRevenue = parseFloat(current?.total_revenue || '0')
        const currentCogs = parseFloat(current?.cogs || '0')
        const currentShipping = parseFloat(current?.shipping || '0')
        const currentDiscounts = parseFloat(current?.discounts || '0')
        const currentFees = parseFloat(current?.fees || '0')
        const currentAdCost = currentRevenue * 0.05 // estimated
        const currentReturns = currentRevenue * 0.03 // estimated
        const currentNetProfit = parseFloat(current?.net_profit || '0')

        const prevRevenue = parseFloat(previous?.total_revenue || '0')
        const prevProfit = parseFloat(previous?.net_profit || '0')

        const profitChange = prevProfit > 0 ? ((currentNetProfit - prevProfit) / prevProfit) * 100 : 0

        // Generate founder insight
        const leakLoss = parseFloat(leakSummary?.total_monthly_loss || '0')
        const discountWaste = currentDiscounts
        let founderInsight = 'Your profit data is loading. Upload orders data to see insights.'

        if (currentRevenue > 0) {
            if (leakLoss > 1000) {
                founderInsight = `You're leaving $${Math.round(leakLoss).toLocaleString()}/mo on the table — your top profit leak is fixable in < 1 hour.`
            } else if (discountWaste > 500) {
                founderInsight = `You're giving away $${Math.round(discountWaste).toLocaleString()}/mo in discounts this month. ${Math.round((discountWaste / currentRevenue) * 100)}% of your revenue goes to markdowns.`
            } else if (currentNetProfit > 0) {
                const margin = parseFloat(current?.avg_margin || '0')
                founderInsight = `Strong month — ${margin.toFixed(1)}% net margin. Focus on growing repeat customer rate to unlock the next level.`
            } else {
                founderInsight = `You had negative profit this month. COGS + fees are eating your margins. Start with the leak scan.`
            }
        }

        return NextResponse.json({
            currentMonth: {
                revenue: currentRevenue,
                netProfit: currentNetProfit,
                grossProfit: parseFloat(current?.gross_profit || '0'),
                orderCount: parseInt(current?.order_count || '0'),
                avgMarginPct: parseFloat(current?.avg_margin || '0'),
                profitChangePct: profitChange,
            },
            waterfall: [
                { label: 'Revenue', value: currentRevenue, type: 'positive' },
                { label: 'COGS', value: -currentCogs, type: 'negative' },
                { label: 'Shipping', value: -currentShipping, type: 'negative' },
                { label: 'Discounts', value: -currentDiscounts, type: 'negative' },
                { label: 'Platform Fees', value: -currentFees, type: 'negative' },
                { label: 'Ad Costs', value: -currentAdCost, type: 'negative' },
                { label: 'Returns', value: -currentReturns, type: 'negative' },
                { label: 'Net Profit', value: currentNetProfit, type: 'total' },
            ],
            customers: {
                total: parseInt(customers?.total_customers || '0'),
                vip: parseInt(customers?.vip_count || '0'),
                atRisk: parseInt(customers?.at_risk_count || '0'),
                lapsed: parseInt(customers?.lapsed_count || '0'),
                avgLtv: parseFloat(customers?.avg_ltv || '0'),
                ltvCacRatio: 0,
                repeatRate: parseFloat(customers?.repeat_rate || '0'),
            },
            leaks: {
                total: parseInt(leakSummary?.total_leaks || '0'),
                totalMonthlyLoss: leakLoss,
                criticalCount: parseInt(leakSummary?.critical_count || '0'),
            },
            founderInsight,
        })
    } catch (err) {
        console.error('[Profit Summary] Error:', err)
        return NextResponse.json({ error: 'Failed to load profit summary' }, { status: 500 })
    }
}
