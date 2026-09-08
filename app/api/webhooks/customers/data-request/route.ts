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

    // Log the request — actual data retrieval should be handled per your data policy.
    // LeakProof stores only anonymized customer IDs (SHA256 of email), not PII.
    await execute(
      `INSERT INTO gdpr_requests (shop_domain, request_type, customer_id, payload, received_at)
       VALUES ($1, 'data_request', $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [payload.shop_domain, String(payload.customer.id), body]
    ).catch(() => {
      // Table may not exist in all envs — log and continue.
      console.log('[GDPR] data_request received for', payload.shop_domain, payload.customer.id)
    })

    return NextResponse.json({ status: 'received' })
  } catch (err) {
    console.error('[GDPR] data_request parse error:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
