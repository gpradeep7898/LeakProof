import { query, queryOne } from '../db';

export interface OrderProfit {
    order_id: string;
    revenue: number;
    cogs: number;
    shipping_cost: number;
    discounts: number;
    platform_fees: number;
    payment_fees: number;
    ad_cost: number;
    return_cost: number;
    gross_profit: number;
    net_profit: number;
    profit_margin_pct: number;
}

export class ProfitCalculator {

    /**
     * Calculate true profit for an order
     * Goes beyond revenue to subtract ALL costs
     */
    async calculateOrderProfit(shopifyOrder: any): Promise<OrderProfit> {

        // Ensure numbers
        const revenue = parseFloat(shopifyOrder.total_price || '0');

        // 1. COGS (Cost of Goods Sold)
        const cogs = await this.calculateCOGS(shopifyOrder.line_items, shopifyOrder.store_id);

        // 2. Shipping costs (actual cost, not what customer paid)
        const shippingCost = await this.calculateShippingCost(shopifyOrder);

        // 3. Discounts applied
        const discounts = parseFloat(shopifyOrder.total_discounts || '0');

        // 4. Platform fees (Shopify charges 2.9% + $0.30 per transaction approx)
        // In reality, this should be configurable per store
        const platformFees = (revenue * 0.029) + 0.30;

        // 5. Payment processing (varies by gateway)
        const paymentFees = await this.calculatePaymentFees(shopifyOrder);

        // 6. Ad attribution cost
        const adCost = await this.attributeAdCost(shopifyOrder);

        // 7. Estimated return cost (based on product return rates)
        const returnCost = await this.estimateReturnCost(shopifyOrder);

        // Calculate profit
        const grossProfit = revenue - cogs;
        const netProfit = grossProfit - shippingCost - discounts - platformFees - paymentFees - adCost - returnCost;
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        return {
            order_id: shopifyOrder.id,
            revenue,
            cogs,
            shipping_cost: shippingCost,
            discounts,
            platform_fees: platformFees,
            payment_fees: paymentFees,
            ad_cost: adCost,
            return_cost: returnCost,
            gross_profit: grossProfit,
            net_profit: netProfit,
            profit_margin_pct: profitMargin
        };
    }

    /**
     * Calculate COGS from line items
     */
    private async calculateCOGS(lineItems: any[], storeId: string): Promise<number> {
        let totalCOGS = 0;

        for (const item of lineItems) {
            // Get product COGS from database
            // Assuming product_id in line item maps to our products table
            const product = await queryOne<{ cogs: number }>(
                `SELECT cogs FROM products WHERE shopify_product_id = $1 AND store_id = $2`,
                [item.product_id, storeId]
            );

            const itemCOGS = product?.cogs ? Number(product.cogs) : 0;
            totalCOGS += itemCOGS * (item.quantity || 1);
        }

        return totalCOGS;
    }

    /**
     * Calculate actual shipping cost (not customer payment)
     */
    private async calculateShippingCost(order: any): Promise<number> {
        // If you have shipping integration (ShipStation, etc), pull actual cost
        // Otherwise estimate based on weight/zone
        const weight = this.calculateOrderWeight(order.line_items);
        const destination = order.shipping_address?.country_code;

        return this.estimateShippingCost(weight, destination);
    }

    private calculateOrderWeight(lineItems: any[]): number {
        // Placeholder: sum of grams
        return lineItems?.reduce((sum: number, item: any) => sum + (item.grams || 0), 0) || 0;
    }

    private estimateShippingCost(weight: number, countryCode: string): number {
        // Simple estimation logic
        const baseRate = 5.00;
        const weightRate = (weight / 1000) * 2; // $2 per kg
        const internationalSurcharge = countryCode === 'US' ? 0 : 10.00; // Assuming US store
        return baseRate + weightRate + internationalSurcharge;
    }

    private async calculatePaymentFees(order: any): Promise<number> {
        // Placeholder
        return 0;
    }

