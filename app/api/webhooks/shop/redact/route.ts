/**
 * GDPR: shop/redact
 * Shopify sends this 48 hours after a merchant uninstalls the app.
 * We must delete all data for the shop within 30 days.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/auth/session-token'
import { queryOne, execute } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const hmac = req.headers.get('X-Shopify-Hmac-Sha256')

  if (!(await verifyWebhookHmac(body, hmac))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = JSON.parse(body) as {
      shop_id: number
      shop_domain: string
    }

    const shopDomain = payload.shop_domain
    const store = await queryOne<{ store_id: string }>(
      'SELECT store_id FROM stores WHERE shopify_domain = $1',
      [shopDomain]
    )

    if (store) {
      const storeId = store.store_id
      // Delete in dependency order — every table that holds this shop's data.
      const tables = [
        'segment_members',
        'customer_segments',
        'churn_predictions',
        'revenue_leaks',
        'actions',
        'action_snapshots',
        'order_items',
        'orders',
        'products',
        'product_intelligence',
        'customers',
        'computed_metrics',
        'import_rows',
        'import_jobs',
        'gdpr_requests',
        'app_subscriptions',
      ]
      for (const t of tables) {
        const col = t === 'gdpr_requests' ? 'shop_domain' : 'store_id'
        const val = t === 'gdpr_requests' ? shopDomain : storeId
        await execute(`DELETE FROM ${t} WHERE ${col} = $1`, [val])
      }
      await execute('DELETE FROM stores WHERE store_id = $1', [storeId])
    }

    console.log('[GDPR] shop/redact completed for', shopDomain)
    return NextResponse.json({ status: 'redacted' })
  } catch (err) {
    console.error('[GDPR] shop/redact error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
