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
import { getStoreFromRequest } from '@/lib/store'

async function getStoreWithShopify(storeId: string) {
    return queryOne<{
        store_id: string
        shopify_domain: string
        shopify_access_token: string
    }>(`
    SELECT store_id, shopify_domain, shopify_access_token
    FROM stores WHERE store_id = $1
  `, [storeId])
}

export async function POST(req: NextRequest, { params }: { params: { resource: string } }) {
    try {
        const storeId = await getStoreFromRequest(req)
        const store = await getStoreWithShopify(storeId)

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
        console.error('[Sync] Error:', err)
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
