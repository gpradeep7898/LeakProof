/**
 * Webhook: app_subscriptions/update
 * Shopify notifies us when a subscription is approved, cancelled, expired, etc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/auth/session-token'
import { queryOne } from '@/lib/db'
import { recordSubscriptionStatus } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const hmac = req.headers.get('X-Shopify-Hmac-Sha256')

  if (!(await verifyWebhookHmac(body, hmac))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = JSON.parse(body) as {
      app_subscription: { id: string; status: string; name: string }
      shop_domain?: string
    }
    const shopDomain =
      payload.shop_domain ?? req.headers.get('X-Shopify-Shop-Domain') ?? ''

    const store = await queryOne<{ store_id: string }>(
      'SELECT store_id FROM stores WHERE shopify_domain = $1',
      [shopDomain]
    )
    if (store) {
      await recordSubscriptionStatus(
        store.store_id,
        payload.app_subscription.id,
        payload.app_subscription.status
      )
      console.log(
        '[billing] subscription update:',
        shopDomain,
        payload.app_subscription.status
      )
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[billing] subscriptions/update error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
