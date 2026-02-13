import { NextRequest, NextResponse } from 'next/server'
import { execute, queryOne } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const status = body?.status as string
    if (!['todo', 'in_progress', 'completed', 'ignored', 'planned'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const storeId = await getDefaultStoreId()
    const existing = await queryOne<{ action_id: string }>(
      'SELECT action_id FROM actions WHERE action_id = $1 AND store_id = $2',
      [id, storeId]
    )
    if (!existing) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 })
    }

    await execute(
      `UPDATE actions SET status = $1, updated_at = NOW() WHERE action_id = $2 AND store_id = $3`,
      [status, id, storeId]
    )

    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('Action status update error:', err)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
