import { Pool } from 'pg'
import { parse } from 'csv-parse/sync'
import { nanoid } from 'nanoid'
import { runFullPipeline } from './pipeline'

/** Normalize column name */
function norm(col: string): string {
  return col.toLowerCase().trim().replace(/\s+/g, '_').replace(/'/g, '')
}

/** Parse CSV buffer to rows with normalized keys */
function parseCSVRows(buffer: Buffer): Record<string, string>[] {
  const str = buffer.toString('utf-8')
  const rows = parse(str, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[]
  return rows.map((r) => {
    const out: Record<string, string> = {}
    Object.entries(r).forEach(([k, v]) => {
      if (v !== undefined && v !== null) out[norm(k)] = String(v).trim()
    })
    return out
  })
}

/** Get value from row with flexible column names */
function get(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[norm(c)] ?? row[c]
    if (v) return v
  }
  return ''
}

function toDate(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function toBool(s: string): boolean {
  if (!s) return false
  const v = String(s).toLowerCase()
  return v === 'true' || v === 'yes' || v === '1' || v === 'y'
}

/** Hash for anonymization - use first 8 chars of simple hash */
function anonymizeId(val: string): string {
  if (!val) return `C${nanoid(8)}`
  let h = 0
  for (let i = 0; i < val.length; i++) {
    h = (h << 5) - h + val.charCodeAt(i)
    h |= 0
  }
  return `C${Math.abs(h).toString(16).slice(0, 8).toUpperCase()}`
}

/** Single denormalized CSV: order_id, customer_id/email, order_date, order_value, product_id, product_name, etc. */
export async function ingestDenormalizedCSV(
  buffer: Buffer,
  storeId: string
): Promise<{ customers: number; orders: number; products: number; orderItems: number }> {
  const rows = parseCSVRows(buffer)
  if (rows.length === 0) throw new Error('CSV is empty')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Clear existing data for this store (order matters: delete children before parents due to FKs)
    await client.query('DELETE FROM order_items WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM orders WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM segment_members WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM customer_segments WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM product_intelligence WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM churn_predictions WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM actions WHERE store_id = $1', [storeId]) // must run before revenue_leaks (actions.leak_id FK)
    await client.query('DELETE FROM revenue_leaks WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM computed_metrics WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM customers WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM products WHERE store_id = $1', [storeId])

    const customersMap = new Map<string, { first: string; last: string; orderIds: Set<string>; spend: number }>()
    const productsMap = new Map<string, { name: string; category: string; price: number }>()
    const ordersMap = new Map<string, { customerId: string; date: string; value: number; discountUsed: boolean; discountAmount: number; isSub: boolean }>()
    const orderItemsMap = new Map<string, { orderId: string; productId: string; qty: number; lineTotal: number }>()

    for (const row of rows) {
      const orderId = get(row, 'order_id', 'orderid', 'order')
      const custRaw = get(row, 'customer_id', 'customerid', 'email', 'customer_email')
      const customerId = custRaw ? anonymizeId(custRaw) : `C${nanoid(8)}`
      const orderDate = toDate(get(row, 'order_date', 'orderdate', 'date', 'created_at'))
      const orderValue = toNum(get(row, 'order_value', 'ordervalue', 'total', 'total_price', 'totalprice', 'subtotal'))
      const discountUsed = toBool(get(row, 'discount_used', 'discountused', 'had_discount'))
      const discountAmount = toNum(get(row, 'discount_amount', 'discountamount'))
      const isSub = toBool(get(row, 'is_subscription', 'issubscription', 'subscription'))
      const productId = get(row, 'product_id', 'productid', 'sku', 'variant_id')
      const productName = get(row, 'product_name', 'productname', 'title', 'name')
      const category = get(row, 'category')
      const price = toNum(get(row, 'price', 'unit_price', 'unitprice'))
      const quantity = toNum(get(row, 'quantity', 'qty'))
      const lineTotal = toNum(get(row, 'line_total', 'linetotal', 'line_total_price'))

      if (!orderId || !orderDate) continue

      const lineTotalVal = lineTotal > 0 ? lineTotal : price * (quantity || 1)
      const orderValueVal = orderValue > 0 ? orderValue : lineTotalVal

      if (!customersMap.has(customerId)) {
        customersMap.set(customerId, {
          first: orderDate,
          last: orderDate,
          orderIds: new Set(),
          spend: 0,
        })
      }
      const cust = customersMap.get(customerId)!
      cust.last = orderDate
      cust.orderIds.add(orderId)
      const rowValue = lineTotalVal > 0 ? lineTotalVal : (price * (quantity || 1) > 0 ? price * (quantity || 1) : orderValueVal)
      cust.spend += rowValue

      if (productId) {
        if (!productsMap.has(productId)) {
          productsMap.set(productId, { name: productName || productId, category: category || 'General', price: price || 0 })
        }
      }

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          customerId,
          date: orderDate,
          value: rowValue,
          discountUsed,
          discountAmount,
          isSub,
        })
      } else {
        const o = ordersMap.get(orderId)!
        o.value += rowValue
      }

      const oiKey = `${orderId}::${productId || nanoid(6)}`
      if (!orderItemsMap.has(oiKey)) {
        orderItemsMap.set(oiKey, {
          orderId,
          productId: productId || 'P_UNKNOWN',
          qty: quantity || 1,
          lineTotal: lineTotalVal,
        })
      } else {
        const oi = orderItemsMap.get(oiKey)!
        oi.qty += quantity || 1
        oi.lineTotal += lineTotalVal
      }
    }

    // Ensure we have at least one product for orders with no product
    if (!productsMap.has('P_UNKNOWN') && orderItemsMap.size > 0) {
      productsMap.set('P_UNKNOWN', { name: 'Unknown', category: 'General', price: 0 })
    }

    // Insert customers
    for (const [cid, c] of Array.from(customersMap)) {
      const orderCount = c.orderIds.size
      const avgOrder = orderCount > 0 ? c.spend / orderCount : 0
      await client.query(
        `INSERT INTO customers (customer_id, store_id, first_order_date, last_order_date, total_orders, total_spend, avg_order_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (customer_id, store_id) DO UPDATE SET
           first_order_date = LEAST(customers.first_order_date, $3::date),
           last_order_date = GREATEST(customers.last_order_date, $4::date),
           total_orders = $5,
           total_spend = $6,
           avg_order_value = $7`,
        [cid, storeId, c.first, c.last, orderCount, c.spend, avgOrder]
      )
    }

    // Insert products
    for (const [pid, p] of Array.from(productsMap)) {
      await client.query(
        `INSERT INTO products (product_id, store_id, product_name, category, price)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, store_id) DO UPDATE SET product_name = $3, category = $4, price = $5`,
        [pid, storeId, p.name, p.category, p.price]
      )
    }

    // Insert orders
    for (const [oid, o] of Array.from(ordersMap)) {
      await client.query(
        `INSERT INTO orders (order_id, store_id, customer_id, order_date, order_value, discount_used, discount_amount, is_subscription)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (order_id, store_id) DO UPDATE SET order_value = $5`,
        [oid, storeId, o.customerId, o.date, o.value, o.discountUsed, o.discountAmount, o.isSub]
      )
    }

    // Insert order items
    for (const [, oi] of Array.from(orderItemsMap)) {
      await client.query(
        `INSERT INTO order_items (order_id, store_id, product_id, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [oi.orderId, storeId, oi.productId, oi.qty, oi.lineTotal]
      )
    }

    await client.query('COMMIT')

    console.log(`Inserted ${customersMap.size} customers, ${productsMap.size} products, ${ordersMap.size} orders, ${orderItemsMap.size} order items`)

    // Run full recompute pipeline
    const result = await runFullPipeline(storeId)
    console.log(`Pipeline: ${result.leaks} leaks, ${result.actions} actions`)

    return {
      customers: customersMap.size,
      orders: ordersMap.size,
      products: productsMap.size,
      orderItems: orderItemsMap.size,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}
