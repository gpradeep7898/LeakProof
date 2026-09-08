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
      // Delete in dependency order
      await execute('DELETE FROM segment_members WHERE store_id = $1', [storeId])
      await execute('DELETE FROM customer_segments WHERE store_id = $1', [storeId])
      await execute('DELETE FROM churn_predictions WHERE store_id = $1', [storeId])
      await execute('DELETE FROM revenue_leaks WHERE store_id = $1', [storeId])
      await execute('DELETE FROM actions WHERE store_id = $1', [storeId])
      await execute('DELETE FROM order_items WHERE store_id = $1', [storeId])
      await execute('DELETE FROM orders WHERE store_id = $1', [storeId])
      await execute('DELETE FROM products WHERE store_id = $1', [storeId])
      await execute('DELETE FROM customers WHERE store_id = $1', [storeId])
      await execute('DELETE FROM computed_metrics WHERE store_id = $1', [storeId])
      await execute('DELETE FROM stores WHERE store_id = $1', [storeId])
    }

    console.log('[GDPR] shop/redact completed for', shopDomain)
    return NextResponse.json({ status: 'redacted' })
  } catch (err) {
    console.error('[GDPR] shop/redact error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
