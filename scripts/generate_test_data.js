const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

// Simple random data generators
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(2));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Constants
const STORE_ID = 'test-store-123';
const NUM_ORDERS = 5000;
const NUM_CUSTOMERS = 1500;
const NUM_PRODUCTS = 50;

// 1. Generate Products
const products = [];
for (let i = 1; i <= NUM_PRODUCTS; i++) {
    const price = randomFloat(20, 150);
    const margin = randomFloat(0.1, 0.6);
    products.push({
        product_id: `prod_${i}`,
        title: `Product ${i} - ${pick(['Classic', 'Premium', 'Basic'])} ${pick(['Shirt', 'Pants', 'Shoes', 'Accessory'])}`,
        price: price,
        cogs: parseFloat((price * (1 - margin)).toFixed(2)),
        category: pick(['Apparel', 'Footwear', 'Accessories']),
        sku: `SKU-${1000 + i}`
    });
}

// 2. Generate Customers
const customers = [];
for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    customers.push({
        customer_id: `cust_${i}`,
        email: `customer${i}@example.com`,
        segment: pick(['vip', 'loyal', 'at_risk', 'new', 'churned']),
        acquisition_channel: pick(['facebook', 'google', 'organic', 'email'])
    });
}

// 3. Generate Orders
const orders = [];
const startDate = new Date('2023-01-01');
const endDate = new Date(); // Today

for (let i = 1; i <= NUM_ORDERS; i++) {
    const customer = pick(customers);
    const numItems = randomInt(1, 4);
    const orderItems = [];
    let subtotal = 0;
    let totalCogs = 0;

    for (let j = 0; j < numItems; j++) {
        const prod = pick(products);
        const qty = randomInt(1, 2);
        subtotal += prod.price * qty;
        totalCogs += prod.cogs * qty;
        orderItems.push({
            product_id: prod.product_id,
            quantity: qty,
            price: prod.price
        });
    }

    const discountRate = Math.random() < 0.3 ? randomFloat(0.1, 0.25) : 0; // 30% chance of discount
    const discountAmount = parseFloat((subtotal * discountRate).toFixed(2));
    const shipping = subtotal > 100 ? 0 : 15.00; // Free shipping over $100
    const tax = parseFloat(((subtotal - discountAmount) * 0.08).toFixed(2));
    const total = parseFloat((subtotal - discountAmount + shipping + tax).toFixed(2));

    // Costs
    const platformFee = parseFloat((total * 0.029 + 0.30).toFixed(2));
    const adCost = customer.acquisition_channel !== 'organic' && Math.random() < 0.2 ? 25.00 : 0; // Attribution logic

    orders.push({
        order_id: `ord_${10000 + i}`,
        customer_id: customer.customer_id,
        email: customer.email,
        created_at: randomDate(startDate, endDate).toISOString(),
        total_price: total,
        subtotal_price: subtotal,
        total_tax: tax,
        total_discounts: discountAmount,
        shipping_cost: 10.00, // Actual shipping cost to merchant
        shipping_charged: shipping,
        cogs: totalCogs,
        platform_fees: platformFee,
        ad_attribution_cost: adCost,
        payment_processing_fees: parseFloat((total * 0.01).toFixed(2)),
        // Line items flattened or simulated as JSON string for CSV simplicity
        line_items: JSON.stringify(orderItems),
        status: 'paid'
    });
}

// Convert to CSV
const fields = Object.keys(orders[0]);
const json2csvParser = new Parser({ fields });
const csv = json2csvParser.parse(orders);

// Write to public folder so it can be downloaded
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}
const filePath = path.join(publicDir, 'leakproof_test_data.csv');

fs.writeFileSync(filePath, csv);

console.log(`Generated ${NUM_ORDERS} orders for testing.`);
console.log(`File saved at: ${filePath}`);
console.log(`Download URL: /leakproof_test_data.csv`);
