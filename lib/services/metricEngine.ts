/**
 * LeakProof Metric Engine
 * Computes: Money Snapshot, Customer Segments, Product Intelligence, Discount Intelligence
 * Rule-based confidence scores - never mention AI or prediction models
 */

import { query, queryOne, execute } from '../db';
import { LeakDetector } from './leakDetector';

export class MetricEngine {
  async recalculateAll(storeId: string) {
    console.log(`Starting full metric recalculation for store ${storeId}...`);

    await this.computeMoneySnapshot(storeId);
    await this.computeCustomerSegments(storeId);
    await this.computeProductIntelligence(storeId);
    await this.computeDiscountIntelligence(storeId);

    const detector = new LeakDetector(storeId);
    await detector.detectAllLeaks();

    // Generate actions from leaks
    await this.syncActionsFromLeaks(storeId);

    console.log(`Recalculation complete for store ${storeId}.`);
  }

  private async computeMoneySnapshot(storeId: string) {
    const stats = await queryOne<{
      total_revenue: number;
      net_revenue: number;
      avg_order_value: number;
      total_customers: number;
      repeat_customers: number;
      avg_reorder_days: number;
      revenue_at_risk: number;
    }>(`
      WITH order_stats AS (
        SELECT
          SUM(COALESCE(total_price, order_value, 0) - COALESCE(refunded_amount, 0)) as total_revenue,
          AVG(COALESCE(total_price, order_value, 0)) as avg_order_value
        FROM orders WHERE store_id = $1
      ),
      customer_stats AS (
        SELECT
          customer_id,
          COUNT(*) as order_count,
          MIN(COALESCE(created_at, order_date::timestamptz)) as first_order,
          MAX(COALESCE(created_at, order_date::timestamptz)) as last_order
        FROM orders WHERE store_id = $1
        GROUP BY customer_id
      ),
      repeat_stats AS (
        SELECT
          COUNT(*) as total_customers,
          COUNT(*) FILTER (WHERE order_count >= 2) as repeat_customers,
          AVG(EXTRACT(EPOCH FROM (last_order - first_order)) / 86400.0 / NULLIF(order_count - 1, 0)) FILTER (WHERE order_count >= 2) as avg_reorder_days
        FROM customer_stats
      )
      SELECT
        (SELECT total_revenue FROM order_stats) as total_revenue,
        (SELECT total_revenue FROM order_stats) as net_revenue,
        (SELECT avg_order_value FROM order_stats) as avg_order_value,
        (SELECT total_customers FROM repeat_stats) as total_customers,
        (SELECT repeat_customers FROM repeat_stats) as repeat_customers,
        COALESCE((SELECT avg_reorder_days FROM repeat_stats), 0) as avg_reorder_days,
        0::decimal as revenue_at_risk
    `, [storeId]);

    const totalRevenue = Number(stats?.total_revenue || 0);
    const totalCustomers = Number(stats?.total_customers || 0);
    const repeatCustomers = Number(stats?.repeat_customers || 0);
    const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
    const avgReorderDays = Number(stats?.avg_reorder_days || 0);

    // Revenue at risk: at-risk customers * avg order value
    const atRisk = await queryOne<{ cnt: number; avg_aov: number }>(`
      WITH cust AS (
        SELECT customer_id, COUNT(*) as c, MAX(COALESCE(created_at, order_date::timestamptz)) as last_order
        FROM orders WHERE store_id = $1 GROUP BY customer_id
      ),
      avg_days AS (
        SELECT AVG(EXTRACT(EPOCH FROM (c2.last_order - c1.last_order)) / 86400.0) as avg_d
        FROM (SELECT customer_id, last_order, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY last_order DESC) as rn FROM (
          SELECT o.customer_id, COALESCE(o.created_at, o.order_date::timestamptz) as last_order
          FROM orders o WHERE o.store_id = $1
        ) x) c1
        JOIN (SELECT customer_id, last_order, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY last_order DESC) as rn FROM (
          SELECT o.customer_id, COALESCE(o.created_at, o.order_date::timestamptz) as last_order
          FROM orders o WHERE o.store_id = $1
        ) x) c2 ON c1.customer_id = c2.customer_id AND c1.rn = 1 AND c2.rn = 2
      )
      SELECT
        COUNT(*)::int as cnt,
        (SELECT AVG(total_price) FROM orders WHERE store_id = $1) as avg_aov
      FROM cust
      WHERE c >= 2
        AND last_order < NOW() - INTERVAL '1 day' * (SELECT COALESCE(avg_d, 90) * 1.25 FROM avg_days)
    `, [storeId]);

    const atRiskCount = Number(atRisk?.cnt || 0);
    const avgAov = Number(atRisk?.avg_aov || stats?.avg_order_value || 0);
    const revenueAtRisk = atRiskCount * avgAov;

    await execute(`
      INSERT INTO computed_metrics (
        store_id, total_revenue, net_revenue, repeat_rate, avg_reorder_days, revenue_at_risk,
        average_order_value, founder_summary, last_computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (store_id) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        net_revenue = EXCLUDED.net_revenue,
        repeat_rate = EXCLUDED.repeat_rate,
        avg_reorder_days = EXCLUDED.avg_reorder_days,
        revenue_at_risk = EXCLUDED.revenue_at_risk,
        average_order_value = EXCLUDED.average_order_value,
        founder_summary = EXCLUDED.founder_summary,
        last_computed_at = NOW()
    `, [
      storeId,
      totalRevenue,
      totalRevenue,
      repeatRate,
      avgReorderDays,
      revenueAtRisk,
      Number(stats?.avg_order_value || 0),
      totalCustomers > 0
        ? `Based on ${totalCustomers} customers and ${repeatRate.toFixed(0)}% repeat rate. Avg reorder cycle: ${avgReorderDays.toFixed(0)} days.`
        : 'Upload order data to see your money snapshot.',
    ]);
  }

