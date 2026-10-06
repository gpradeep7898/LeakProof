import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/auth/session-token'
import { sha256Hex } from '@/lib/crypto'
import { pool } from '@/lib/db'

type ShopifyOrder = {
  id: number
  name: string
  email?: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  subtotal_price: string
  total_discounts: string
  customer?: { id: number; email?: string }
  line_items: Array<{
    product_id: number
    variant_id: number
    quantity: number
    price: string
    sku: string
    name: string
    title: string
    total_discount: string
    vendor: string
  }>
}

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

  let order: ShopifyOrder
  try {
    order = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const storeRes = await pool.query(
      'SELECT store_id FROM stores WHERE shopify_domain = $1',
      [shopDomain]
    )
    if (storeRes.rowCount === 0) {
      return NextResponse.json({ received: true })
    }
    const storeId = storeRes.rows[0].store_id

    // Upsert the order (idempotent — webhook can fire multiple times)
    await pool.query(
      `INSERT INTO orders (
        store_id, shopify_order_id, order_number, email_hash,
        created_at, financial_status, fulfillment_status,
        total_price, subtotal_price, total_discounts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (store_id, shopify_order_id) DO UPDATE SET
        financial_status = EXCLUDED.financial_status,
        fulfillment_status = EXCLUDED.fulfillment_status,
        total_price = EXCLUDED.total_price`,
      [
        storeId,
        String(order.id),
        order.name,
        // One-way hash only — base64 is reversible encoding, not anonymization.
        order.customer?.email ? sha256Hex(order.customer.email.toLowerCase().trim()) : null,
        order.created_at,
        order.financial_status,
        order.fulfillment_status,
        parseFloat(order.total_price),
        parseFloat(order.subtotal_price),
        parseFloat(order.total_discounts),
      ]
    )
  } catch (err) {
    console.error('[webhook:orders/create] DB error:', err)
  }

  return NextResponse.json({ received: true })
}
