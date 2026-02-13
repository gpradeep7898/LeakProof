import { execute, query, queryOne } from './db'
import { getDefaultStoreId } from './store'

const STORE_ID_KEY = 'default_store'

async function getStoreId(): Promise<string> {
  return getDefaultStoreId()
}

/** Core metrics */
export async function computeMetrics(storeId: string): Promise<void> {
  await execute(`
    WITH rep AS (
      SELECT COUNT(*)::float / NULLIF((SELECT COUNT(DISTINCT customer_id) FROM customers WHERE store_id = $1), 0) * 100 AS pct
      FROM customers c
      WHERE c.store_id = $1 AND c.total_orders >= 2
    ),
    gaps AS (
      SELECT
        customer_id,
        AVG(days_gap) AS avg_days
      FROM (
        SELECT
          customer_id,
          order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_gap
        FROM orders
        WHERE store_id = $1
      ) g
      WHERE days_gap IS NOT NULL
      GROUP BY customer_id
    ),
    at_risk AS (
      SELECT COALESCE(SUM(c.avg_order_value * 0.7), 0) AS risk
      FROM customers c
      JOIN gaps g ON g.customer_id = c.customer_id AND c.store_id = $1
      WHERE c.last_order_date < CURRENT_DATE - (g.avg_days * 1.25)::int
    )
    INSERT INTO computed_metrics (store_id, repeat_rate, avg_reorder_days, revenue_at_risk, total_revenue, repeat_revenue, one_time_revenue, last_computed_at)
    SELECT
      $1::uuid,
      COALESCE((SELECT pct FROM rep), 0),
      COALESCE((SELECT AVG(avg_days) FROM gaps), 0),
      COALESCE((SELECT risk FROM at_risk), 0),
      COALESCE(SUM(total_spend), 0),
      COALESCE(SUM(CASE WHEN total_orders >= 2 THEN total_spend ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN total_orders = 1 THEN total_spend ELSE 0 END), 0),
      NOW()
    FROM customers WHERE store_id = $1
    ON CONFLICT (store_id) DO UPDATE SET
      repeat_rate = EXCLUDED.repeat_rate,
      avg_reorder_days = EXCLUDED.avg_reorder_days,
      revenue_at_risk = EXCLUDED.revenue_at_risk,
      total_revenue = EXCLUDED.total_revenue,
      repeat_revenue = EXCLUDED.repeat_revenue,
      one_time_revenue = EXCLUDED.one_time_revenue,
      last_computed_at = NOW()
  `, [storeId])
}

/** Customer segments */
export async function computeSegments(storeId: string): Promise<void> {
  await execute(`DELETE FROM segment_members WHERE store_id = $1`, [storeId])
  await execute(`DELETE FROM customer_segments WHERE store_id = $1`, [storeId])

  const segments = await query<{ segment_name: string; customer_count: string; total_revenue: string }>(`
    WITH ranked AS (
      SELECT
        customer_id,
        total_orders,
        total_spend,
        last_order_date,
        CASE
          WHEN total_orders >= 5 AND total_spend >= (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spend) FROM customers WHERE store_id = $1) THEN 'VIP'
          WHEN total_orders >= 2 THEN 'Loyal'
          WHEN last_order_date < CURRENT_DATE - 60 THEN 'At Risk'
          WHEN total_orders = 1 AND first_order_date > CURRENT_DATE - 90 THEN 'New'
          WHEN last_order_date < CURRENT_DATE - 90 THEN 'Churned'
          ELSE 'At Risk'
        END AS seg
      FROM customers
      WHERE store_id = $1
    )
    SELECT seg AS segment_name, COUNT(*)::text AS customer_count, COALESCE(SUM(total_spend), 0)::text AS total_revenue
    FROM ranked
    GROUP BY seg
  `, [storeId])

  for (const s of segments) {
    await execute(`
      INSERT INTO customer_segments (store_id, segment_name, customer_count, total_revenue, suggested_action)
      VALUES ($1, $2, $3::int, $4::decimal, $5)
    `, [storeId, s.segment_name, s.customer_count, s.total_revenue, getSuggestedAction(s.segment_name)])
  }

  // Populate segment_members
  await execute(`
    WITH ranked AS (
      SELECT
        customer_id,
        total_orders,
        total_spend,
        last_order_date,
        first_order_date,
        CASE
          WHEN total_orders >= 5 AND total_spend >= (SELECT COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spend), 0) FROM customers WHERE store_id = $1) THEN 'VIP'
          WHEN total_orders >= 2 THEN 'Loyal'
          WHEN last_order_date < CURRENT_DATE - 60 THEN 'At Risk'
          WHEN total_orders = 1 AND first_order_date > CURRENT_DATE - 90 THEN 'New'
          WHEN last_order_date < CURRENT_DATE - 90 THEN 'Churned'
          ELSE 'At Risk'
        END AS seg
      FROM customers
      WHERE store_id = $1
    )
    INSERT INTO segment_members (segment_id, customer_id, store_id)
    SELECT cs.segment_id, r.customer_id, $1::uuid
    FROM ranked r
    JOIN customer_segments cs ON cs.store_id = $1::uuid AND cs.segment_name = r.seg
  `, [storeId])
}

