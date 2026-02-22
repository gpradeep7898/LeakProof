/**
 * Shopify Data Sync Service
 * Syncs orders, customers, and products from Shopify into PostgreSQL
 * Calculates true profit per order
 */

import { createShopifyClient, ShopifyOrder, ShopifyCustomer, ShopifyProduct } from '@/lib/shopify/client'
import { query, execute, queryOne } from '@/lib/db'
import { nanoid } from 'nanoid'

export interface ProfitCalculation {
    revenue: number
    cogs: number
    shippingCost: number
    discounts: number
    platformFees: number
    paymentFees: number
    adCost: number
    returnCost: number
    grossProfit: number
    netProfit: number
    profitMarginPct: number
}

interface ProductCogs {
    productId: string
    cogs: number
    shopifyProductId: string
}

export class ShopifyDataSync {
    private storeId: string
    private shopDomain: string
    private accessToken: string

    constructor(storeId: string, shopDomain: string, accessToken: string) {
        this.storeId = storeId
        this.shopDomain = shopDomain
        this.accessToken = accessToken
    }

    /**
     * Calculate true profit for an order
     * revenue - COGS - shipping - discounts - platform fees - payment fees - ad cost - returns
     */
    calculateOrderProfit(order: ShopifyOrder, productCogsMap: Map<string, number>, isFirstOrder: boolean, cac: number = 0): ProfitCalculation {
        const revenue = parseFloat(order.total_price || '0')
        const totalDiscounts = parseFloat(order.total_discounts || '0')

        // Calculate COGS from line items
        let cogs = 0
        for (const item of order.line_items) {
            const itemCogs = productCogsMap.get(String(item.product_id)) || 0
            cogs += item.quantity * itemCogs
        }

        // If no COGS data, estimate at 35% of revenue (industry average)
        if (cogs === 0 && revenue > 0) {
            cogs = revenue * 0.35
        }

        // Shipping cost (from shipping lines or estimate)
        let shippingCost = 0
        for (const line of order.shipping_lines) {
            shippingCost += parseFloat(line.price || '0')
        }
        // Estimate actual shipping cost (merchants typically pay more than they charge)
        shippingCost = Math.max(shippingCost, revenue * 0.04)

        // Platform fees (Shopify: 0-2.9% depending on plan, plus payment fees)
        const platformFeeRate = 0.015 // ~1.5% average
        const platformFees = revenue * platformFeeRate

        // Payment processing fees
        const gatewayRate = this.getGatewayRate(order.gateway)
        const paymentFees = revenue * gatewayRate + 0.30

        // Ad attribution cost: only for first orders (CAC)
        const adCost = isFirstOrder ? cac : 0

        // Return cost estimate (industry average ~2-8% depending on category)
        const returnCost = revenue * 0.03

        // Profit calculations
        const grossProfit = revenue - cogs
        const netProfit = grossProfit - shippingCost - totalDiscounts - platformFees - paymentFees - adCost - returnCost
        const profitMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0

        return {
            revenue,
            cogs,
            shippingCost,
            discounts: totalDiscounts,
            platformFees,
            paymentFees,
            adCost,
            returnCost,
            grossProfit,
            netProfit,
            profitMarginPct,
        }
    }

    private getGatewayRate(gateway: string): number {
        const rates: Record<string, number> = {
            'shopify_payments': 0.029,
            'paypal': 0.034,
            'stripe': 0.029,
            'klarna': 0.038,
            'afterpay': 0.04,
        }
        return rates[gateway?.toLowerCase()] || 0.029
    }

    /** Classify customer segment based on behavior */
    classifyCustomerSegment(totalOrders: number, totalRevenue: number, daysSinceLastOrder: number): string {
        if (totalOrders >= 3 && totalRevenue >= 500 && daysSinceLastOrder < 60) return 'vip'
        if (totalOrders >= 2 && daysSinceLastOrder < 60) return 'loyal'
        if (daysSinceLastOrder >= 60 && daysSinceLastOrder <= 90 && totalOrders >= 2) return 'at_risk'
        if (totalOrders === 1 && daysSinceLastOrder >= 45) return 'one_time'
        if (daysSinceLastOrder > 90) return 'lapsed'
        return 'new'
    }

    /** Calculate churn risk score (0-1) */
    calculateChurnRisk(totalOrders: number, daysSinceLastOrder: number, avgDaysBetweenOrders: number): number {
        if (totalOrders < 2) return 0.5 + Math.min(0.4, daysSinceLastOrder / 300)

        const overdueRatio = avgDaysBetweenOrders > 0
            ? daysSinceLastOrder / (avgDaysBetweenOrders * 1.5)
            : 1

        return Math.min(0.99, Math.max(0, overdueRatio * 0.8))
    }

