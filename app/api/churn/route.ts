import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET() {
  try {
    const storeId = await getDefaultStoreId()

    const atRisk = await query<{
      customer_id: string
      days_since: string
      risk_reason: string
    }>(`
      WITH order_gaps AS (
        SELECT customer_id, order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_gap
        FROM orders WHERE store_id = $1
      ),
      gaps AS (
        SELECT customer_id, AVG(days_gap) AS avg_days
        FROM order_gaps WHERE days_gap IS NOT NULL
        GROUP BY customer_id
      )
      SELECT c.customer_id,
        (CURRENT_DATE - c.last_order_date::date)::int AS days_since,
        'Past usual reorder window' AS risk_reason
      FROM customers c
      JOIN gaps g ON g.customer_id = c.customer_id
      WHERE c.store_id = $1
        AND c.total_orders >= 2
        AND c.last_order_date < CURRENT_DATE - (g.avg_days * 1.25)::int
      LIMIT 50
    `, [storeId])

    const reorders = await query<{
      customer_id: string
      predicted_date: string
      confidence: string
    }>(`
      WITH order_gaps AS (
        SELECT customer_id, order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_gap
        FROM orders WHERE store_id = $1
      ),
      gaps AS (
        SELECT customer_id, AVG(days_gap) AS avg_days
        FROM order_gaps WHERE days_gap IS NOT NULL
        GROUP BY customer_id
      )
      SELECT c.customer_id,
        (c.last_order_date::date + (g.avg_days)::int)::text AS predicted_date,
        '75' AS confidence
      FROM customers c
      JOIN gaps g ON g.customer_id = c.customer_id
      WHERE c.store_id = $1
        AND c.total_orders >= 2
        AND c.last_order_date + (g.avg_days)::int >= CURRENT_DATE
      LIMIT 50
    `, [storeId])

    return NextResponse.json({
      atRisk: atRisk.map((r) => ({
        customerId: r.customer_id,
        daysSinceLastOrder: parseInt(r.days_since || '0'),
        riskReason: r.risk_reason,
      })),
      upcomingReorders: reorders.map((r) => ({
        customerId: r.customer_id,
        predictedReorderDate: r.predicted_date,
        confidence: parseFloat(r.confidence || '75'),
      })),
    })
  } catch (err) {
    console.error('Churn error:', err)
    return NextResponse.json({ error: 'Failed to load churn data' }, { status: 500 })
  }
}
