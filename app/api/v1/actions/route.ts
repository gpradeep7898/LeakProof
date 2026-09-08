import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getStoreFromRequest } from '@/lib/store'

export async function GET(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req)
        const { searchParams } = req.nextUrl
        const status = searchParams.get('status')

        let sql = `
      SELECT
        a.action_id AS id,
        a.description,
        a.what,
        a.why,
        a.next_step,
        a.potential_gain AS expected_impact,
        a.confidence_score,
        a.status,
        a.difficulty,
        a.outcome,
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

        sql += ` ORDER BY a.potential_gain DESC, a.created_at DESC`

        const actions = await query<Record<string, unknown>>(sql, params)

        // Map to the shape the Actions page expects
        const mapped = actions.map((a) => ({
            id: a.id,
            action_type: a.what || 'fix',
            title: a.description,
            description: a.why || a.description,
            risk_level: a.difficulty === 'Hard' ? 'high' : a.difficulty === 'Moderate' ? 'medium' : 'low',
            reversible: false,
            status: a.status === 'todo' ? 'pending' : a.status === 'in_progress' ? 'executing' : a.status,
            requires_approval: true,
            expected_impact: parseFloat(String(a.expected_impact || 0)),
            actual_impact: 0,
            baseline_value: 0,
            variance: 0,
            configuration: {},
            undo_data: null,
            approved_at: null,
            executed_at: null,
            measurement_date: null,
            leak_title: a.leak_title || '',
            leak_type: a.leak_type || '',
            leak_severity: a.leak_severity || '',
            created_at: a.created_at,
        }))

        const summary = {
            pending: mapped.filter((a) => a.status === 'pending').length,
            approved: 0,
            executing: mapped.filter((a) => a.status === 'executing').length,
            completed: mapped.filter((a) => a.status === 'completed').length,
            failed: 0,
            totalExpectedImpact: mapped.reduce((s, a) => s + a.expected_impact, 0),
            totalActualImpact: 0,
        }

        return NextResponse.json({ actions: mapped, summary })
    } catch (err) {
        console.error('[Actions API] Error:', err)
        return NextResponse.json({ error: 'Failed to load actions', actions: [] }, { status: 500 })
    }
}