    /** Sync orders from Shopify for the last N days */
    async syncOrders(timeframeDays: number = 180): Promise<{ synced: number; errors: number }> {
        const client = createShopifyClient(this.shopDomain, this.accessToken)
        const sinceDate = new Date()
        sinceDate.setDate(sinceDate.getDate() - timeframeDays)

        // Load product COGS map
        const products = await query<{ shopify_product_id: string; cogs: number }>(
            'SELECT shopify_product_id, cogs FROM products WHERE store_id = $1',
            [this.storeId]
        )
        const productCogsMap = new Map(products.map((p) => [p.shopify_product_id, Number(p.cogs)]))

        // Load existing customer order counts for first-order detection
        const customerOrders = await query<{ shopify_customer_id: string; total_orders: number }>(
            'SELECT shopify_customer_id, total_orders FROM customers WHERE store_id = $1',
            [this.storeId]
        )
        const customerOrderMap = new Map(customerOrders.map((c) => [c.shopify_customer_id, c.total_orders]))

        let synced = 0
        let errors = 0

        try {
            const orders = await client.getOrders(sinceDate)

            for (const order of orders) {
                try {
                    const customerId = order.customer?.id ? String(order.customer.id) : `anon_${order.id}`
                    const prevOrderCount = customerOrderMap.get(customerId) || 0
                    const isFirstOrder = prevOrderCount === 0
                    const cac = isFirstOrder ? 45 : 0 // estimated CAC

                    const profit = this.calculateOrderProfit(order, productCogsMap, isFirstOrder, cac)

                    await execute(`
            INSERT INTO orders (
              order_id, store_id, customer_id, order_date, order_value,
              discount_used, discount_amount, shopify_order_id,
              total_price, subtotal_price, total_tax,
              cogs, shipping_cost, total_discounts, platform_fees,
              payment_processing_fees, ad_attribution_cost, estimated_return_cost,
              gross_profit, net_profit, profit_margin_pct,
              is_repeat_customer, financial_status, fulfillment_status,
              currency, acquisition_channel, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
              $22, $23, $24, $25, $26, $27, NOW()
            )
            ON CONFLICT (order_id, store_id) DO UPDATE SET
              profit_margin_pct = EXCLUDED.profit_margin_pct,
              net_profit = EXCLUDED.net_profit,
              gross_profit = EXCLUDED.gross_profit,
              updated_at = NOW()
          `, [
                        String(order.id),
                        this.storeId,
                        customerId,
                        order.created_at,
                        profit.revenue,
                        order.discount_codes.length > 0,
                        profit.discounts,
                        String(order.id),
                        profit.revenue,
                        parseFloat(order.subtotal_price || '0'),
                        parseFloat(order.total_tax || '0'),
                        profit.cogs,
                        profit.shippingCost,
                        profit.discounts,
                        profit.platformFees,
                        profit.paymentFees,
                        profit.adCost,
                        profit.returnCost,
                        profit.grossProfit,
                        profit.netProfit,
                        profit.profitMarginPct,
                        !isFirstOrder,
                        order.financial_status,
                        order.fulfillment_status,
                        order.currency,
                        order.source_name || 'unknown',
                        order.created_at,
                    ])

                    synced++
                } catch (err) {
                    console.error(`Error syncing order ${order.id}:`, err)
                    errors++
                }
            }
        } catch (err) {
            console.error('Error fetching orders from Shopify:', err)
            throw err
        }

        return { synced, errors }
    }

