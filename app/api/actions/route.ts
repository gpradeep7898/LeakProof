import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { billingGuard } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = await getStoreFromRequest(request)
    const billingRes = await billingGuard(storeId)
    if (billingRes) return billingRes
    const rows = await query<{
      action_id: string
      description: string
      what: string
      why: string
      next_step: string
      potential_gain: string
      confidence_score: string
      confidence_explanation: string
      status: string
      difficulty: string
    }>(
      `SELECT action_id, description, what, why, next_step, potential_gain, confidence_score,
              confidence_explanation, status, difficulty
       FROM actions WHERE store_id = $1 ORDER BY potential_gain DESC`,
      [storeId]
    )

    const actions = rows.map((r) => ({
      id: r.action_id,
      description: r.description || r.what,
      what: r.what || r.description,
      why: r.why,
      nextStep: r.next_step,
      potentialGain: parseFloat(r.potential_gain || '0'),
      confidenceScore: parseFloat(r.confidence_score || '0'),
      confidenceExplanation: r.confidence_explanation || '',
      status: r.status || 'todo',
      difficulty: r.difficulty || 'Moderate',
    }))

    const todo = actions.filter((a) => a.status === 'todo').length
    const inProgress = actions.filter((a) => a.status === 'in_progress').length
    const completed = actions.filter((a) => a.status === 'completed').length

    return NextResponse.json({
      actions,
      summary: { todo, inProgress, completed, recovered: 0 },
      totalCompleted: completed,
    })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('Actions error:', err)
    return NextResponse.json({ error: 'Failed to load actions' }, { status: 500 })
  }
}
