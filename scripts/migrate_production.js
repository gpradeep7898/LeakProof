const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
});

async function migrate() {
    console.log('Running production schema migration...');
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'schema_production.sql'), 'utf-8');
        await pool.query(sql);
        console.log('Production schema applied successfully.');
    } catch (e) {
        console.error('Failed to run migration:', e);
    } finally {
        await pool.end();
    }
}

migrate();
