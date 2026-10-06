/**
 * GDPR: customers/data_request
 * Shopify sends this when a customer requests their data.
 * We must respond 200 quickly; any real data retrieval is async.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/auth/session-token'
import { execute } from '@/lib/db'

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
      orders_requested: number[]
    }

    // Record metadata ONLY — never the raw payload (it contains customer PII).
    // Data retrieval for the requester is handled async per the privacy policy.
    await execute(
      `INSERT INTO gdpr_requests (shop_domain, request_type, customer_id, status)
       VALUES ($1, 'data_request', $2, 'received')
       ON CONFLICT DO NOTHING`,
      [payload.shop_domain, String(payload.customer.id)]
    ).catch((e) => {
      console.error('[GDPR] data_request log failed:', e)
    })

    return NextResponse.json({ status: 'received' })
  } catch (err) {
    console.error('[GDPR] data_request parse error:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
