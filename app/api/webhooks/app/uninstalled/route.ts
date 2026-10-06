import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/auth/session-token'
import { pool } from '@/lib/db'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256')

  if (!await verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain')
  if (!shopDomain) {
    return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 })
  }

  try {
    // Mark the store as uninstalled. Shopify auto-cancels the app subscription
    // on uninstall; we record it so billing state stays truthful.
    // Full data deletion happens 48h later via shop/redact.
    await pool.query(
      `UPDATE stores SET shopify_access_token = NULL, shopify_access_token_iv = NULL,
              uninstalled_at = NOW(), billing_status = 'cancelled', updated_at = NOW()
       WHERE shopify_domain = $1`,
      [shopDomain]
    )
    await pool.query(
      `UPDATE app_subscriptions SET status = 'cancelled', updated_at = NOW()
       WHERE store_id IN (SELECT store_id FROM stores WHERE shopify_domain = $1)
         AND status = 'active'`,
      [shopDomain]
    )
  } catch (err) {
    console.error('[webhook:app/uninstalled] DB error:', err)
  }

  return NextResponse.json({ received: true })
}
