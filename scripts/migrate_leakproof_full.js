/**
 * LeakProof Full Schema Migration
 * Supports: customers, orders, order_items, products, discounts
 * Shopify CSV format with line-item level rows
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
});

const SCHEMA = `
-- Ensure stores exists
CREATE TABLE IF NOT EXISTS stores (
  store_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  plan TEXT DEFAULT 'free',
  data_window_days INT DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (anonymized - customer_id is hash, never store/return email)
CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  email_hash TEXT,                    -- SHA256 of email, never exposed
  accepts_marketing BOOLEAN DEFAULT FALSE,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,
  total_orders INT DEFAULT 0,
  total_spend DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  lifetime_value DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(12,2) DEFAULT 0,
  discount_usage_pct DECIMAL(5,2) DEFAULT 0,
  segment TEXT,
  churn_risk_score DECIMAL(5,2) DEFAULT 0,
  days_since_last_order INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (customer_id, store_id)
);

-- Products (catalog - sku is unique key)
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  sku TEXT,
  product_name TEXT,
  vendor TEXT,
  category TEXT,
  price DECIMAL(12,2) DEFAULT 0,
  avg_selling_price DECIMAL(12,2) DEFAULT 0,
  cogs DECIMAL(12,2) DEFAULT 0,
  gross_margin_pct DECIMAL(10,2) DEFAULT 0,
  source TEXT DEFAULT 'shopify_csv',
  is_active BOOLEAN DEFAULT TRUE,
  total_sold INT DEFAULT 0,
  repurchase_rate DECIMAL(5,2) DEFAULT 0,
  churn_correlation DECIMAL(5,2) DEFAULT 0,
  discount_usage_rate DECIMAL(5,2) DEFAULT 0,
  avg_reorder_days DECIMAL(10,2),
  sku_fatigue_cycle INT,
  subscription_suitability_score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, store_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_store ON products(store_id, sku) WHERE sku IS NOT NULL AND sku != '';

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT NOT NULL,
  store_id UUID REFERENCES stores(store_id),
  customer_id TEXT NOT NULL,
  order_date DATE,
  created_at TIMESTAMPTZ,
  total_price DECIMAL(12,2) DEFAULT 0,
  subtotal_price DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  total_discounts DECIMAL(12,2) DEFAULT 0,
  shipping_cost DECIMAL(12,2) DEFAULT 0,
  refunded_amount DECIMAL(12,2) DEFAULT 0,
  financial_status TEXT,
  fulfillment_status TEXT,
  currency TEXT,
  discount_code TEXT,
  order_value DECIMAL(12,2) DEFAULT 0,
  discount_used BOOLEAN DEFAULT FALSE,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  is_subscription BOOLEAN DEFAULT FALSE,
  net_profit DECIMAL(12,2) DEFAULT 0,
  cogs DECIMAL(12,2) DEFAULT 0,
  platform_fees DECIMAL(12,2) DEFAULT 0,
  payment_processing_fees DECIMAL(12,2) DEFAULT 0,
  ad_attribution_cost DECIMAL(12,2) DEFAULT 0,
  estimated_return_cost DECIMAL(12,2) DEFAULT 0,
  created_at_orders TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (order_id, store_id)
);

-- Order items (line items)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  store_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  sku TEXT,
  product_name TEXT,
  vendor TEXT,
  quantity INT DEFAULT 1,
  line_price DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) DEFAULT 0,
  line_discount DECIMAL(12,2) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id, store_id);
CREATE INDEX IF NOT EXISTS idx_oi_product ON order_items(product_id, store_id);

-- Discounts
CREATE TABLE IF NOT EXISTS discounts (
  discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(store_id),
  code TEXT,
  usage_count INT DEFAULT 0,
  total_discount_amount DECIMAL(12,2) DEFAULT 0,
  leakage_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);

-- Computed metrics
CREATE TABLE IF NOT EXISTS computed_metrics (
  store_id UUID PRIMARY KEY REFERENCES stores(store_id),
  total_revenue DECIMAL(12,2) DEFAULT 0,
  net_revenue DECIMAL(12,2) DEFAULT 0,
  repeat_rate DECIMAL(5,2) DEFAULT 0,
  avg_reorder_days DECIMAL(10,2) DEFAULT 0,
  revenue_at_risk DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(12,2) DEFAULT 0,
  subscription_retention DECIMAL(5,2) DEFAULT 0,
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
  title TEXT,
  description TEXT,
  estimated_monthly_loss DECIMAL(12,2) DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 0,
  confidence_explanation TEXT,
  recommended_action TEXT,
  recommended_action_json JSONB,
  priority_rank INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  severity TEXT DEFAULT 'medium',
  affected_count INT DEFAULT 0,
  affected_customers_count INT DEFAULT 0,
  affected_orders_count INT DEFAULT 0,
  affected_sku_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- Customer segments
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
  PRIMARY KEY (segment_id, customer_id, store_id)
);

-- Product intelligence (denormalized into products; this table optional for legacy)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_store_customer ON orders(store_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_date ON orders(store_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_revenue_leaks_store ON revenue_leaks(store_id);
CREATE INDEX IF NOT EXISTS idx_actions_store ON actions(store_id);

-- Add missing columns to existing tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_price') THEN
    ALTER TABLE orders ADD COLUMN total_price DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='subtotal_price') THEN
    ALTER TABLE orders ADD COLUMN subtotal_price DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_tax') THEN
    ALTER TABLE orders ADD COLUMN total_tax DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_discounts') THEN
    ALTER TABLE orders ADD COLUMN total_discounts DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='shipping_cost') THEN
    ALTER TABLE orders ADD COLUMN shipping_cost DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='refunded_amount') THEN
    ALTER TABLE orders ADD COLUMN refunded_amount DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='financial_status') THEN
    ALTER TABLE orders ADD COLUMN financial_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='currency') THEN
    ALTER TABLE orders ADD COLUMN currency TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_code') THEN
    ALTER TABLE orders ADD COLUMN discount_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_at') THEN
    ALTER TABLE orders ADD COLUMN created_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='net_profit') THEN
    ALTER TABLE orders ADD COLUMN net_profit DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='sku') THEN
    ALTER TABLE order_items ADD COLUMN sku TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='product_name') THEN
    ALTER TABLE order_items ADD COLUMN product_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='vendor') THEN
    ALTER TABLE order_items ADD COLUMN vendor TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='line_price') THEN
    ALTER TABLE order_items ADD COLUMN line_price DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='line_discount') THEN
    ALTER TABLE order_items ADD COLUMN line_discount DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sku') THEN
    ALTER TABLE products ADD COLUMN sku TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_name') THEN
    ALTER TABLE products ADD COLUMN product_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='vendor') THEN
    ALTER TABLE products ADD COLUMN vendor TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='source') THEN
    ALTER TABLE products ADD COLUMN source TEXT DEFAULT 'shopify_csv';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='total_sold') THEN
    ALTER TABLE products ADD COLUMN total_sold INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='repurchase_rate') THEN
    ALTER TABLE products ADD COLUMN repurchase_rate DECIMAL(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='churn_correlation') THEN
    ALTER TABLE products ADD COLUMN churn_correlation DECIMAL(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='gross_margin_pct') THEN
    ALTER TABLE products ADD COLUMN gross_margin_pct DECIMAL(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='avg_selling_price') THEN
    ALTER TABLE products ADD COLUMN avg_selling_price DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='discount_usage_rate') THEN
    ALTER TABLE products ADD COLUMN discount_usage_rate DECIMAL(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='price') THEN
    ALTER TABLE products ADD COLUMN price DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='title') THEN
    ALTER TABLE revenue_leaks ADD COLUMN title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='severity') THEN
    ALTER TABLE revenue_leaks ADD COLUMN severity TEXT DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='confidence_explanation') THEN
    ALTER TABLE revenue_leaks ADD COLUMN confidence_explanation TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='recommended_action_json') THEN
    ALTER TABLE revenue_leaks ADD COLUMN recommended_action_json JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='affected_customers_count') THEN
    ALTER TABLE revenue_leaks ADD COLUMN affected_customers_count INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='email_hash') THEN
    ALTER TABLE customers ADD COLUMN email_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='accepts_marketing') THEN
    ALTER TABLE customers ADD COLUMN accepts_marketing BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='segment') THEN
    ALTER TABLE customers ADD COLUMN segment TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='churn_risk_score') THEN
    ALTER TABLE customers ADD COLUMN churn_risk_score DECIMAL(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='days_since_last_order') THEN
    ALTER TABLE customers ADD COLUMN days_since_last_order INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='total_spend') THEN
    ALTER TABLE customers ADD COLUMN total_spend DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='total_revenue') THEN
    ALTER TABLE customers ADD COLUMN total_revenue DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='lifetime_value') THEN
    ALTER TABLE customers ADD COLUMN lifetime_value DECIMAL(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='last_order_date') THEN
    ALTER TABLE customers ADD COLUMN last_order_date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='first_order_date') THEN
    ALTER TABLE customers ADD COLUMN first_order_date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='discount_usage_pct') THEN
    ALTER TABLE customers ADD COLUMN discount_usage_pct DECIMAL(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='created_at') THEN
    ALTER TABLE customers ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='updated_at') THEN
    ALTER TABLE customers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    console.log('Full schema migration completed.');

    const storeRes = await client.query('SELECT store_id FROM stores LIMIT 1');
    if (storeRes.rows.length === 0) {
      await client.query(
        `INSERT INTO stores (store_id, name, plan) VALUES (gen_random_uuid(), 'Default Store', 'pro')`
      );
      console.log('Created default store.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
