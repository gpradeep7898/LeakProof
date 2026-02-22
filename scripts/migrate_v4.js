/**
 * migrate_v4.js — Orders table extension for true profit tracking
 * Run: node scripts/migrate_v4.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const STATEMENTS = [
    // ── Orders table: profit columns ──
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_order_id TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2)`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_price NUMERIC(12,2)`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_tax NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_discounts NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fees NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_processing_fees NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ad_attribution_cost NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_return_cost NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_profit NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(8,4) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_repeat_customer BOOLEAN DEFAULT false`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_status TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS acquisition_channel TEXT DEFAULT 'unknown'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_used BOOLEAN DEFAULT false`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Customers table: enhanced metrics ──
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spend NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_acquisition_cost NUMERIC(12,2) DEFAULT 45`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ltv_cac_ratio NUMERIC(8,4) DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS avg_days_between_orders INT DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS days_since_last_order INT DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS churn_risk_score NUMERIC(5,4) DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'new'`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN DEFAULT false`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_usage_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_channel TEXT`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Products table: enhanced metrics ──
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_product_id TEXT`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_selling_price NUMERIC(12,2)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS gross_margin_pct NUMERIC(8,4) DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS current_inventory INT DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS days_of_inventory INT DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Revenue leaks: new columns ──
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium'`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4) DEFAULT 0.5`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS affected_customers_count INT DEFAULT 0`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS affected_orders_count INT DEFAULT 0`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'medium'`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS recommended_action_json JSONB`,
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Actions table: new columns ──
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS leak_id TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS action_type TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium'`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS reversible BOOLEAN DEFAULT true`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT true`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS auto_execute BOOLEAN DEFAULT false`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS expected_impact NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS actual_impact NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS baseline_value NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS variance NUMERIC(12,2)`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS configuration JSONB`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS undo_data JSONB`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS approved_by TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS measurement_date TIMESTAMPTZ`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS shopify_script_id TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS klaviyo_flow_id TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Action snapshots table ──
    `CREATE TABLE IF NOT EXISTS action_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    action_id TEXT NOT NULL,
    metrics_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

    // ── Indexes ──
    `CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, order_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(store_id, customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_profit ON orders(store_id, net_profit)`,
    `CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(store_id, segment)`,
    `CREATE INDEX IF NOT EXISTS idx_customers_churn ON customers(store_id, churn_risk_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_revenue_leaks_severity ON revenue_leaks(store_id, severity)`,
    `CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(store_id, status)`,

    // Back-fill: set total_price = order_value where null
    `UPDATE orders SET total_price = order_value WHERE total_price IS NULL`,
]

async function migrate() {
    console.log('🚀 Running migrate_v4.js ...')
    const client = await pool.connect()
    let success = 0
    let skipped = 0

    try {
        for (const stmt of STATEMENTS) {
            try {
                await client.query(stmt)
                success++
                process.stdout.write('.')
            } catch (err) {
                if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
                    skipped++
                    process.stdout.write('-')
                } else {
                    console.warn(`\n⚠️  Warning: ${err.message.substring(0, 120)}`)
                }
            }
        }
        console.log(`\n✅ Migration complete: ${success} applied, ${skipped} already existed`)
    } finally {
        client.release()
        await pool.end()
    }
}

migrate().catch((err) => {
    console.error('❌ Migration failed:', err)
    process.exit(1)
})
