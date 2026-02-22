/**
 * LeakProof CSV Ingestion Service
 * Supports Shopify exports: orders_export, products_export, customers_export, discounts_export
 * Orders CSV has line-item level rows - group by Id (order ID)
 */

import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';
import { pool, query, queryOne, execute } from '../db';
import { MetricEngine } from './metricEngine';

// Shopify Orders CSV headers (exact match)
interface ShopifyOrderRow {
  Name?: string;
  Email?: string;
  'Financial Status'?: string;
  'Paid at'?: string;
  'Fulfillment Status'?: string;
  'Fulfilled at'?: string;
  'Accepts Marketing'?: string;
  Currency?: string;
  Subtotal?: string;
  Shipping?: string;
  Taxes?: string;
  Total?: string;
  'Discount Code'?: string;
  'Discount Amount'?: string;
  'Shipping Method'?: string;
  'Created at'?: string;
  'Lineitem quantity'?: string;
  'Lineitem name'?: string;
  'Lineitem price'?: string;
  'Lineitem compare at price'?: string;
  'Lineitem sku'?: string;
  'Lineitem requires shipping'?: string;
  'Lineitem taxable'?: string;
  'Lineitem fulfillment status'?: string;
  'Billing Name'?: string;
  'Billing Street'?: string;
  'Billing Address1'?: string;
  Id?: string;
  Tags?: string;
  Vendor?: string;
  'Lineitem discount'?: string;
  'Refunded Amount'?: string;
  [key: string]: string | undefined;
}

