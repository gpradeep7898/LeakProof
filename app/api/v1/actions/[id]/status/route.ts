/**
 * Action Status Update API
 * POST /api/v1/actions/[id]/status
 */
import { NextRequest, NextResponse } from 'next/server'
import { execute, queryOne } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const storeId = await getStoreFromRequest(req)
        const { status } = await req.json()
        const actionId = params.id

        const validStatuses = ['pending', 'approved', 'executing', 'completed', 'failed', 'rejected']
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
        }

        const action = await queryOne(
            'SELECT action_id FROM actions WHERE action_id = $1 AND store_id = $2',
            [actionId, storeId]
        )
        if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })

        await execute(`
      UPDATE actions SET
        status = $1,
        ${status === 'approved' ? 'approved_at = NOW(),' : ''}
        updated_at = NOW()
      WHERE action_id = $2 AND store_id = $3
    `, [status, actionId, storeId])

        return NextResponse.json({ success: true, status })
    } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
