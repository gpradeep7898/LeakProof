require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const STATEMENTS = [
    // Extend stores with Shopify OAuth fields
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_domain TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_access_token TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_scope TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS klaviyo_api_key TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS industry_category TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS annual_revenue_range TEXT`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ`,
    `ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // Autopilot settings table
    `CREATE TABLE IF NOT EXISTS autopilot_settings (
    store_id UUID PRIMARY KEY REFERENCES stores(store_id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT FALSE,
    auto_execute_low_risk BOOLEAN DEFAULT FALSE,
    auto_execute_medium_risk BOOLEAN DEFAULT FALSE,
    require_approval_high_risk BOOLEAN DEFAULT TRUE,
    daily_digest_email TEXT,
    slack_webhook_url TEXT,
    scan_hour_utc INT DEFAULT 3,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

    // Extend benchmarks with group_key if missing
    `ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS group_key TEXT`,
    `ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS days_to_second_order DECIMAL(5,2) DEFAULT 0`,

    // Update existing benchmarks to generate group_key
    `UPDATE benchmarks SET group_key = CONCAT(LOWER(COALESCE(industry_category,'general')), '_', LOWER(COALESCE(revenue_range,'unknown'))) WHERE group_key IS NULL`,

    // Add unique constraint on group_key  
    `DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'benchmarks_group_key_key') THEN
      ALTER TABLE benchmarks ADD CONSTRAINT benchmarks_group_key_key UNIQUE (group_key);
    END IF;
  END$$`,

    // Extend actions
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS variance DECIMAL(12,2) DEFAULT 0`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS measurement_date TIMESTAMPTZ`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS shopify_script_id TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS klaviyo_flow_id TEXT`,
    `ALTER TABLE actions ADD COLUMN IF NOT EXISTS undo_data JSONB`,

    // Extend revenue_leaks  
    `ALTER TABLE revenue_leaks ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium'`,

    // Notifications log
    `CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(store_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    channel TEXT NOT NULL,
    payload JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'sent'
  )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_benchmarks_group ON benchmarks(group_key)`,
    `CREATE INDEX IF NOT EXISTS idx_notification_store ON notification_log(store_id)`,
    `CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_leaks_severity ON revenue_leaks(severity)`,
    `CREATE INDEX IF NOT EXISTS idx_leaks_store_status ON revenue_leaks(store_id, status)`,
]

const BENCHMARK_SEED = `
INSERT INTO benchmarks (group_key, industry_category, revenue_range, sample_size, repeat_customer_rate, avg_order_value, gross_margin_pct, net_profit_margin_pct, discount_rate, churn_rate, ltv_cac_ratio, days_to_second_order)
VALUES
  ('apparel_100k-500k', 'apparel', '100k-500k', 127, 34, 85, 52, 14, 18, 42, 2.8, 38),
  ('apparel_500k-1m', 'apparel', '500k-1m', 89, 38, 95, 54, 16, 15, 38, 3.2, 35),
  ('apparel_1m-5m', 'apparel', '1m-5m', 64, 42, 110, 56, 18, 13, 35, 3.8, 30),
  ('beauty_100k-500k', 'beauty', '100k-500k', 203, 41, 68, 58, 17, 22, 38, 3.1, 32),
  ('beauty_500k-1m', 'beauty', '500k-1m', 118, 45, 75, 60, 19, 19, 36, 3.6, 28),
  ('beauty_1m-5m', 'beauty', '1m-5m', 76, 48, 88, 62, 21, 16, 32, 4.2, 25),
  ('food_100k-500k', 'food', '100k-500k', 156, 52, 55, 45, 12, 28, 32, 2.5, 22),
  ('food_500k-1m', 'food', '500k-1m', 93, 56, 62, 47, 14, 25, 30, 3.0, 20),
  ('supplements_100k-500k', 'supplements', '100k-500k', 178, 48, 72, 62, 18, 20, 40, 3.4, 28),
  ('supplements_500k-1m', 'supplements', '500k-1m', 112, 53, 82, 64, 21, 17, 37, 4.1, 24),
  ('home_100k-500k', 'home', '100k-500k', 134, 28, 125, 42, 10, 12, 38, 2.2, 55),
  ('home_500k-1m', 'home', '500k-1m', 87, 32, 142, 44, 12, 10, 35, 2.6, 48),
  ('general_100k-500k', 'general', '100k-500k', 432, 35, 82, 48, 13, 22, 40, 2.9, 40),
  ('general_500k-1m', 'general', '500k-1m', 287, 38, 94, 50, 15, 20, 38, 3.2, 36),
  ('general_1m-5m', 'general', '1m-5m', 198, 42, 108, 52, 17, 18, 35, 3.6, 32)
ON CONFLICT (group_key) DO NOTHING
`

async function migrate_v3() {
    const client = await pool.connect()
    try {
        console.log('Starting migration v3 (Enhanced Profit OS)...')
        for (const stmt of STATEMENTS) {
            await client.query(stmt)
            const preview = stmt.replace(/\s+/g, ' ').substring(0, 60)
            console.log(`  ✓ ${preview}...`)
        }
        await client.query(BENCHMARK_SEED)
        console.log('  ✓ Benchmark data seeded')
        console.log('✅ Migration v3 completed successfully.')
    } catch (err) {
        console.error('❌ Migration v3 failed:', err.message)
        throw err
    } finally {
        client.release()
        await pool.end()
    }
}

migrate_v3()