function getVal(row: Record<string, string | undefined>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key] ?? row[key?.trim() ?? ''];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function parseNum(val: string): number {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function hashEmail(email: string): string {
  if (!email) return '';
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
}

/** Generate anonymized customer display ID (Customer #1029) - never expose email */
function anonymizeCustomerId(emailHash: string): string {
  if (!emailHash) return '0';
  let n = 0;
  for (let i = 0; i < Math.min(emailHash.length, 8); i++) {
    n = (n * 31 + emailHash.charCodeAt(i)) % 10000000;
  }
  return String(Math.abs(n));
}

export class CSVIngestionService {
  /**
   * Detect CSV type from headers and route to appropriate processor
   */
  async processCSV(
    csvContent: string,
    storeId: string,
    filename?: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return { success: false, stats: {}, errors: ['Empty CSV'] };
    }

    const headers = Object.keys(records[0]);

    // Orders: has Financial Status + Lineitem name + Id
    if (headers.some((h) => h.includes('Financial Status')) && headers.some((h) => h.includes('Lineitem'))) {
      return this.processOrdersCSV(csvContent, storeId);
    }
    // Demo/Combined orders: order_id, customer_id, product_id, product_name, quantity, line_total
    if (
      headers.some((h) => /order_id/i.test(h)) &&
      headers.some((h) => /customer_id/i.test(h)) &&
      headers.some((h) => /product_id/i.test(h)) &&
      headers.some((h) => /product_name|line_total/i.test(h))
    ) {
      return this.processDemoOrdersCSV(records, storeId);
    }
    // Products: Handle, Title, Variant SKU
    if (
      headers.some((h) => /handle|title/i.test(h))) {
      return this.processProductsCSV(records, storeId);
    }
    // Customers: Email, First Name, etc.
    if (headers.some((h) => /email/i.test(h)) && headers.some((h) => /first|name/i.test(h))) {
      return this.processCustomersCSV(records, storeId);
    }
    // Discounts: code, amount
    if (headers.some((h) => /discount|code/i.test(h))) {
      return this.processDiscountsCSV(records, storeId);
    }

    return {
      success: false,
      stats: {},
      errors: ['Unknown CSV format. Expected: Shopify Orders/Products/Customers/Discounts, or combined orders (order_id, customer_id, product_id, product_name, quantity, line_total).'],
    };
  }

  /**
   * Process Orders CSV - line-item level, group by Id
   */
  async processOrdersCSV(
    csvContent: string,
    storeId: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    }) as ShopifyOrderRow[];

    if (records.length === 0) {
      return { success: false, stats: {}, errors: ['Empty orders CSV'] };
    }

    // Find Id column (Shopify exports may have different casing/BOM)
    const firstRowKeys = Object.keys(records[0] as Record<string, string>);
    const idKey = firstRowKeys.find((k) => k.replace(/^\uFEFF/, '').trim().toLowerCase() === 'id') ?? firstRowKeys.find((k) => k.includes('Id')) ?? 'Id';

    // Group rows by Order Id
    const ordersMap = new Map<string, ShopifyOrderRow[]>();
    for (const row of records) {
      const r = row as Record<string, string>;
      const orderId = (r[idKey] ?? r['Id'] ?? getVal(r, 'Id', 'id')).toString().trim();
      if (!orderId) continue;
      if (!ordersMap.has(orderId)) ordersMap.set(orderId, []);
      ordersMap.get(orderId)!.push(row);
    }

    const errors: string[] = [];
    const client = await pool.connect();
    const BATCH_SIZE = 400; // Process orders in batches to avoid timeout
    const orderEntries = Array.from(ordersMap.entries());
    const stats = { orders: 0, order_items: 0, products: 0, customers: 0 };
    const seenProducts = new Set<string>();
    const seenCustomers = new Set<string>();

    try {
      for (let i = 0; i < orderEntries.length; i += BATCH_SIZE) {
        const batch = orderEntries.slice(i, i + BATCH_SIZE);
        await client.query('BEGIN');

        for (const [orderId, rows] of batch) {
        const mainRow = rows[0]!;
        const email = getVal(mainRow as Record<string, string>, 'Email') || `order-${orderId}@noreply.local`;
        const emailHash = hashEmail(email);
        const customerId = anonymizeCustomerId(emailHash);
        if (!emailHash) continue;

        // 1. Upsert Customer (no PII - use hashed email)
        const acceptsMarketing = /true|yes|1/i.test(getVal(mainRow as Record<string, string>, 'Accepts Marketing'));
        const firstOrderDate = mainRow['Created at'] ? new Date(mainRow['Created at']).toISOString() : null;
        const lastOrderDate = firstOrderDate;

        await client.query(
          `INSERT INTO customers (
            customer_id, store_id, email_hash, accepts_marketing,
            first_order_date, last_order_date, total_orders, total_spend, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, 1, 0, NOW(), NOW())
          ON CONFLICT (customer_id, store_id) DO UPDATE SET
            last_order_date = GREATEST(customers.last_order_date, $6::timestamptz),
            first_order_date = LEAST(COALESCE(customers.first_order_date, $5::timestamptz), $5::timestamptz),
            total_orders = customers.total_orders + 1,
            total_spend = customers.total_spend + $7,
            updated_at = NOW()`,
          [
            customerId,
            storeId,
            emailHash,
            acceptsMarketing,
            firstOrderDate,
            lastOrderDate,
            parseNum(mainRow['Total'] ?? '0') - parseNum(mainRow['Refunded Amount'] ?? '0'),
          ]
        );
        if (!seenCustomers.has(customerId)) {
          seenCustomers.add(customerId);
          stats.customers++;
        }

        // Remove duplicate if re-import: delete existing order + items
        await client.query('DELETE FROM order_items WHERE order_id = $1 AND store_id = $2', [orderId, storeId]);
        await client.query('DELETE FROM orders WHERE order_id = $1 AND store_id = $2', [orderId, storeId]);

        // 2. Insert Order
        const total = parseNum(mainRow['Total'] ?? '0');
        const subtotal = parseNum(mainRow['Subtotal'] ?? '0');
        const taxes = parseNum(mainRow['Taxes'] ?? '0');
        const shipping = parseNum(mainRow['Shipping'] ?? '0');
        const discountAmt = parseNum(mainRow['Discount Amount'] ?? '0');
        const refunded = parseNum(mainRow['Refunded Amount'] ?? '0');
        const createdAt = mainRow['Created at'] ? new Date(mainRow['Created at']) : new Date();

        await client.query(
          `INSERT INTO orders (
            order_id, store_id, customer_id, order_date, created_at,
            total_price, subtotal_price, total_tax, total_discounts, shipping_cost, refunded_amount,
            financial_status, currency, discount_code, order_value, discount_used, discount_amount, net_profit
          ) VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            orderId,
            storeId,
            customerId,
            createdAt.toISOString().slice(0, 10),
            createdAt.toISOString(),
            total,
            subtotal,
            taxes,
            discountAmt,
            shipping,
            refunded,
            mainRow['Financial Status'] ?? '',
            mainRow['Currency'] ?? 'USD',
            mainRow['Discount Code'] ?? null,
            total,
            discountAmt > 0,
            discountAmt,
            subtotal - discountAmt - refunded,
          ]
        );
        stats.orders++;

        // 3. Insert order_items and upsert products
        for (const row of rows) {
          const sku = getVal(row as Record<string, string>, 'Lineitem sku') || `line-${(row['Lineitem name'] ?? 'unknown').toString().replace(/\s+/g, '-').slice(0, 30)}`;
          const productName = getVal(row as Record<string, string>, 'Lineitem name') || 'Unknown';
          const vendor = getVal(row as Record<string, string>, 'Vendor') || '';
          const quantity = parseInt(getVal(row as Record<string, string>, 'Lineitem quantity') || '1', 10) || 1;
          const linePrice = parseNum(row['Lineitem price'] ?? '0');
          const lineDiscount = parseNum(row['Lineitem discount'] ?? '0');
          const lineTotal = quantity * linePrice - lineDiscount;

          // Upsert product (SKU as key) - do not overwrite catalog product
          const productId = sku;
          await client.query(
            `INSERT INTO products (product_id, store_id, sku, product_name, vendor, avg_selling_price, price, source, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6, 'order-derived', TRUE, NOW(), NOW())
             ON CONFLICT (product_id, store_id) DO UPDATE SET
               product_name = CASE WHEN products.source = 'order-derived' THEN COALESCE(products.product_name, EXCLUDED.product_name) ELSE products.product_name END,
               vendor = CASE WHEN products.source = 'order-derived' THEN COALESCE(NULLIF(products.vendor,''), EXCLUDED.vendor) ELSE products.vendor END,
               updated_at = NOW()`,
            [productId, storeId, sku, productName, vendor || null, linePrice]
          );

          if (!seenProducts.has(productId)) {
            seenProducts.add(productId);
            stats.products++;
          }

          await client.query(
            `INSERT INTO order_items (order_id, store_id, product_id, sku, product_name, vendor, quantity, line_price, line_total, line_discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [orderId, storeId, productId, sku, productName, vendor, quantity, linePrice, lineTotal, lineDiscount]
          );
          stats.order_items++;
        }
        }

        await client.query('COMMIT');
      }

      // Recalculate customer total_spend from orders (once after all batches)
      await client.query(
        `UPDATE customers c SET
          total_spend = (SELECT COALESCE(SUM(o.total_price - COALESCE(o.refunded_amount, 0)), 0) FROM orders o WHERE o.customer_id = c.customer_id AND o.store_id = c.store_id),
          total_revenue = total_spend,
          lifetime_value = total_spend,
          updated_at = NOW()
        WHERE c.store_id = $1`,
        [storeId]
      );

      // 4. Run metric pipeline after successful import (non-blocking)
      try {
        const metrics = new MetricEngine();
        await metrics.recalculateAll(storeId);
      } catch (metricErr) {
        console.error('Metric recalculation failed after import:', metricErr);
        errors.push(`Metrics: ${metricErr instanceof Error ? metricErr.message : 'Unknown error'}`);
      }

      return {
        success: true,
        stats: {
          orders: stats.orders,
          order_items: stats.order_items,
          products: stats.products,
          customers: stats.customers,
        },
        errors,
      };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(msg);
      return { success: false, stats: {}, errors };
    } finally {
      client.release();
    }
  }

  /**
   * Process demo/combined orders CSV: order_id, customer_id, product_id, product_name, quantity, line_total
   * Each row = one line item; group by order_id
   */
  async processDemoOrdersCSV(
    records: Record<string, string>[],
    storeId: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const errors: string[] = [];
    const ordersMap = new Map<string, Record<string, string>[]>();
    for (const row of records) {
      const orderId = getVal(row, 'order_id', 'orderid');
      if (!orderId) continue;
      if (!ordersMap.has(orderId)) ordersMap.set(orderId, []);
      ordersMap.get(orderId)!.push(row);
    }

    const stats = { orders: 0, order_items: 0, products: 0, customers: 0 };
    const seenCustomers = new Set<string>();
    const seenProducts = new Set<string>();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [orderId, rows] of ordersMap.entries()) {
        const mainRow = rows[0]!;
        const customerId = getVal(mainRow, 'customer_id', 'customerid') || `cust-${orderId}`;
        const orderDate = getVal(mainRow, 'order_date', 'orderdate', 'date', 'created_at');
        const orderValue = parseNum(getVal(mainRow, 'order_value', 'ordervalue', 'total', 'total_price'));
        const discountUsed = /true|yes|1/i.test(getVal(mainRow, 'discount_used', 'discountused'));
        const discountAmount = parseNum(getVal(mainRow, 'discount_amount', 'discountamount'));

        const dateStr = orderDate || new Date().toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO customers (customer_id, store_id, email_hash, first_order_date, last_order_date, total_orders, total_spend, created_at, updated_at)
           VALUES ($1, $2, $3, $4::date, $4::date, 1, 0, NOW(), NOW())
           ON CONFLICT (customer_id, store_id) DO UPDATE SET
             last_order_date = GREATEST(customers.last_order_date, $4::timestamptz),
             first_order_date = LEAST(COALESCE(customers.first_order_date, $4::timestamptz), $4::timestamptz),
             total_orders = customers.total_orders + 1,
             updated_at = NOW()`,
          [customerId, storeId, hashEmail(customerId), dateStr]
        );
        if (!seenCustomers.has(customerId)) {
          seenCustomers.add(customerId);
          stats.customers++;
        }

        await client.query('DELETE FROM order_items WHERE order_id = $1 AND store_id = $2', [orderId, storeId]);
        await client.query('DELETE FROM orders WHERE order_id = $1 AND store_id = $2', [orderId, storeId]);

        const createdAt = orderDate ? new Date(orderDate).toISOString() : new Date().toISOString();
        await client.query(
          `INSERT INTO orders (
            order_id, store_id, customer_id, order_date, created_at,
            total_price, order_value, total_discounts, discount_used, discount_amount,
            financial_status, currency
          ) VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6, $6, $7, $8, $7, 'paid', 'USD')`,
          [orderId, storeId, customerId, orderDate || createdAt.slice(0, 10), createdAt, orderValue, discountAmount, discountUsed]
        );
        stats.orders++;

        for (const row of rows) {
          const productId = getVal(row, 'product_id', 'productid', 'sku') || 'unknown';
          const productName = getVal(row, 'product_name', 'productname') || 'Unknown';
          const category = getVal(row, 'category') || '';
          const price = parseNum(getVal(row, 'price', 'unit_price'));
          const quantity = parseInt(getVal(row, 'quantity', 'qty') || '1', 10) || 1;
          const lineTotal = parseNum(getVal(row, 'line_total', 'linetotal')) || quantity * price;

          await client.query(
            `INSERT INTO products (product_id, store_id, sku, product_name, vendor, avg_selling_price, price, source, is_active, created_at, updated_at)
             VALUES ($1, $2, $1, $3, $4, $5, $5, 'order-derived', TRUE, NOW(), NOW())
             ON CONFLICT (product_id, store_id) DO UPDATE SET
               product_name = COALESCE(NULLIF(products.product_name,''), EXCLUDED.product_name),
               vendor = COALESCE(NULLIF(products.vendor,''), EXCLUDED.vendor),
               updated_at = NOW()`,
            [productId, storeId, productName, category || null, price || lineTotal / quantity]
          );
          if (!seenProducts.has(productId)) {
            seenProducts.add(productId);
            stats.products++;
          }

          await client.query(
            `INSERT INTO order_items (order_id, store_id, product_id, sku, product_name, vendor, quantity, line_price, line_total, line_discount)
             VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 0)`,
            [orderId, storeId, productId, productName, category, quantity, price || lineTotal / quantity, lineTotal]
          );
          stats.order_items++;
        }
      }
      await client.query('COMMIT');

      await client.query(
        `UPDATE customers c SET
          total_spend = (SELECT COALESCE(SUM(o.total_price - COALESCE(o.refunded_amount, 0)), 0) FROM orders o WHERE o.customer_id = c.customer_id AND o.store_id = c.store_id),
          total_revenue = total_spend,
          lifetime_value = total_spend,
          updated_at = NOW()
        WHERE c.store_id = $1`,
        [storeId]
      );

      try {
        const metrics = new MetricEngine();
        await metrics.recalculateAll(storeId);
      } catch (metricErr) {
        console.error('Metric recalculation failed after demo import:', metricErr);
        errors.push(`Metrics: ${metricErr instanceof Error ? metricErr.message : 'Unknown error'}`);
      }

      return {
        success: true,
        stats: { ...stats, discounts: 0 },
        errors,
      };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(msg);
      return { success: false, stats: {}, errors };
    } finally {
      client.release();
    }
  }

  /**
   * Process Products CSV (catalog) - primary source of truth
   */
  async processProductsCSV(
    records: Record<string, string>[],
    storeId: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const row of records) {
      const productId = getVal(row, 'Variant SKU', 'Handle', 'product_id', 'sku', 'SKU');
      const sku = productId || getVal(row, 'Handle', 'Title');
      if (!sku) {
        errors.push(`Row missing SKU/Handle: ${JSON.stringify(row).slice(0, 80)}`);
        continue;
      }

      const productName = getVal(row, 'Title', 'Product Title', 'product_name', 'name') || 'Unknown Product';
      const vendor = getVal(row, 'Vendor') || '';
      const price = parseNum(getVal(row, 'Variant Price', 'Price', 'price'));

      try {
        await query(
          `INSERT INTO products (product_id, store_id, sku, product_name, vendor, price, avg_selling_price, source, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 'shopify_csv', TRUE, NOW(), NOW())
           ON CONFLICT (product_id, store_id) DO UPDATE SET
             product_name = EXCLUDED.product_name,
             vendor = COALESCE(NULLIF(products.vendor,''), EXCLUDED.vendor),
             price = COALESCE(products.price, EXCLUDED.price),
             avg_selling_price = CASE WHEN products.source = 'shopify_csv' THEN EXCLUDED.avg_selling_price ELSE products.avg_selling_price END,
             updated_at = NOW()`,
          [sku, storeId, sku, productName, vendor || null, price]
        );
        count++;
      } catch (e: unknown) {
        errors.push(`Product ${productName}: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    return {
      success: true,
      stats: { products: count, orders: 0, customers: 0 },
      errors,
    };
  }

  /**
   * Process Customers CSV (optional - usually derived from orders)
   */
  async processCustomersCSV(
    records: Record<string, string>[],
    storeId: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const row of records) {
      const email = getVal(row, 'Email', 'email');
      if (!email) continue;

      const emailHash = hashEmail(email);
      const customerId = anonymizeCustomerId(emailHash);
      const acceptsMarketing = /true|yes|1/i.test(getVal(row, 'Accepts Marketing', 'accepts_marketing'));

      try {
        await query(
          `INSERT INTO customers (customer_id, store_id, email_hash, accepts_marketing, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (customer_id, store_id) DO UPDATE SET
             accepts_marketing = EXCLUDED.accepts_marketing,
             updated_at = NOW()`,
          [customerId, storeId, emailHash, acceptsMarketing]
        );
        count++;
      } catch (e: unknown) {
        errors.push(`Customer: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    return { success: true, stats: { customers: count, orders: 0, products: 0 }, errors };
  }

  /**
   * Process Discounts CSV (optional)
   */
  async processDiscountsCSV(
    records: Record<string, string>[],
    storeId: string
  ): Promise<{ success: boolean; stats: Record<string, number>; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const row of records) {
      const code = getVal(row, 'Code', 'Discount Code', 'code');
      if (!code) continue;

      const amount = parseNum(getVal(row, 'Amount', 'total_discount_amount'));
      const usage = parseInt(getVal(row, 'Usage', 'usage_count') || '0', 10) || 1;

      try {
        await query(
          `INSERT INTO discounts (store_id, code, usage_count, total_discount_amount, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (store_id, code) DO UPDATE SET
             usage_count = discounts.usage_count + EXCLUDED.usage_count,
             total_discount_amount = discounts.total_discount_amount + EXCLUDED.total_discount_amount,
             updated_at = NOW()`,
          [storeId, code, usage, amount]
        );
        count++;
      } catch (e: unknown) {
        errors.push(`Discount ${code}: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    return { success: true, stats: { discounts: count, orders: 0, customers: 0, products: 0 }, errors };
  }
}
