/**
 * Sync API Routes
 * POST /api/v1/sync/all — Full Shopify sync
 * POST /api/v1/sync/orders
 * POST /api/v1/sync/customers
 * POST /api/v1/sync/products
 */
import { NextRequest, NextResponse } from 'next/server'
import { ShopifyDataSync } from '@/lib/services/shopifySync'
import { queryOne } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { rateLimit } from '@/lib/rate-limit'
import { billingGuard } from '@/lib/billing'

export const dynamic = 'force-dynamic'

async function getStoreWithShopify(storeId: string) {
    const row = await queryOne<{
        store_id: string
        shopify_domain: string
    }>(`
    SELECT store_id, shopify_domain
    FROM stores WHERE store_id = $1
  `, [storeId])
    if (!row) return null
    const { getStoreAccessToken } = await import('@/lib/shop-token')
    return { ...row, shopify_access_token: await getStoreAccessToken(storeId) }
}

export async function POST(req: NextRequest, { params }: { params: { resource: string } }) {
    try {
        const storeId = await getStoreFromRequest(req)
        const store = await getStoreWithShopify(storeId)
    const billingRes = await billingGuard(storeId)
    if (billingRes) return billingRes
    const rlRes = await rateLimit(storeId, { scope: 'shopify-sync', limit: 4, windowSec: 300 })
    if (rlRes) return rlRes

        if (!store?.shopify_access_token) {
            return NextResponse.json({
                error: 'Shopify not connected',
                message: 'Connect your Shopify store first to sync data',
                setup_url: '/api/auth/shopify',
            }, { status: 400 })
        }

        const sync = new ShopifyDataSync(storeId, store.shopify_domain, store.shopify_access_token)
        const resource = params.resource

        let result

        if (resource === 'all') {
            result = await sync.syncAll(180)
        } else if (resource === 'orders') {
            const body = await req.json().catch(() => ({}))
            result = { orders: await sync.syncOrders(body.days || 180) }
        } else if (resource === 'customers') {
            result = { customers: await sync.syncCustomers() }
        } else if (resource === 'products') {
            result = { products: await sync.syncProducts() }
        } else {
            return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 })
        }

        return NextResponse.json({ success: true, result, synced_at: new Date().toISOString() })
    } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
        console.error('[Sync] Error:', err)
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