  private async computeCustomerSegments(storeId: string) {
    const avgReorder = await queryOne<{ avg_days: number; vip_threshold: number }>(`
      WITH cust AS (
        SELECT customer_id,
          COUNT(*) as order_count,
          SUM(COALESCE(total_price, order_value, 0)) as total_spend,
          MAX(COALESCE(created_at, order_date::timestamptz)) as last_order,
          MIN(COALESCE(created_at, order_date::timestamptz)) as first_order
        FROM orders WHERE store_id = $1
        GROUP BY customer_id
      ),
      percentiles AS (
        SELECT
          PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY total_spend) as vip_threshold,
          AVG(EXTRACT(EPOCH FROM (last_order - first_order)) / 86400.0 / NULLIF(order_count - 1, 0)) FILTER (WHERE order_count >= 2) as avg_days
        FROM cust
      )
      SELECT COALESCE(avg_days, 90) as avg_days, COALESCE(vip_threshold, 0) as vip_threshold FROM percentiles
    `, [storeId]);

    const avgReorderDays = Number(avgReorder?.avg_days || 90);
    const vipThreshold = Number(avgReorder?.vip_threshold || 0);

    await execute(`
      WITH cust_stats AS (
        SELECT
          customer_id,
          COUNT(*) as order_count,
          SUM(COALESCE(total_price, order_value, 0)) as total_spend,
          MAX(COALESCE(created_at, order_date::timestamptz)) as last_order,
          MIN(COALESCE(created_at, order_date::timestamptz)) as first_order
        FROM orders WHERE store_id = $1
        GROUP BY customer_id
      ),
      discount_usage AS (
        SELECT customer_id,
          COUNT(*) as total_orders,
          SUM(CASE WHEN COALESCE(total_discounts, discount_amount, 0) > 0 THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(*), 0) * 100 as discount_pct
        FROM orders WHERE store_id = $1 GROUP BY customer_id
      ),
      segment_assign AS (
        SELECT c.*,
          COALESCE(d.discount_pct, 0) as discount_pct,
          EXTRACT(EPOCH FROM (NOW() - c.last_order)) / 86400 as days_since_last,
          CASE
            WHEN c.total_spend >= $2 THEN 'VIP'
            WHEN c.order_count >= 3 AND c.last_order >= NOW() - INTERVAL '60 days' THEN 'Loyal'
            WHEN c.order_count >= 2 THEN 'Repeat'
            ELSE 'One-time'
          END as base_segment
        FROM cust_stats c
        LEFT JOIN discount_usage d ON d.customer_id = c.customer_id
      )
      UPDATE customers cu
      SET
        total_orders = s.order_count,
        total_spend = s.total_spend,
        total_revenue = s.total_spend,
        lifetime_value = s.total_spend,
        first_order_date = s.first_order,
        last_order_date = s.last_order,
        discount_usage_pct = s.discount_pct,
        days_since_last_order = s.days_since_last::int,
        segment = CASE
          WHEN s.base_segment = 'VIP' THEN 'VIP'
          WHEN s.base_segment = 'Loyal' THEN 'Loyal'
          WHEN s.base_segment = 'Repeat' THEN
            CASE
              WHEN s.days_since_last > $3 * 1.75 THEN 'Lapsed'
              WHEN s.days_since_last > $3 * 1.25 THEN 'At-risk'
              WHEN s.discount_pct < 10 AND s.order_count >= 2 THEN 'Discount-Immune'
              WHEN s.discount_pct > 70 THEN 'Discount-Dependent'
              ELSE 'Repeat'
            END
          ELSE 'One-time'
        END,
        churn_risk_score = CASE
          WHEN s.days_since_last > $3 * 1.75 THEN 0.9
          WHEN s.days_since_last > $3 * 1.25 THEN 0.6
          ELSE 0.1
        END,
        updated_at = NOW()
      FROM segment_assign s
      WHERE cu.customer_id = s.customer_id AND cu.store_id = $1
    `, [storeId, vipThreshold, avgReorderDays]);

    // Populate segment_members and customer_segments
    await execute(`DELETE FROM segment_members WHERE segment_id IN (SELECT segment_id FROM customer_segments WHERE store_id = $1)`, [storeId]);
    await execute(`DELETE FROM customer_segments WHERE store_id = $1`, [storeId]);

    const segments = await query<{ segment_name: string; customer_count: string; total_revenue: string }>(`
      SELECT segment as segment_name, COUNT(*)::text as customer_count, COALESCE(SUM(total_spend), 0)::text as total_revenue
      FROM customers WHERE store_id = $1 AND segment IS NOT NULL
      GROUP BY segment
    `, [storeId]);

    for (const seg of segments) {
      const [inserted] = await query<{ segment_id: string }>(
        `INSERT INTO customer_segments (store_id, segment_name, customer_count, total_revenue, suggested_action)
         VALUES ($1, $2, $3, $4, $5) RETURNING segment_id`,
        [storeId, seg.segment_name, seg.customer_count, seg.total_revenue, suggestAction(seg.segment_name)]
      );
      if (inserted?.segment_id) {
        await execute(
          `INSERT INTO segment_members (segment_id, customer_id, store_id)
           SELECT $1, customer_id, $2 FROM customers WHERE store_id = $2 AND segment = $3`,
          [inserted.segment_id, storeId, seg.segment_name]
        );
      }
    }
  }

