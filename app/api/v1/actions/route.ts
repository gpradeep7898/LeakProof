/**
 * Actions v1 API
 * GET /api/v1/actions — List actions with status filtering
 * POST /api/v1/actions — Create action
 */
import { NextRequest, NextResponse } from 'next/server'
import { query, execute, queryOne } from '@/lib/db'
import { ActionExecutor } from '@/lib/services/actionExecutor'
import { getDefaultStoreId } from '@/lib/store'

export async function GET(req: NextRequest) {
    try {
        const storeId = await getDefaultStoreId()
        const { searchParams } = req.nextUrl
        const status = searchParams.get('status')
        const riskLevel = searchParams.get('risk_level')

        let sql = `
      SELECT
        a.action_id AS id,
        a.action_type,
        a.title,
        a.description,
        a.risk_level,
        a.reversible,
        a.status,
        a.requires_approval,
        a.auto_execute,
        a.expected_impact,
        a.actual_impact,
        a.baseline_value,
        a.variance,
        a.configuration,
        a.undo_data,
        a.approved_at,
        a.executed_at,
        a.measurement_date,
        a.shopify_script_id,
        a.klaviyo_flow_id,
        a.created_at,
        a.updated_at,
        rl.title AS leak_title,
        rl.leak_type,
        rl.severity AS leak_severity
      FROM actions a
      LEFT JOIN revenue_leaks rl ON rl.leak_id = a.leak_id
      WHERE a.store_id = $1
    `
        const params: (string | number)[] = [storeId]

        if (status) {
            sql += ` AND a.status = $${params.length + 1}`
            params.push(status)
        }
        if (riskLevel) {
            sql += ` AND a.risk_level = $${params.length + 1}`
            params.push(riskLevel)
        }

        sql += ` ORDER BY a.expected_impact DESC, a.created_at DESC`

        const actions = await query<Record<string, unknown>>(sql, params)

        const summary = {
            pending: actions.filter((a) => a.status === 'pending').length,
            approved: actions.filter((a) => a.status === 'approved').length,
            executing: actions.filter((a) => a.status === 'executing').length,
            completed: actions.filter((a) => a.status === 'completed').length,
            failed: actions.filter((a) => a.status === 'failed').length,
            totalExpectedImpact: actions.reduce((s, a) => s + parseFloat(String(a.expected_impact || 0)), 0),
            totalActualImpact: actions.reduce((s, a) => s + parseFloat(String(a.actual_impact || 0)), 0),
        }

        return NextResponse.json({ actions, summary })
    } catch (err) {
        console.error('[Actions API] Error:', err)
        return NextResponse.json({ error: 'Failed to load actions', actions: [] }, { status: 500 })
    }
}
