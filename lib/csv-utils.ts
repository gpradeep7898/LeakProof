/** Client-side CSV parsing and normalization utilities */

function norm(col: string): string {
  return col.toLowerCase().trim().replace(/\s+/g, '_').replace(/'/g, '')
}

export const COLUMN_ALIASES: Record<string, string[]> = {
  order_id: ['order_id', 'orderid', 'order', 'Order ID'],
  customer_id: ['customer_id', 'customerid', 'email', 'customer_email', 'Email'],
  order_date: ['order_date', 'orderdate', 'date', 'created_at', 'Date'],
  order_value: ['order_value', 'ordervalue', 'total', 'total_price', 'totalprice', 'subtotal'],
  discount_used: ['discount_used', 'discountused', 'had_discount'],
  discount_amount: ['discount_amount', 'discountamount'],
  is_subscription: ['is_subscription', 'issubscription', 'subscription'],
  product_id: ['product_id', 'productid', 'sku', 'variant_id'],
  product_name: ['product_name', 'productname', 'title', 'name'],
  category: ['category'],
  price: ['price', 'unit_price', 'unitprice'],
  quantity: ['quantity', 'qty'],
  line_total: ['line_total', 'linetotal', 'line_total_price'],
}

export type DetectedSchema = {
  headers: string[]
  normalizedHeaders: Record<string, string>
  inferredTypes: Record<string, 'string' | 'number' | 'date' | 'boolean'>
}

export function inferColumnType(values: string[]): 'string' | 'number' | 'date' | 'boolean' {
  const sample = values.filter(Boolean).slice(0, 20)
  if (sample.length === 0) return 'string'

  let numCount = 0
  let dateCount = 0
  let boolCount = 0

  for (const v of sample) {
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
    if (!isNaN(n) && String(n) === String(v).trim()) numCount++
    const d = new Date(v)
    if (!isNaN(d.getTime()) && v.match(/^\d{4}-\d{2}-\d{2}/)) dateCount++
    const vl = v.toLowerCase()
    if (['true', 'false', 'yes', 'no', '1', '0'].includes(vl)) boolCount++
  }

  if (boolCount / sample.length > 0.5) return 'boolean'
  if (dateCount / sample.length > 0.3) return 'date'
  if (numCount / sample.length > 0.5) return 'number'
  return 'string'
}

export function detectSchema(headers: string[], rows: Record<string, string>[]): DetectedSchema {
  const normalizedHeaders: Record<string, string> = {}
  const inferredTypes: Record<string, 'string' | 'number' | 'date' | 'boolean'> = {}

  for (const h of headers) {
    const n = norm(h)
    normalizedHeaders[h] = n
    const colValues = rows.slice(0, 100).map((r) => r[h] ?? r[n] ?? '')
    inferredTypes[n] = inferColumnType(colValues)
  }

  return { headers, normalizedHeaders, inferredTypes }
}

export function getValue(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[norm(c)] ?? row[c]
    if (v !== undefined && v !== null && v !== '') return String(v).trim()
  }
  return ''
}

/** Simple hash for anonymization - never show PII */
export function anonymizeId(val: string): string {
  if (!val) return 'cust_unknown'
  let h = 0
  for (let i = 0; i < val.length; i++) {
    h = (h << 5) - h + val.charCodeAt(i)
    h |= 0
  }
  return `cust_${Math.abs(h).toString(16).slice(0, 8).toUpperCase()}`
}

export function validateRequiredColumns(headers: string[]): { valid: boolean; missing: string[] } {
  const normalized = new Set(headers.map((h) => norm(h)))
  const missing: string[] = []

  const hasOrderId = COLUMN_ALIASES.order_id.some((a) => normalized.has(norm(a)))
  const hasOrderDate = COLUMN_ALIASES.order_date.some((a) => normalized.has(norm(a)))

  if (!hasOrderId) missing.push('order_id (or Order ID, OrderID)')
  if (!hasOrderDate) missing.push('order_date (or Date, OrderDate)')

  return { valid: missing.length === 0, missing }
}