  private async computeProductIntelligence(storeId: string) {
    // Ensure all products from catalog have intelligence computed (even zero sales)
    await execute(`
      WITH prod_sales AS (
        SELECT
          oi.product_id,
          COUNT(DISTINCT o.order_id) as total_orders_count,
          SUM(oi.quantity) as total_units_sold,
          SUM(COALESCE(oi.line_total, oi.quantity * oi.line_price)) as total_revenue,
          COUNT(DISTINCT o.customer_id) as unique_buyers,
          SUM(CASE WHEN COALESCE(oi.line_discount, 0) > 0 THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(*), 0) * 100 as discount_usage_rate
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id AND o.store_id = oi.store_id
        WHERE oi.store_id = $1
        GROUP BY oi.product_id
      ),
      repeat_buyers AS (
        SELECT oi.product_id,
          COUNT(DISTINCT o.customer_id) as repeat_customers
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id AND o.store_id = oi.store_id
        WHERE oi.store_id = $1
          AND o.customer_id IN (
            SELECT customer_id FROM (
              SELECT customer_id, product_id, COUNT(DISTINCT order_id) as cnt
              FROM order_items oi2 JOIN orders o2 ON o2.order_id = oi2.order_id AND o2.store_id = oi2.store_id
              WHERE oi2.store_id = $1
              GROUP BY customer_id, product_id HAVING COUNT(DISTINCT order_id) >= 2
            ) r
            WHERE r.product_id = oi.product_id
          )
        GROUP BY oi.product_id
      )
      UPDATE products p
      SET
        total_sold = COALESCE(ps.total_units_sold, 0),
        avg_selling_price = CASE WHEN COALESCE(ps.total_units_sold, 0) > 0
          THEN ps.total_revenue / ps.total_units_sold ELSE COALESCE(p.avg_selling_price, p.price, 0) END,
        repurchase_rate = CASE WHEN COALESCE(ps.unique_buyers, 0) > 0
          THEN (COALESCE(rb.repeat_customers, 0)::decimal / ps.unique_buyers) * 100 ELSE 0 END,
        discount_usage_rate = COALESCE(ps.discount_usage_rate, 0),
        churn_correlation = CASE
          WHEN COALESCE(ps.unique_buyers, 0) > 10 AND (COALESCE(rb.repeat_customers, 0)::decimal / NULLIF(ps.unique_buyers, 0)) < 0.1 THEN 0.8
          ELSE 0.1
        END,
        updated_at = NOW()
      FROM prod_sales ps
      LEFT JOIN repeat_buyers rb ON rb.product_id = ps.product_id
      WHERE p.product_id = ps.product_id AND p.store_id = $1
    `, [storeId]);

    // Catalog-only products (no order_items) - set zero stats
    await execute(`
      UPDATE products SET
        total_sold = 0,
        repurchase_rate = 0,
        churn_correlation = 0,
        discount_usage_rate = 0,
        updated_at = NOW()
      WHERE store_id = $1 AND product_id NOT IN (SELECT product_id FROM order_items WHERE store_id = $1)
    `, [storeId]);
  }

