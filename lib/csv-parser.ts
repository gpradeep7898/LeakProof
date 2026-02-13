import { parse } from 'csv-parse/sync'

export type DenormalizedRow = {
  order_id?: string
  customer_id?: string
  customer_email?: string
  customer_name?: string
  order_date?: string
  order_value?: string
  discount_used?: string
  discount_amount?: string
  is_subscription?: string
  product_id?: string
  product_name?: string
  category?: string
  price?: string
  quantity?: string
  line_total?: string
}

export type OrdersRow = {
  order_id?: string
  customer_id?: string
  order_date?: string
  order_value?: string
  discount_used?: string
  discount_amount?: string
  is_subscription?: string
}

export type CustomersRow = {
  customer_id?: string
  first_order_date?: string
  last_order_date?: string
  total_orders?: string
  total_spend?: string
}

export type ProductsRow = {
  product_id?: string
  product_name?: string
  category?: string
  price?: string
}

export function parseCSV(buffer: Buffer): Record<string, string>[] {
  const str = buffer.toString('utf-8')
  const rows = parse(str, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[]
  return rows
}

/** Normalize column names (case-insensitive, strip) */
function norm(col: string): string {
  return col.toLowerCase().trim().replace(/\s+/g, '_')
}

export function normalizeColumns<T extends Record<string, string>>(rows: T[]): T[] {
  if (rows.length === 0) return rows
  const keys = Object.keys(rows[0])
  const map: Record<string, string> = {}
  keys.forEach((k) => {
    map[norm(k)] = k
  })
  return rows.map((r) => {
    const out: Record<string, string> = {}
    Object.entries(r).forEach(([k, v]) => {
      const n = norm(k)
      out[n] = v
    })
    return out as T
  })
}

/** Detect format: denormalized (single file) vs separate files */
export function inferFormat(rows: Record<string, string>[]): 'denormalized' | 'orders' | 'customers' | 'products' {
  if (rows.length === 0) return 'orders'
  const cols = Object.keys(rows[0]).map(norm)
  const hasOrder = cols.some((c) => ['order_id', 'orderid'].includes(c))
  const hasCustomer = cols.some((c) => ['customer_id', 'customerid', 'email'].includes(c))
  const hasProduct = cols.some((c) => ['product_id', 'productid', 'sku'].includes(c))
  if (hasOrder && (hasCustomer || hasProduct)) return 'denormalized'
  if (hasOrder) return 'orders'
  if (cols.some((c) => ['customer_id', 'customerid'].includes(c)) || cols.some((c) => c === 'email')) return 'customers'
  if (cols.some((c) => ['product_id', 'productid', 'sku'].includes(c))) return 'products'
  return 'orders'
}
