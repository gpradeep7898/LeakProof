/**
 * LeakProof Revenue Leak Detector
 * Rule-based detection - never mention AI or prediction models
 * Each leak includes: estimated_monthly_loss, confidence_score, confidence_explanation, recommended_action
 */

import { query, queryOne, execute } from '../db';

export interface RevenueLeak {
  id?: string;
  store_id?: string;
  leak_type: string;
  title: string;
  description: string;
  estimated_monthly_loss: number;
  severity: 'high' | 'medium' | 'low';
  confidence_score: number;
  confidence_explanation: string;
  affected_customers_count?: number;
  affected_orders_count?: number;
  affected_sku_count?: number;
  recommended_action?: Record<string, unknown>;
  status?: string;
  created_at?: Date;
}

function confidenceFromData(
  dataPoints: number,
  consistency: number,
  revenueMagnitude: number
): { score: number; explanation: string } {
  const score = Math.min(0.95, 0.3 + (dataPoints / 100) * 0.2 + consistency * 0.3 + Math.min(revenueMagnitude / 5000, 0.2));
  return {
    score,
    explanation: `Based on ${dataPoints} order records and consistent patterns in the data.`,
  };
}

export class LeakDetector {
  private storeId: string

  constructor(storeId: string) {
    this.storeId = storeId
  }

  async detectAllLeaks(): Promise<RevenueLeak[]> {
    const storeId = this.storeId
    const results = await Promise.all([
      this.detectChurnLeaks(storeId),
      this.detectDiscountLeaks(storeId),
      this.detectProductLeaks(storeId),
      this.detectSkuFatigue(storeId),
      this.detectDiscountDependency(storeId),
      this.detectOneTimeBuyers(storeId),
    ]);

    const leaks = results.flat();

    for (const leak of leaks) {
      await this.persistLeak(storeId, leak);
    }

    return leaks.sort((a, b) => b.estimated_monthly_loss - a.estimated_monthly_loss);
  }

  private async persistLeak(storeId: string, leak: RevenueLeak) {
    const existing = await queryOne<{ leak_id: string }>(
      `SELECT leak_id FROM revenue_leaks WHERE store_id = $1 AND leak_type = $2 AND status = 'active'`,
      [storeId, leak.leak_type]
    );

    const recActionStr = leak.recommended_action
      ? (typeof leak.recommended_action === 'string'
          ? leak.recommended_action
          : JSON.stringify(leak.recommended_action))
      : null;
    const recActionJson = leak.recommended_action && typeof leak.recommended_action === 'object'
      ? leak.recommended_action
      : {};

    if (existing) {
      await execute(
        `UPDATE revenue_leaks SET
          title = $1, description = $2, estimated_monthly_loss = $3, severity = $4,
          confidence_score = $5, confidence_explanation = $6, recommended_action = $7,
          recommended_action_json = $8, affected_count = $9, affected_customers_count = $10,
          affected_orders_count = $11, affected_sku_count = $12, updated_at = NOW()
        WHERE leak_id = $13`,
        [
          leak.title,
          leak.description,
          leak.estimated_monthly_loss,
          leak.severity,
          leak.confidence_score,
          leak.confidence_explanation,
          recActionStr,
          recActionJson,
          leak.affected_customers_count ?? 0,
          leak.affected_customers_count ?? 0,
          leak.affected_orders_count ?? 0,
          leak.affected_sku_count ?? 0,
          existing.leak_id,
        ]
      );
    } else {
      await execute(
        `INSERT INTO revenue_leaks (
          store_id, leak_type, title, description, estimated_monthly_loss, severity,
          confidence_score, confidence_explanation, recommended_action, recommended_action_json,
          affected_count, affected_customers_count, affected_orders_count, affected_sku_count, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')`,
        [
          storeId,
          leak.leak_type,
          leak.title,
          leak.description,
          leak.estimated_monthly_loss,
          leak.severity,
          leak.confidence_score,
          leak.confidence_explanation,
          recActionStr,
          recActionJson,
          leak.affected_customers_count ?? 0,
          leak.affected_customers_count ?? 0,
          leak.affected_orders_count ?? 0,
          leak.affected_sku_count ?? 0,
        ]
      );
    }
  }

  private async detectChurnLeaks(storeId: string): Promise<RevenueLeak[]> {
    const leaks: RevenueLeak[] = [];
    const orderCount = await queryOne<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM orders WHERE store_id = $1',
      [storeId]
    );
    const n = parseInt(orderCount?.cnt || '0', 10);

