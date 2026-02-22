
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
});

// To manage 'Upsert', we often need helper functions
async function seedFromCSV() {
    const csvPath = path.join(__dirname, '../public/leakproof_test_data.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('CSV file not found. Run generate_test_data.js first.');
        process.exit(1);
    }

    console.log('Reading CSV...');
    const fileContent = fs.readFileSync(csvPath);
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    console.log(`Found ${records.length} records. Importing to DB...`);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get or Create Default Store
        let storeRes = await client.query("SELECT store_id FROM stores LIMIT 1");
        let storeId;
        if (storeRes.rows.length === 0) {
            const newStore = await client.query("INSERT INTO stores (store_id, name) VALUES (gen_random_uuid(), 'Test Store') RETURNING store_id");
            storeId = newStore.rows[0].store_id;
        } else {
            storeId = storeRes.rows[0].store_id;
        }

        console.log(`Using Store ID: ${storeId}`);

        // Helper sets to avoid duplicates in batch
        const processedCustomers = new Set();
        const processedProducts = new Set();

        // 2. Process Records
        for (const row of records) {

            // Upsert Customer
            if (!processedCustomers.has(row.customer_id)) {
                await client.query(`
                    INSERT INTO customers (customer_id, store_id, shopify_customer_id, customer_hash, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (customer_id, store_id) DO NOTHING
                `, [row.customer_id, storeId, row.customer_id, row.email]); // email as hash for demo
                processedCustomers.add(row.customer_id);
            }

            // Upsert Products (from line items JSON)
            // The CSV has line_items as a string, need to parse
            let lineItems = [];
            try {
                lineItems = JSON.parse(row.line_items);
            } catch (e) {
                // ignore
            }

            for (const item of lineItems) {
                if (!processedProducts.has(item.product_id)) {
                    // We don't have all product details in line item, but we insert stub
                    // We need 'cogs' from the order row (total cogs) to approximate, but better to have product master.
                    // For this seed script, let's assume we can lazily create products
                    await client.query(`
                        INSERT INTO products (product_id, store_id, shopify_product_id, avg_selling_price, cogs)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (product_id, store_id) DO NOTHING
                    `, [item.product_id, storeId, item.product_id, item.price, item.price * 0.5]); // naive assumption
                    processedProducts.add(item.product_id);
                }

                // Order Items
                // We add them after order creation usually, but let's stick to core orders for speed
            }

            // Insert Order
            await client.query(`
                INSERT INTO orders (
                    order_id, store_id, customer_id, shopify_order_id, 
                    total_price, subtotal_price, total_tax, total_discounts,
                    shipping_cost, cogs, platform_fees, ad_attribution_cost,
                    net_profit, created_at
                ) VALUES (
                    $1, $2, $3, $4, 
                    $5, $6, $7, $8, 
                    $9, $10, $11, $12, 
                    $13, $14
                )
                ON CONFLICT (order_id, store_id) DO NOTHING
            `, [
                row.order_id, storeId, row.customer_id, row.order_id,
                row.total_price, row.subtotal_price, row.total_tax, row.total_discounts,
                row.shipping_cost, row.cogs, row.platform_fees, row.ad_attribution_cost,
                // Net Profit = Revenue - COGS - Shipping - Discounts - Fees - Ad Cost
                (parseFloat(row.total_price) - parseFloat(row.cogs) - parseFloat(row.shipping_cost) - parseFloat(row.total_discounts) - parseFloat(row.platform_fees) - parseFloat(row.ad_attribution_cost)),
                row.created_at
            ]);

            // Create Order Items linking
            for (const item of lineItems) {
                await client.query(`
                    INSERT INTO order_items (order_id, store_id, product_id, quantity, line_total)
                    VALUES ($1, $2, $3, $4, $5)
                `, [row.order_id, storeId, item.product_id, item.quantity, item.price * item.quantity]);
            }
        }

        // Run Aggregations?
        console.log('Running aggregations...');

        await client.query('COMMIT');
        console.log('Import successful!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Import failed', e);
    } finally {
        client.release();
        await pool.end();
    }
}

seedFromCSV();
