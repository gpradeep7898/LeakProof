import { NextRequest, NextResponse } from 'next/server'
import { getDefaultStoreId } from '@/lib/store'
import { ingestDenormalizedCSV } from '@/lib/csv-ingest'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided. Upload a CSV file.' }, { status: 400 })
    }

    const contentType = file.type
    const name = file.name?.toLowerCase() || ''
    if (!name.endsWith('.csv') && contentType !== 'text/csv' && contentType !== 'application/csv') {
      return NextResponse.json({ error: 'Invalid file type. Only CSV files are accepted.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
    }

    const storeId = await getDefaultStoreId()
    const result = await ingestDenormalizedCSV(buffer, storeId)

    return NextResponse.json({
      success: true,
      message: 'Data uploaded and analyzed successfully.',
      inserted: result,
    })
  } catch (err) {
    console.error('CSV upload error:', err)
    const rawMsg = err instanceof Error ? err.message : 'Upload failed.'
    let msg = rawMsg

    // Sanitize Postgres errors for user-facing messages
    if (msg.includes('INSERT has more target columns than expressions')) {
      msg = 'Data format mismatch. Please ensure your CSV has columns: order_id, order_date, and optionally customer_id, product_id, order_value.'
    } else if (msg.includes('column') && msg.includes('does not exist')) {
      msg = 'Unexpected data format. Please use our sample CSV format (see Connect guide).'
    } else if (msg.includes('violates foreign key') || msg.includes('foreign key constraint')) {
      msg = 'Data integrity error: a store record may be missing. Run db:migrate from project root, then try again.'
    } else if (msg.includes('CSV is empty')) {
      msg = 'The uploaded file appears empty. Please upload a valid CSV with headers and rows.'
    } else if (msg.includes('No store configured')) {
      msg = 'No store found. Run: npm run db:migrate'
    }

    // In development, include raw error to help debug
    const payload: { error: string; rawError?: string } = { error: msg }
    if (process.env.NODE_ENV === 'development') {
      payload.rawError = rawMsg
    }
    return NextResponse.json(payload, { status: 500 })
  }
}