    const vipChurned = await query<{
      customer_id: string;
      total_spend: string;
      order_count: string;
    }>(`
      WITH cust AS (
        SELECT customer_id, SUM(COALESCE(total_price, order_value, 0)) as total_spend, COUNT(*) as order_count
        FROM orders WHERE store_id = $1 GROUP BY customer_id
      ),
      vip_threshold AS (
        SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY total_spend) as t FROM cust
      )
      SELECT customer_id, total_spend::text, order_count::text
      FROM cust
      WHERE total_spend >= (SELECT t FROM vip_threshold)
        AND customer_id IN (
          SELECT customer_id FROM orders WHERE store_id = $1
          GROUP BY customer_id
          HAVING MAX(COALESCE(created_at, order_date::timestamptz)) < NOW() - INTERVAL '60 days'
        )
    `, [storeId]);

    if (vipChurned.length > 0) {
      const avgAov = vipChurned.reduce((s, c) => s + parseFloat(c.total_spend || '0') / Math.max(parseInt(c.order_count || '1', 10), 1), 0) / vipChurned.length;
      const monthlyLoss = vipChurned.length * avgAov * 0.3;
      const { score, explanation } = confidenceFromData(n, 0.8, monthlyLoss);
      leaks.push({
        leak_type: 'vip_churn',
        title: 'High-Value Customers Stopped Ordering',
        description: `${vipChurned.length} high-value customers haven't ordered in 60+ days.`,
        estimated_monthly_loss: monthlyLoss,
        severity: 'high',
        confidence_score: score,
        confidence_explanation: explanation,
        affected_customers_count: vipChurned.length,
        recommended_action: { type: 'winback_campaign', target: 'vip_churned', offer: 'personalized_incentive' },
      });
    }

