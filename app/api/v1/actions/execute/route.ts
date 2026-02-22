/**
 * Action Execute API
 * POST /api/v1/actions/execute
 */
import { NextRequest, NextResponse } from 'next/server'
import { ActionExecutor } from '@/lib/services/actionExecutor'
import { execute } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function POST(req: NextRequest) {
    try {
        const storeId = await getDefaultStoreId()
        const body = await req.json()
        const { actionId, action_id } = body
        const id = actionId || action_id

        if (!id) {
            return NextResponse.json({ error: 'actionId is required' }, { status: 400 })
        }

        // Mark as approved first
        await execute(`
      UPDATE actions SET status = 'approved', approved_at = NOW(), approved_by = 'founder', updated_at = NOW()
      WHERE action_id = $1 AND store_id = $2
    `, [id, storeId])

        const executor = new ActionExecutor()
        const result = await executor.executeAction(id)

        return NextResponse.json({
            success: result.success,
            message: result.message,
            external_id: result.external_id,
            error: result.error,
        }, { status: result.success ? 200 : 500 })
    } catch (err) {
        console.error('[Actions Execute] Error:', err)
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