    /**
     * Attribution model: assign ad cost to orders
     */
    private async attributeAdCost(order: any): Promise<number> {
        // In a real app, we'd query the customer table
        if (!order.customer) return 0;

        const customer = await queryOne<{ total_orders: number, customer_acquisition_cost: number }>(
            `SELECT total_orders, customer_acquisition_cost FROM customers WHERE shopify_customer_id = $1 AND store_id = $2`,
            [order.customer.id, order.store_id]
        );

        // Use customer CAC for first order
        if (customer && customer.total_orders <= 1) {
            return Number(customer.customer_acquisition_cost) || 0;
        }

        // Repeat orders have lower/no ad cost for now
        return 0;
    }

    /**
     * Estimate return cost based on product return rates
     */
    private async estimateReturnCost(order: any): Promise<number> {
        let returnCost = 0;

        for (const item of order.line_items) {
            // We'd ideally fetch return_rate from product_metrics or similar
            // For now, use a default if not in DB
            const product = await queryOne<{ return_rate: number }>( // Assuming we might add return_rate to products
                `SELECT 0.05 as return_rate FROM products WHERE shopify_product_id = $1 AND store_id = $2`,
                [item.product_id, order.store_id]
            );

            const returnRate = product?.return_rate || 0.05; // 5% default
            const itemCost = parseFloat(item.price) * item.quantity;

            returnCost += itemCost * returnRate;
        }

        return returnCost;
    }

    /**
     * Calculate profit by different dimensions
     */
    async calculateProfitByDimension(merchantId: string, dimension: 'product' | 'customer' | 'channel' | 'cohort', timeframe: number = 30): Promise<any> {

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);

        // SQL queries for aggregation
        switch (dimension) {
            case 'product':
                return await query(`
            SELECT 
                COALESCE(p.product_name, p.product_id) as product_name,
                SUM(COALESCE(oi.line_total, oi.quantity * oi.line_price)) as revenue,
                SUM(COALESCE(oi.line_total, oi.quantity * oi.line_price) - (COALESCE(p.cogs, 0) * oi.quantity)) as gross_profit
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id AND o.store_id = oi.store_id
            JOIN products p ON p.product_id = oi.product_id AND p.store_id = oi.store_id
            WHERE o.store_id = $1 AND COALESCE(o.created_at, o.order_date::timestamptz, o.created_at_orders) >= $2
            GROUP BY p.product_name, p.product_id
            ORDER BY gross_profit DESC
        `, [merchantId, startDate]);
            case 'customer':
                return await query(`
            SELECT 
                c.customer_id,
                SUM(COALESCE(o.net_profit, o.total_price - o.refunded_amount - o.total_discounts)) as total_profit
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id AND c.store_id = o.store_id
            WHERE o.store_id = $1 AND COALESCE(o.created_at, o.order_date::timestamptz, o.created_at_orders) >= $2
            GROUP BY c.customer_id
            ORDER BY total_profit DESC
         `, [merchantId, startDate]);
            // Implement others mainly
            default:
                return [];
        }
    }

    async getProfitSummary(merchantId: string, timeframe: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);

        const result = await queryOne<{
            total_revenue: number,
            total_net_profit: number,
            total_cogs: number,
            total_shipping: number,
            total_discounts: number,
            total_fees: number,
            total_ads: number,
            total_returns: number,
            order_count: number
        }>(`
        SELECT 
            SUM(COALESCE(total_price, order_value, 0)) as total_revenue,
            SUM(COALESCE(net_profit, COALESCE(total_price, order_value, 0) - COALESCE(total_discounts, discount_amount, 0) - COALESCE(refunded_amount, 0))) as total_net_profit,
            COALESCE(SUM(cogs), 0) as total_cogs,
            COALESCE(SUM(shipping_cost), 0) as total_shipping,
            COALESCE(SUM(total_discounts), SUM(discount_amount), 0) as total_discounts,
            COALESCE(SUM(platform_fees), 0) + COALESCE(SUM(payment_processing_fees), 0) as total_fees,
            COALESCE(SUM(ad_attribution_cost), 0) as total_ads,
            COALESCE(SUM(estimated_return_cost), 0) as total_returns,
            COUNT(*)::int as order_count
        FROM orders
        WHERE store_id = $1
          AND COALESCE(created_at, order_date::timestamptz, created_at_orders) >= $2
      `, [merchantId, startDate]);

        return result;
    }
}