    return leaks;
  }

  private async detectOneTimeBuyers(storeId: string): Promise<RevenueLeak[]> {
    const orderCount = await queryOne<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM orders WHERE store_id = $1',
      [storeId]
    );
    const n = parseInt(orderCount?.cnt || '0', 10);

    const oneTime = await query<{ customer_id: string; total_revenue: string }>(`
      SELECT customer_id, SUM(COALESCE(total_price, order_value, 0))::text as total_revenue
      FROM orders WHERE store_id = $1
      GROUP BY customer_id
      HAVING COUNT(*) = 1 AND MIN(COALESCE(created_at, order_date::timestamptz)) < NOW() - INTERVAL '45 days'
    `, [storeId]);

    const totalValue = oneTime.reduce((s, c) => s + parseFloat(c.total_revenue || '0'), 0);
    const estimatedLoss = oneTime.length > 10 ? (totalValue * 0.3) / 3 : 0;

    if (estimatedLoss > 0) {
      const { score, explanation } = confidenceFromData(n, 0.7, estimatedLoss);
      return [{
        leak_type: 'one_time_buyers',
        title: 'One-Time Buyers Never Returned',
        description: `${oneTime.length} customers bought once 45+ days ago and haven't returned.`,
        estimated_monthly_loss: estimatedLoss,
        severity: 'medium',
        confidence_score: score,
        confidence_explanation: explanation,
        affected_customers_count: oneTime.length,
        recommended_action: { type: 'reorder_campaign', timing: '30_45_days_after_first_order' },
      }];
    }
    return [];
  }

  private async detectDiscountLeaks(storeId: string): Promise<RevenueLeak[]> {
    const orderCount = await queryOne<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM orders WHERE store_id = $1',
      [storeId]
    );
    const n = parseInt(orderCount?.cnt || '0', 10);

    const vipDiscount = await queryOne<{ wasted: string; order_count: string }>(`
      SELECT
        COALESCE(SUM(o.total_discounts), SUM(o.discount_amount), 0)::text as wasted,
        COUNT(*)::text as order_count
      FROM orders o
      JOIN customers c ON c.customer_id = o.customer_id AND c.store_id = o.store_id
      WHERE o.store_id = $1 AND c.segment = 'VIP'
        AND (COALESCE(o.total_discounts, o.discount_amount, 0) > 0)
        AND COALESCE(o.created_at, o.order_date::timestamptz) >= NOW() - INTERVAL '30 days'
    `, [storeId]);

    const wasted = parseFloat(vipDiscount?.wasted || '0');
    if (wasted < 50) return [];

    const { score, explanation } = confidenceFromData(n, 0.9, wasted);
    return [{
      leak_type: 'vip_discount_waste',
      title: 'Discounts on Full-Price Loyal Customers',
      description: `$${Math.round(wasted).toLocaleString()} in discounts given to VIPs who would buy without them.`,
      estimated_monthly_loss: wasted,
      severity: wasted > 2000 ? 'high' : 'medium',
      confidence_score: score,
      confidence_explanation: explanation,
      affected_orders_count: parseInt(vipDiscount?.order_count || '0', 10),
      recommended_action: { type: 'exclude_vip_from_discounts', implementation: 'cart_validation' },
    }];
  }

  private async detectProductLeaks(storeId: string): Promise<RevenueLeak[]> {
    const products = await query<{
      product_id: string;
      product_name: string;
      avg_selling_price: string;
      total_sold: string;
      repurchase_rate: string;
    }>(`
      SELECT product_id, COALESCE(product_name, product_id) as product_name,
        COALESCE(avg_selling_price, price, 0)::text as avg_selling_price,
        COALESCE(total_sold, 0)::text as total_sold,
        COALESCE(repurchase_rate, 0)::text as repurchase_rate
      FROM products WHERE store_id = $1 AND COALESCE(total_sold, 0) > 0
    `, [storeId]);

    // High first purchase, low repeat
    const highFirstLowRepeat = products.filter(
      (p) => parseInt(p.total_sold, 10) > 20 && parseFloat(p.repurchase_rate) < 10
    );

    if (highFirstLowRepeat.length > 0) {
      const avgRevenue = highFirstLowRepeat.reduce(
        (s, p) => s + parseFloat(p.avg_selling_price) * parseInt(p.total_sold, 10),
        0
      ) / highFirstLowRepeat.length;
      const monthlyLoss = (avgRevenue * 0.2 * highFirstLowRepeat.length) / 6;
      return [{
        leak_type: 'product_low_repeat',
        title: 'Products with High First Purchase but Low Repeat',
        description: `${highFirstLowRepeat.length} SKUs have strong initial demand but customers don't repurchase.`,
        estimated_monthly_loss: monthlyLoss,
        severity: 'medium',
        confidence_score: 0.75,
        confidence_explanation: 'Based on order history and repeat purchase patterns across products.',
        affected_sku_count: highFirstLowRepeat.length,
        recommended_action: { type: 'bundle_or_variety', mitigation: 'subscription_skip_option' },
      }];
    }
    return [];
  }

  private async detectSkuFatigue(storeId: string): Promise<RevenueLeak[]> {
    const fatigue = await query<{
      product_id: string;
      product_name: string;
      churn_correlation: string;
      total_sold: string;
    }>(`
      SELECT product_id, COALESCE(product_name, product_id) as product_name,
        COALESCE(churn_correlation, 0)::text as churn_correlation,
        COALESCE(total_sold, 0)::text as total_sold
      FROM products
      WHERE store_id = $1 AND COALESCE(churn_correlation, 0) > 0.7 AND COALESCE(total_sold, 0) > 20
    `, [storeId]);

    if (fatigue.length > 0) {
      return [{
        leak_type: 'sku_fatigue',
        title: 'Products Causing Customer Churn',
        description: `${fatigue.length} items show high churn correlation—customers stop buying after cycle 2 or 3.`,
        estimated_monthly_loss: fatigue.length * 50,
        severity: 'medium',
        confidence_score: 0.65,
        confidence_explanation: 'Based on repeat purchase drop-off and cycle analysis.',
        affected_sku_count: fatigue.length,
        recommended_action: { type: 'bundle_or_skip', implementation: 'frequency_change', options: ['skip_option', 'variety_pack'] },
      }];
    }
    return [];
  }

  private async detectDiscountDependency(storeId: string): Promise<RevenueLeak[]> {
    const orderCount = await queryOne<{ cnt: string }>(
      'SELECT COUNT(*)::text as cnt FROM orders WHERE store_id = $1',
      [storeId]
    );
    const n = parseInt(orderCount?.cnt || '0', 10);

    const dependent = await queryOne<{ user_count: string; revenue: string }>(`
      WITH cust AS (
        SELECT customer_id,
          COUNT(*) as total_orders,
          SUM(CASE WHEN COALESCE(total_discounts, discount_amount, 0) > 0 THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(*), 0) as discount_pct,
          SUM(COALESCE(total_price, order_value, 0)) as total_revenue
        FROM orders WHERE store_id = $1
        GROUP BY customer_id HAVING COUNT(*) >= 3
      )
      SELECT COUNT(*)::text as user_count, COALESCE(SUM(total_revenue), 0)::text as revenue
      FROM cust WHERE discount_pct > 0.7
    `, [storeId]);

    const userCount = parseInt(dependent?.user_count || '0', 10);
    if (userCount === 0) return [];

    const revenueAtRisk = parseFloat(dependent?.revenue || '0');
    const monthlyLoss = revenueAtRisk * 0.2 * 0.3;

    const { score, explanation } = confidenceFromData(n, 0.8, monthlyLoss);
    return [{
      leak_type: 'discount_dependency',
      title: 'Customers Trained to Wait for Sale',
      description: `${userCount} repeat buyers use discounts on >70% of orders.`,
      estimated_monthly_loss: monthlyLoss,
      severity: 'medium',
      confidence_score: score,
      confidence_explanation: explanation,
      affected_customers_count: userCount,
      recommended_action: { type: 'reduce_frequency', implementation: 'exclude_from_broad_sales' },
    }];
  }
}
