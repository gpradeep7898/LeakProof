import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET() {
  try {
    const storeId = await getDefaultStoreId()
    const rows = await query<{
      leak_id: string
      leak_type: string
      description: string
      estimated_monthly_loss: string
      confidence_score: string
      confidence_explanation: string
      recommended_action: string
      priority_rank: string
      affected_count: string
    }>(
      `SELECT leak_id, leak_type, description, estimated_monthly_loss, confidence_score,
              confidence_explanation, recommended_action, priority_rank, affected_count
       FROM revenue_leaks WHERE store_id = $1 AND status = 'active'
       ORDER BY estimated_monthly_loss DESC`,
      [storeId]
    )

    const leaks = rows.map((r) => ({
      id: r.leak_id,
      type: r.leak_type,
      description: r.description,
      estimatedMonthlyLoss: parseFloat(r.estimated_monthly_loss || '0'),
      confidenceScore: parseFloat(r.confidence_score || '0'),
      confidenceExplanation: r.confidence_explanation || '',
      recommendedAction: r.recommended_action || '',
      priorityRank: parseInt(r.priority_rank || '0'),
      affectedCount: parseInt(r.affected_count || '0'),
    }))

    const totalAtRisk = leaks.reduce((s, l) => s + l.estimatedMonthlyLoss, 0)
    const pctRevenue = 0 // Could compute from metrics if needed

    return NextResponse.json({
      leaks,
      totalLeaks: leaks.length,
      totalAtRisk,
      pctRevenue,
    })
  } catch (err) {
    console.error('Leaks error:', err)
    return NextResponse.json({ error: 'Failed to load leaks' }, { status: 500 })
  }
}