  private async computeDiscountIntelligence(storeId: string) {
    await execute(`
      INSERT INTO discounts (store_id, code, usage_count, total_discount_amount, updated_at)
      SELECT $1, NULLIF(TRIM(discount_code), ''), COUNT(*), SUM(COALESCE(total_discounts, discount_amount, 0)), NOW()
      FROM orders
      WHERE store_id = $1 AND discount_code IS NOT NULL AND TRIM(discount_code) != '' AND NULLIF(TRIM(discount_code), '') IS NOT NULL
      GROUP BY store_id, NULLIF(TRIM(discount_code), '')
      ON CONFLICT (store_id, code) DO UPDATE SET
        usage_count = discounts.usage_count + EXCLUDED.usage_count,
        total_discount_amount = discounts.total_discount_amount + EXCLUDED.total_discount_amount,
        updated_at = NOW()
    `, [storeId]);
  }

  private async syncActionsFromLeaks(storeId: string) {
    const leaks = await query<{ leak_id: string; title: string; description: string; estimated_monthly_loss: string; confidence_score: string; recommended_action: string }>(
      `SELECT leak_id, title, description, estimated_monthly_loss, confidence_score, recommended_action
       FROM revenue_leaks WHERE store_id = $1 AND status = 'active'`,
      [storeId]
    );

    for (const leak of leaks) {
      const existing = await queryOne<{ action_id: string }>(
        'SELECT action_id FROM actions WHERE leak_id = $1',
        [leak.leak_id]
      );
      if (!existing) {
        await execute(
          `INSERT INTO actions (store_id, leak_id, description, what, potential_gain, confidence_score, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'todo')`,
          [
            storeId,
            leak.leak_id,
            leak.title || leak.description,
            leak.recommended_action || 'Review and take action',
            parseFloat(leak.estimated_monthly_loss || '0'),
            parseFloat(leak.confidence_score || '0'),
          ]
        );
      }
    }
  }
}

function suggestAction(segmentName: string): string {
  const m: Record<string, string> = {
    VIP: 'Exclude from broad discounts; personalized offers only',
    Loyal: 'Reward with early access, not deeper discounts',
    'At-risk': 'Winback campaign within 30 days',
    Lapsed: 'Re-engagement offer; survey to understand churn',
    'Discount-Dependent': 'Reduce discount frequency; test full-price value props',
    'Discount-Immune': 'Never discount; VIP perks instead',
    Repeat: 'Upsell and cross-sell',
    'One-time': 'Post-purchase nurture; 30–45 day reorder nudge',
  };
  return m[segmentName] || 'Segment and personalize communications';
}
