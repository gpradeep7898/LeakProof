/**
 * Phase 2 migration: Shopify connectivity columns, billing, GDPR request log.
 * Idempotent — safe to run on every deploy (db:migrate).
 *
 * Run: node scripts/migrate_phase2.js
 */
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

const STATEMENTS = [
  // Shopify connectivity on stores (some may already exist via migrate_v3 — IF NOT EXISTS everywhere)
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_domain TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_access_token TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_access_token_iv TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_scope TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS klaviyo_api_key TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ`,
  // Billing state on stores
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'none'`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS billing_plan TEXT`,
  `ALTER TABLE stores ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stores_shopify_domain_uidx') THEN
       CREATE UNIQUE INDEX stores_shopify_domain_uidx ON stores (shopify_domain);
     END IF;
   END $$`,

  // App subscriptions (Shopify Billing)
  `CREATE TABLE IF NOT EXISTS app_subscriptions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     store_id UUID REFERENCES stores(store_id) ON DELETE CASCADE,
     shopify_subscription_id TEXT,
     plan_name TEXT NOT NULL,
     price_cents INT NOT NULL,
     currency TEXT DEFAULT 'USD',
     status TEXT NOT NULL DEFAULT 'pending',
     trial_ends_at TIMESTAMPTZ,
     current_period_end TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS app_subscriptions_store_idx ON app_subscriptions (store_id)`,

  // GDPR request log — metadata ONLY, never raw payloads/PII
  `CREATE TABLE IF NOT EXISTS gdpr_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     shop_domain TEXT NOT NULL,
     request_type TEXT NOT NULL,
     customer_id TEXT,
     status TEXT NOT NULL DEFAULT 'received',
     received_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS gdpr_requests_shop_idx ON gdpr_requests (shop_domain)`,
]

async function main() {
  for (const sql of STATEMENTS) {
    try {
      await pool.query(sql)
    } catch (err) {
      console.error('[migrate_phase2] failed:', sql.slice(0, 80), err.message)
      throw err
    }
  }
  console.log('[migrate_phase2] done')
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
