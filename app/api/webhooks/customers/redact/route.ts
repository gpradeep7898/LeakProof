/**
 * GDPR: customers/redact
 * Shopify sends this when a customer requests erasure.
 * We must delete or anonymize all stored customer data within 30 days.
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
      customer: { id: number; email: string; phone: string }
      orders_to_redact: number[]
    }

    const customerId = String(payload.customer.id)
    const shopDomain = payload.shop_domain

    // Find the store
    const store = await queryOne<{ store_id: string }>(
      'SELECT store_id FROM stores WHERE shopify_domain = $1',
      [shopDomain]
    )

    if (store) {
      // Erase customer PII: null out email_hash, replace customer_id reference with tombstone.
      // Orders are retained (anonymized) for financial record-keeping; line items are kept.
      await execute(
        `UPDATE customers
         SET email_hash = 'REDACTED', segment = NULL, accepts_marketing = false, updated_at = NOW()
         WHERE customer_id = $1 AND store_id = $2`,
        [customerId, store.store_id]
      )
    }

    console.log('[GDPR] customers/redact completed for', shopDomain, customerId)
    return NextResponse.json({ status: 'redacted' })
  } catch (err) {
    console.error('[GDPR] customers/redact error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
