require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
})

const UPGRADE_SCHEMA = `
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Stores (add detailed fields if missing, usually handled in other migrations but ensure created_at/updated_at exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='updated_at') THEN
        ALTER TABLE stores ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;


-- 1. Updates to Orders table for Profit Model
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_tax') THEN
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS shopify_order_id TEXT, -- mapping to external ID
        ADD COLUMN IF NOT EXISTS total_price DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS subtotal_price DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_tax DECIMAL(12,2) DEFAULT 0,
        
        -- Costs
        ADD COLUMN IF NOT EXISTS cogs DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_discounts DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS platform_fees DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS payment_processing_fees DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ad_attribution_cost DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS estimated_return_cost DECIMAL(12,2) DEFAULT 0,
        
        -- Calculated Fields
        ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS net_profit DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS profit_margin_pct DECIMAL(5,2) DEFAULT 0,
        
        -- Customer Context
        ADD COLUMN IF NOT EXISTS is_repeat_customer BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS customer_order_number INT,
        ADD COLUMN IF NOT EXISTS acquisition_channel TEXT,
        
        ADD COLUMN IF NOT EXISTS message TEXT, -- Optional message field if needed
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        -- Add trigger for updated_at
        DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
        CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;


-- 2. Updates to Customers table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='customer_hash') THEN
        ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS customer_hash TEXT,
        
        -- Aggregated Metrics
        -- total_orders exists
        -- total_revenue exists (as total_spend)
        ADD COLUMN IF NOT EXISTS total_profit DECIMAL(12,2) DEFAULT 0,
        -- avg_order_value exists
        ADD COLUMN IF NOT EXISTS customer_acquisition_cost DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ltv_cac_ratio DECIMAL(10,2) DEFAULT 0,
        
        -- Behavioral
        ADD COLUMN IF NOT EXISTS avg_days_between_orders DECIMAL(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS predicted_next_order_date TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS churn_risk_score DECIMAL(5,2) DEFAULT 0,
        
        -- Segmentation
        ADD COLUMN IF NOT EXISTS segment TEXT, -- 'vip', 'loyal', 'at_risk', etc.
        ADD COLUMN IF NOT EXISTS discount_sensitivity DECIMAL(5,2) DEFAULT 0,
        
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
        CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 3. Updates to Products table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sku') THEN
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
        ADD COLUMN IF NOT EXISTS sku TEXT,
        
        -- Profit Metrics
        ADD COLUMN IF NOT EXISTS cogs DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS avg_selling_price DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS gross_margin_pct DECIMAL(5,2) DEFAULT 0,
        
        -- Behavioral
        ADD COLUMN IF NOT EXISTS total_sold INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS repurchase_rate DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS churn_correlation DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS subscription_suitable BOOLEAN DEFAULT FALSE,
        
        -- Performance
        ADD COLUMN IF NOT EXISTS inventory_turnover DECIMAL(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS days_of_inventory DECIMAL(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS current_inventory INT DEFAULT 0,
        
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        DROP TRIGGER IF EXISTS update_products_updated_at ON products;
        CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 4. Revenue Leaks Table (Ensure comprehensive)
DO $$
BEGIN
    -- Check if we need to add columns to existing table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue_leaks' AND column_name='title') THEN
        ALTER TABLE revenue_leaks
        ADD COLUMN IF NOT EXISTS title TEXT,
        -- leak_type exists
        -- description exists
        -- estimated_monthly_loss exists
        ADD COLUMN IF NOT EXISTS severity TEXT, -- 'high', 'medium', 'low'
        ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,2) DEFAULT 0,
        
        -- Evidence
        ADD COLUMN IF NOT EXISTS affected_customers_count INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS affected_orders_count INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS data_quality TEXT,
        
        -- Status
        -- status exists
        
        -- Action
        ADD COLUMN IF NOT EXISTS recommended_action_json JSONB,
        ADD COLUMN IF NOT EXISTS expected_outcome TEXT,
        ADD COLUMN IF NOT EXISTS fix_complexity TEXT,
        
        ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        DROP TRIGGER IF EXISTS update_revenue_leaks_updated_at ON revenue_leaks;
        CREATE TRIGGER update_revenue_leaks_updated_at BEFORE UPDATE ON revenue_leaks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 5. Actions Table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='actions' AND column_name='action_type') THEN
        ALTER TABLE actions
        ADD COLUMN IF NOT EXISTS action_type TEXT,
        ADD COLUMN IF NOT EXISTS title TEXT,
        -- description is already there
        ADD COLUMN IF NOT EXISTS configuration JSONB,
        ADD COLUMN IF NOT EXISTS risk_level TEXT,
        ADD COLUMN IF NOT EXISTS reversible BOOLEAN DEFAULT FALSE,
        
        -- Execution
        ADD COLUMN IF NOT EXISTS auto_execute BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS approved_by TEXT,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
        
        -- Outcome Tracking
        ADD COLUMN IF NOT EXISTS baseline_value DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expected_impact DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS actual_impact DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS measurement_window_days INT DEFAULT 30;
    END IF;
END $$;

-- 6. Benchmarks Table (New)
CREATE TABLE IF NOT EXISTS benchmarks (
    benchmark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    industry_category TEXT,
    revenue_range TEXT,
    
    repeat_customer_rate DECIMAL(5,2),
    avg_order_value DECIMAL(12,2),
    gross_margin_pct DECIMAL(5,2),
    net_profit_margin_pct DECIMAL(5,2),
    discount_rate DECIMAL(5,2),
    churn_rate DECIMAL(5,2),
    ltv_cac_ratio DECIMAL(10,2),
    avg_days_to_second_order DECIMAL(10,2),
    
    sample_size INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(industry_category, revenue_range)
);

-- 7. Merchant Settings Table (New)
CREATE TABLE IF NOT EXISTS merchant_settings (
    store_id UUID PRIMARY KEY REFERENCES stores(store_id),
    
    auto_execute_low_risk BOOLEAN DEFAULT FALSE,
    auto_execute_medium_risk BOOLEAN DEFAULT FALSE,
    require_approval_high_risk BOOLEAN DEFAULT TRUE,
    
    slack_webhook_url TEXT,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT FALSE,
    
    klaviyo_api_key TEXT,
    meta_ads_access_token TEXT,
    google_ads_customer_id TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Trigger for merchant_settings updated_at
DROP TRIGGER IF EXISTS update_merchant_settings_updated_at ON merchant_settings;
CREATE TRIGGER update_merchant_settings_updated_at BEFORE UPDATE ON merchant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_customer_hash ON customers(customer_hash);
CREATE INDEX IF NOT EXISTS idx_revenue_leaks_status ON revenue_leaks(status);
`;

async function upgrade() {
  const client = await pool.connect()
  try {
    console.log('Starting migration to Profit OS schema...');
    await client.query(UPGRADE_SCHEMA)
    console.log('Migration completed successfully.')
  } catch (err) {
    console.error('Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

upgrade()
