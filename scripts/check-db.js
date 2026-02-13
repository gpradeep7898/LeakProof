#!/usr/bin/env node
/**
 * Quick script to verify DB connection and that a store exists.
 * Run from project root: node scripts/check-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
})

async function check() {
  const client = await pool.connect()
  try {
    console.log('Checking database...')
    const storeRes = await client.query('SELECT store_id, name FROM stores LIMIT 1')
    if (storeRes.rows.length === 0) {
      console.log('❌ No store found. Run: npm run db:migrate')
      process.exit(1)
    }
    console.log('✓ Store exists:', storeRes.rows[0].store_id, '-', storeRes.rows[0].name)

    const tables = ['customers', 'orders', 'products', 'order_items']
    for (const t of tables) {
      const r = await client.query(`SELECT COUNT(*) as c FROM ${t}`)
      console.log(`  ${t}: ${r.rows[0].c} rows`)
    }
    console.log('✓ Database ready for CSV import.')
  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.message.includes('connect') || err.message.includes('ECONNREFUSED')) {
      console.log('   Make sure PostgreSQL is running and DATABASE_URL in .env.local is correct.')
    }
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

check()