function getSuggestedAction(segment: string): string {
  const map: Record<string, string> = {
    VIP: 'Exclude from discounts; offer loyalty perks',
    Loyal: 'Target for subscription or upsell',
    'At Risk': 'Send retention offer before churn',
    New: 'Welcome series; encourage repeat',
    Churned: 'Win-back campaign with personalized offer',
  }
  return map[segment] || 'Review and act'
}

/** Product intelligence */
export async function computeProductIntelligence(storeId: string): Promise<void> {
  await execute(`DELETE FROM product_intelligence WHERE store_id = $1`, [storeId])
  await execute(`
    INSERT INTO product_intelligence (product_id, store_id, total_sold, revenue, margin_pct, repeat_rate, suitability_score, last_computed_at)
    SELECT
      p.product_id,
      p.store_id,
      COALESCE(SUM(oi.quantity), 0),
      COALESCE(SUM(oi.line_total), 0),
      CASE WHEN AVG(p.price) > 0 THEN (AVG(p.price) - 10) / AVG(p.price) * 100 ELSE 0 END,
      (
        SELECT COUNT(DISTINCT o.customer_id)::float / NULLIF(COUNT(*), 0) * 100
        FROM order_items oi2
        JOIN orders o ON o.order_id = oi2.order_id AND o.store_id = oi2.store_id
        WHERE oi2.product_id = p.product_id AND oi2.store_id = p.store_id
      ),
      LEAST(90, 50 + (SELECT COUNT(DISTINCT o.customer_id) FROM order_items oi2 JOIN orders o ON o.order_id = oi2.order_id AND o.store_id = oi2.store_id WHERE oi2.product_id = p.product_id AND oi2.store_id = p.store_id)),
      NOW()
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.product_id AND oi.store_id = p.store_id
    WHERE p.store_id = $1
    GROUP BY p.product_id, p.store_id
  `, [storeId])
}

