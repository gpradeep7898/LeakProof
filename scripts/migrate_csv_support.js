
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
});

const SCHEMA = `
DO $$
BEGIN
    -- 1. Update Orders Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='financial_status') THEN
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS financial_status TEXT,
        ADD COLUMN IF NOT EXISTS fulfillment_status TEXT,
        ADD COLUMN IF NOT EXISTS currency TEXT,
        ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_code TEXT;
    END IF;

    -- 2. Update Order Items Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='sku') THEN
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS sku TEXT,
        ADD COLUMN IF NOT EXISTS product_name TEXT,
        ADD COLUMN IF NOT EXISTS vendor TEXT,
        ADD COLUMN IF NOT EXISTS line_price DECIMAL(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS line_discount DECIMAL(12,2) DEFAULT 0;
    END IF;

    -- 3. Update Products Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='vendor') THEN
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS vendor TEXT,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'shopify_csv';
    END IF;

    -- 4. Create Discounts Table
    CREATE TABLE IF NOT EXISTS discounts (
        discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID REFERENCES stores(store_id),
        code TEXT,
        usage_count INT DEFAULT 0,
        total_discount_amount DECIMAL(12,2) DEFAULT 0,
        leakage_amount DECIMAL(12,2) DEFAULT 0, -- Amount given to discount-immune customers
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(store_id, code)
    );
    
    -- 5. Add status to Actions if needed (already handled in previous schema but double check)
    -- actions table status exists.

END $$;
`;

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running CSV support migration...');
        await client.query(SCHEMA);
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
