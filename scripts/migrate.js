require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
})

const SCHEMA = `
-- Store (multi-tenant support)
CREATE TABLE IF NOT EXISTS stores (
  store_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  plan TEXT DEFAULT 'free',
  data_window_days INT DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (anonymized - no PII)
CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  first_order_date DATE,
  last_order_date DATE,
  total_orders INT DEFAULT 0,
  total_spend DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(12,2) DEFAULT 0,
  subscription_status TEXT,
  discount_usage_pct DECIMAL(5,2) DEFAULT 0,
  PRIMARY KEY (customer_id, store_id)
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  product_name TEXT,
  category TEXT,
  price DECIMAL(12,2) DEFAULT 0,
  PRIMARY KEY (product_id, store_id)
);

-- Orders (FK to customers added after initial data load)
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  customer_id TEXT NOT NULL,
  order_date DATE,
  order_value DECIMAL(12,2) DEFAULT 0,
  discount_used BOOLEAN DEFAULT FALSE,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  is_subscription BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (order_id, store_id)
);

-- Order items (one order can have multiple line items)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  store_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  quantity INT DEFAULT 1,
  line_total DECIMAL(12,2) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id, store_id);
CREATE INDEX IF NOT EXISTS idx_oi_product ON order_items(product_id, store_id);

-- Computed metrics
CREATE TABLE IF NOT EXISTS computed_metrics (
  store_id UUID PRIMARY KEY REFERENCES stores(store_id),
  repeat_rate DECIMAL(5,2) DEFAULT 0,
  avg_reorder_days DECIMAL(10,2) DEFAULT 0,
  revenue_at_risk DECIMAL(12,2) DEFAULT 0,
  subscription_retention DECIMAL(5,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  repeat_revenue DECIMAL(12,2) DEFAULT 0,
  one_time_revenue DECIMAL(12,2) DEFAULT 0,
  founder_summary TEXT,
  last_computed_at TIMESTAMPTZ,
  UNIQUE(store_id)
);

-- Revenue leaks
CREATE TABLE IF NOT EXISTS revenue_leaks (
  leak_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(store_id),
  leak_type TEXT,
  description TEXT,
  estimated_monthly_loss DECIMAL(12,2) DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 0,
  confidence_explanation TEXT,
  recommended_action TEXT,
  priority_rank INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  affected_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actions (linked to leaks)
CREATE TABLE IF NOT EXISTS actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(store_id),
  leak_id UUID REFERENCES revenue_leaks(leak_id),
  description TEXT,
  what TEXT,
  why TEXT,
  next_step TEXT,
  potential_gain DECIMAL(12,2) DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 0,
  confidence_explanation TEXT,
  status TEXT DEFAULT 'todo',
  outcome TEXT,
  difficulty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer segments (computed)
CREATE TABLE IF NOT EXISTS customer_segments (
  segment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(store_id),
  segment_name TEXT,
  customer_count INT DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  suggested_action TEXT,
  UNIQUE(store_id, segment_name)
);

-- Segment membership
CREATE TABLE IF NOT EXISTS segment_members (
  segment_id UUID REFERENCES customer_segments(segment_id),
  customer_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  PRIMARY KEY (segment_id, customer_id)
);

-- Product intelligence
CREATE TABLE IF NOT EXISTS product_intelligence (
  product_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  repeat_rate DECIMAL(5,2) DEFAULT 0,
  total_sold INT DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  margin_pct DECIMAL(10,2) DEFAULT 0,
  suitability_score INT DEFAULT 0,
  sku_fatigue_cycle INT,
  last_computed_at TIMESTAMPTZ,
  PRIMARY KEY (product_id, store_id)
);

-- Churn predictions
CREATE TABLE IF NOT EXISTS churn_predictions (
  customer_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  days_since_last_order INT,
  risk_reason TEXT,
  predicted_reorder_date DATE,
  confidence DECIMAL(5,2) DEFAULT 0,
  PRIMARY KEY (customer_id, store_id)
);

-- Action pre-snapshots (for outcome tracking)
CREATE TABLE IF NOT EXISTS action_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES actions(action_id),
  metrics_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import staging (for robust CSV import)
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_rows (
  id SERIAL PRIMARY KEY,
  job_id UUID REFERENCES import_jobs(id),
  row_index INT,
  raw_jsonb JSONB,
  normalized_jsonb JSONB,
  is_valid BOOLEAN DEFAULT true,
  error TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_store_customer ON orders(store_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, order_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id, store_id);
CREATE INDEX IF NOT EXISTS idx_revenue_leaks_store ON revenue_leaks(store_id);
CREATE INDEX IF NOT EXISTS idx_actions_store ON actions(store_id);
`

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(SCHEMA)
    console.log('Migration completed successfully.')

    // Ensure default store exists
    const storeRes = await client.query(
      "SELECT store_id FROM stores LIMIT 1"
    )
    if (storeRes.rows.length === 0) {
      await client.query(
        `INSERT INTO stores (store_id, name, plan) VALUES (gen_random_uuid(), 'Default Store', 'pro')`
      )
      console.log('Created default store.')
    }
  } catch (err) {
    console.error('Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