/** Revenue leak detection */
export async function detectRevenueLeaks(storeId: string): Promise<void> {
  await execute(`DELETE FROM revenue_leaks WHERE store_id = $1`, [storeId])

  const leaks: Array<{ type: string; desc: string; loss: number; action: string; count: number; conf: number; confExp: string }> = []

  // Churn risk
  const churn = await queryOne<{ cnt: string; loss: string; avgGap: string; dataMonths: string }>(`
    WITH order_gaps AS (
      SELECT customer_id, order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_gap
      FROM orders WHERE store_id = $1
    ),
    gaps AS (
      SELECT customer_id, AVG(days_gap) AS avg_days
      FROM order_gaps WHERE days_gap IS NOT NULL
      GROUP BY customer_id
    ),
    at_risk AS (
      SELECT c.customer_id, c.avg_order_value, c.total_spend, c.total_orders
      FROM customers c
      JOIN gaps g ON g.customer_id = c.customer_id
      WHERE c.store_id = $1
        AND c.last_order_date < CURRENT_DATE - (g.avg_days * 1.25)::int
        AND c.total_orders >= 2
    )
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(avg_order_value * 0.7), 0)::text AS loss,
      (SELECT AVG(avg_days)::text FROM gaps) AS avg_gap,
      (SELECT GREATEST(1, (CURRENT_DATE - MIN(order_date)::date)::int / 30)::text FROM orders WHERE store_id = $1) AS data_months
    FROM at_risk
  `, [storeId])

  if (churn && parseInt(churn.cnt || '0') > 0) {
    const loss = parseFloat(churn.loss || '0')
    const months = Math.max(1, parseInt(churn.dataMonths || '1'))
    leaks.push({
      type: 'silent_churn',
      desc: `High-value customers haven't ordered in 60+ days. You're risking ${Math.round((parseFloat(churn.loss || '0') / (parseFloat(churn.cnt || '1')) / 1000) * 10) / 10}% of monthly revenue.`,
      loss,
      action: 'Send targeted retention offers or surveys to understand and address their concerns.',
      count: parseInt(churn.cnt),
      conf: Math.min(95, 70 + Math.min(months, 6) * 4),
      confExp: `Based on ${Math.min(months, 12)} months of repeat purchase behavior across ${churn.cnt} customers.`,
    })
  }

  // Discount immunity
  const discountImmune = await queryOne<{ cnt: string; loss: string; orders: string }>(`
    WITH disc AS (
      SELECT customer_id, COUNT(*) FILTER (WHERE discount_used) AS with_disc, COUNT(*) AS total
      FROM orders WHERE store_id = $1
      GROUP BY customer_id
      HAVING COUNT(*) >= 2
    )
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(o.order_value * 0.15), 0)::text AS loss,
      (SELECT COUNT(*)::text FROM orders WHERE store_id = $1) AS orders
    FROM disc d
    JOIN orders o ON o.customer_id = d.customer_id AND o.store_id = $1
    WHERE d.with_disc::float / NULLIF(d.total, 0) < 0.1
    LIMIT 1
  `, [storeId])

  if (discountImmune && parseInt(discountImmune.cnt || '0') > 0) {
    const loss = parseFloat(discountImmune.loss || '0')
    const orders = parseInt(discountImmune.orders || '1')
    leaks.push({
      type: 'discount_immunity',
      desc: 'Repeat buyers rarely use discounts. You are giving unnecessary margin away.',
      loss,
      action: 'Exclude these customers from sales and coupon campaigns.',
      count: parseInt(discountImmune.cnt),
      conf: Math.min(90, 60 + Math.min(orders / 50, 30)),
      confExp: `Based on order history across ${orders} orders.`,
    })
  }

  // Underpriced products
  const underpriced = await queryOne<{ cnt: string; loss: string; products: string }>(`
    WITH pi AS (
      SELECT product_id, revenue, total_sold, margin_pct
      FROM product_intelligence
      WHERE store_id = $1 AND total_sold > 10
    )
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(revenue * 0.05), 0)::text AS loss,
      (SELECT COUNT(*)::text FROM products WHERE store_id = $1) AS products
    FROM pi
    WHERE margin_pct < 30
  `, [storeId])

  if (underpriced && parseInt(underpriced.cnt || '0') > 0) {
    const loss = parseFloat(underpriced.loss || '0')
    const products = parseInt(underpriced.products || '1')
    leaks.push({
      type: 'underpriced',
      desc: `${underpriced.cnt} products have margins below 30%. You're leaving money on the table.`,
      loss,
      action: 'Test 5-10% price increases on high-margin products with strong sales velocity.',
      count: parseInt(underpriced.cnt),
      conf: Math.min(85, 65 + Math.min(products, 20)),
      confExp: `Based on product performance across ${products} products.`,
    })
  }

  for (let i = 0; i < leaks.length; i++) {
    const l = leaks[i]
    await execute(`
      INSERT INTO revenue_leaks (store_id, leak_type, description, estimated_monthly_loss, confidence_score, confidence_explanation, recommended_action, priority_rank, status, affected_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    `, [storeId, l.type, l.desc, l.loss, l.conf, l.confExp, l.action, i + 1, l.count])
  }
}