    /** Sync customers and compute their metrics */
    async syncCustomers(): Promise<{ synced: number; errors: number }> {
        const client = createShopifyClient(this.shopDomain, this.accessToken)
        let synced = 0
        let errors = 0

        try {
            const customers = await client.getCustomers()

            for (const customer of customers) {
                try {
                    const totalOrders = customer.orders_count
                    const totalRevenue = parseFloat(customer.total_spent || '0')
                    const lastOrderId = customer.last_order_id ? String(customer.last_order_id) : null

                    // Get last order date from our DB
                    const lastOrder = await queryOne<{ order_date: string }>(
                        `SELECT order_date FROM orders WHERE store_id = $1 AND customer_id = $2 ORDER BY order_date DESC LIMIT 1`,
                        [this.storeId, String(customer.id)]
                    )

                    const lastOrderDate = lastOrder?.order_date ? new Date(lastOrder.order_date) : null
                    const daysSinceLast = lastOrderDate
                        ? Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
                        : 999

                    // Calculate avg days between orders from DB
                    const gapData = await queryOne<{ avg_gap: number }>(
                        `SELECT AVG(gap) as avg_gap FROM (
              SELECT EXTRACT(EPOCH FROM (order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date))) / 86400 AS gap
              FROM orders WHERE store_id = $1 AND customer_id = $2
            ) g WHERE gap IS NOT NULL`,
                        [this.storeId, String(customer.id)]
                    )
                    const avgDaysBetweenOrders = Math.round(gapData?.avg_gap || 0)

                    const segment = this.classifyCustomerSegment(totalOrders, totalRevenue, daysSinceLast)
                    const churnRisk = this.calculateChurnRisk(totalOrders, daysSinceLast, avgDaysBetweenOrders)
                    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
                    const ltv = totalRevenue // Simplified LTV
                    const cac = 45 // Default CAC estimate
                    const ltvCacRatio = cac > 0 ? ltv / cac : 0

                    await execute(`
            INSERT INTO customers (
              customer_id, store_id, shopify_customer_id,
              first_order_date, last_order_date, total_orders, total_revenue, total_spend,
              avg_order_value, lifetime_value, customer_acquisition_cost, ltv_cac_ratio,
              avg_days_between_orders, churn_risk_score, segment, days_since_last_order,
              accepts_marketing, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
            )
            ON CONFLICT (customer_id, store_id) DO UPDATE SET
              total_orders = EXCLUDED.total_orders,
              total_revenue = EXCLUDED.total_revenue,
              total_spend = EXCLUDED.total_spend,
              avg_order_value = EXCLUDED.avg_order_value,
              lifetime_value = EXCLUDED.lifetime_value,
              ltv_cac_ratio = EXCLUDED.ltv_cac_ratio,
              avg_days_between_orders = EXCLUDED.avg_days_between_orders,
              churn_risk_score = EXCLUDED.churn_risk_score,
              segment = EXCLUDED.segment,
              days_since_last_order = EXCLUDED.days_since_last_order,
              last_order_date = EXCLUDED.last_order_date,
              updated_at = NOW()
          `, [
                        String(customer.id),
                        this.storeId,
                        String(customer.id),
                        customer.created_at,
                        lastOrderDate?.toISOString() || customer.created_at,
                        totalOrders,
                        totalRevenue,
                        totalRevenue,
                        avgOrderValue,
                        ltv,
                        cac,
                        ltvCacRatio,
                        avgDaysBetweenOrders,
                        churnRisk,
                        segment,
                        daysSinceLast,
                        customer.accepts_marketing,
                        customer.created_at,
                    ])

                    synced++
                } catch (err) {
                    console.error(`Error syncing customer ${customer.id}:`, err)
                    errors++
                }
            }
        } catch (err) {
            console.error('Error fetching customers from Shopify:', err)
            throw err
        }

        return { synced, errors }
    }

    /** Sync products from Shopify */
    async syncProducts(): Promise<{ synced: number; errors: number }> {
        const client = createShopifyClient(this.shopDomain, this.accessToken)
        let synced = 0
        let errors = 0

        try {
            const products = await client.getProducts()

            for (const product of products) {
                try {
                    for (const variant of product.variants) {
                        const price = parseFloat(variant.price || '0')
                        // Estimate COGS at 35% of price if not set
                        const estimatedCogs = price * 0.35

                        await execute(`
              INSERT INTO products (
                product_id, store_id, shopify_product_id, title, sku,
                price, avg_selling_price, cogs, gross_margin_pct,
                current_inventory, is_active, vendor, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, NOW()
              )
              ON CONFLICT (product_id, store_id) DO UPDATE SET
                title = EXCLUDED.title,
                avg_selling_price = EXCLUDED.avg_selling_price,
                current_inventory = EXCLUDED.current_inventory,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            `, [
                            `${product.id}_${variant.id}`,
                            this.storeId,
                            String(product.id),
                            `${product.title} - ${variant.title}`,
                            variant.sku || '',
                            price,
                            price,
                            estimatedCogs,
                            price > 0 ? ((price - estimatedCogs) / price * 100) : 0,
                            variant.inventory_quantity || 0,
                            product.vendor || '',
                            product.created_at,
                        ])

                        synced++
                    }
                } catch (err) {
                    console.error(`Error syncing product ${product.id}:`, err)
                    errors++
                }
            }
        } catch (err) {
            console.error('Error fetching products from Shopify:', err)
            throw err
        }

        return { synced, errors }
    }

    /** Sync all data in sequence */
    async syncAll(timeframeDays: number = 180): Promise<{
        products: { synced: number; errors: number }
        orders: { synced: number; errors: number }
        customers: { synced: number; errors: number }
    }> {
        console.log(`[ShopifySync] Starting full sync for store ${this.storeId}`)
        const products = await this.syncProducts()
        console.log(`[ShopifySync] Products: ${products.synced} synced, ${products.errors} errors`)
        const orders = await this.syncOrders(timeframeDays)
        console.log(`[ShopifySync] Orders: ${orders.synced} synced, ${orders.errors} errors`)
        const customers = await this.syncCustomers()
        console.log(`[ShopifySync] Customers: ${customers.synced} synced, ${customers.errors} errors`)
        return { products, orders, customers }
    }
}
