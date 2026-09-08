import { NextRequest, NextResponse } from 'next/server'
import { execute, queryOne } from '@/lib/db'
import { getStoreFromRequest } from '@/lib/store'

/** Update leak status (updates linked action) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const status = body?.status as string
    const valid = ['planned', 'executed', 'completed', 'ignored', 'todo']
    if (!status || !valid.includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Use: planned, executed, completed, ignored, todo' }, { status: 400 })
    }

    const storeId = await getStoreFromRequest(null)
    const mapping: Record<string, string> = { executed: 'completed' }

    const action = await queryOne<{ action_id: string }>(
      'SELECT action_id FROM actions WHERE leak_id = $1 AND store_id = $2',
      [id, storeId]
    )

    if (action) {
      const s = mapping[status] || status
      await execute(
        'UPDATE actions SET status = $1, updated_at = NOW() WHERE action_id = $2',
        [s, action.action_id]
      )
    } else {
      await execute(
        'UPDATE revenue_leaks SET status = $1, updated_at = NOW() WHERE leak_id = $2 AND store_id = $3',
        [status === 'executed' ? 'fixed' : status, id, storeId]
      )
    }

    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('Leak status update error:', err)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