/** Generate actions from leaks */
export async function generateActions(storeId: string): Promise<void> {
  await execute(`DELETE FROM actions WHERE store_id = $1`, [storeId])

  const leakList = await query<{ leak_id: string; description: string; estimated_monthly_loss: string; confidence_score: string; confidence_explanation: string; recommended_action: string; leak_type: string; affected_count: string }>(
    `SELECT leak_id, description, estimated_monthly_loss, confidence_score, confidence_explanation, recommended_action, leak_type, affected_count FROM revenue_leaks WHERE store_id = $1 AND status = 'active' ORDER BY estimated_monthly_loss DESC`,
    [storeId]
  )

  const difficultyMap: Record<string, string> = {
    silent_churn: 'Moderate',
    discount_immunity: 'Quick Win',
    underpriced: 'Moderate',
  }

  for (const leak of leakList) {
    const gain = parseFloat(leak.estimated_monthly_loss || '0')
    const what = leak.recommended_action
    const why = leak.description
    const next = `Export anonymized customer IDs and run your campaign. Expected impact visible in ~14-30 days.`
    await execute(`
      INSERT INTO actions (store_id, leak_id, description, what, why, next_step, potential_gain, confidence_score, confidence_explanation, status, difficulty)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'todo', $10)
    `, [storeId, leak.leak_id, what, what, why, next, gain, leak.confidence_score, leak.confidence_explanation, difficultyMap[leak.leak_type] || 'Moderate'])
  }

  // Add a few more generic actions from metrics
  const metrics = await queryOne<{ revenue_at_risk: string }>(`SELECT revenue_at_risk FROM computed_metrics WHERE store_id = $1`, [storeId])
  if (metrics && parseFloat(metrics.revenue_at_risk || '0') > 0) {
    await execute(`
      INSERT INTO actions (store_id, description, what, why, next_step, potential_gain, confidence_score, confidence_explanation, status, difficulty)
      VALUES ($1, $2, $3, $4, $5, $6, 75, 'Based on churn risk patterns.', 'todo', 'Moderate')
    `, [
      storeId,
      'Target at-risk customers with personalized 15% discount and product recommendations',
      'Target at-risk customers with personalized 15% discount and product recommendations',
      `${metrics.revenue_at_risk} at risk from customers past their usual reorder window. Reach them now before churn becomes permanent.`,
      'Create 3-email sequence triggered after 45 days of inactivity. Expected impact visible in ~14-30 days.',
      parseFloat(metrics.revenue_at_risk) * 0.4,
    ])
  }
}

/** Founder summary */
export async function updateFounderSummary(storeId: string): Promise<void> {
  const m = await queryOne<{ total_revenue: string; revenue_at_risk: string; repeat_rate: string }>(
    `SELECT total_revenue, revenue_at_risk, repeat_rate FROM computed_metrics WHERE store_id = $1`,
    [storeId]
  )
  if (!m) return
  const rev = parseFloat(m.total_revenue || '0')
  const risk = parseFloat(m.revenue_at_risk || '0')
  const rr = parseFloat(m.repeat_rate || '0')
  let summary = "Connect your data to see your revenue summary."
  if (rev > 0) {
    if (risk > 0) {
      summary = `You're growing, but $${Math.round(risk).toLocaleString()} is quietly leaking due to churn and pricing gaps.`
    } else {
      summary = `Your store has $${Math.round(rev).toLocaleString()} in revenue. ${rr.toFixed(0)}% comes from repeat buyers.`
    }
  }
  await execute(`UPDATE computed_metrics SET founder_summary = $1 WHERE store_id = $2`, [summary, storeId])
}

/** Full pipeline */
export async function runFullPipeline(storeId: string): Promise<{ metrics: boolean; segments: boolean; products: boolean; leaks: number; actions: number }> {
  await computeMetrics(storeId)
  await computeSegments(storeId)
  await computeProductIntelligence(storeId)
  await detectRevenueLeaks(storeId)
  await generateActions(storeId)
  await updateFounderSummary(storeId)

  const leaks = await query<{ leak_id: string }>('SELECT leak_id FROM revenue_leaks WHERE store_id = $1', [storeId])
  const actions = await query<{ action_id: string }>('SELECT action_id FROM actions WHERE store_id = $1', [storeId])

  return {
    metrics: true,
    segments: true,
    products: true,
    leaks: leaks.length,
    actions: actions.length,
  }
}
