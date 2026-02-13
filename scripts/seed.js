const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakproof',
})

async function seed() {
  const client = await pool.connect()
  try {
    const csvPath = path.join(__dirname, '../data/demo-orders.csv')
    const buffer = fs.readFileSync(csvPath)
    // Call the ingest logic - we need to run it via the API or duplicate the logic
    console.log('Demo CSV ready at data/demo-orders.csv')
    console.log('Run: Upload this file via Data Connect > Upload CSV in the app.')
    console.log('Or use curl: curl -X POST -F "file=@data/demo-orders.csv" http://localhost:3000/api/csv/upload')
  } catch (err) {
    console.error('Seed error:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
