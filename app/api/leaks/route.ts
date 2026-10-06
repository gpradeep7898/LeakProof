import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { query } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { billingGuard } from '@/lib/billing'
import { LeakDetector } from '@/lib/services/leakDetector'

export async function GET(request: Request) {
  try {
    const storeId = await getStoreFromRequest(request)
    const billingRes = await billingGuard(storeId)
    if (billingRes) return billingRes
    const { searchParams } = new URL(request.url)
    const scan = searchParams.get('scan') === 'true'

    if (scan) {
      const detector = new LeakDetector(storeId);
      await detector.detectAllLeaks();
    }

    const rows = await query<{
      leak_id: string
      leak_type: string
      title: string
      description: string
      estimated_monthly_loss: string
      confidence_score: string
      confidence_explanation: string
      severity: string
      affected_customers_count: string
      recommended_action_json: unknown
      status: string
    }>(
      `SELECT leak_id, leak_type, title, description, estimated_monthly_loss,
              confidence_score, confidence_explanation, severity, affected_customers_count,
              recommended_action_json, status
       FROM revenue_leaks WHERE store_id = $1 AND status NOT IN ('fixed', 'ignored')
       ORDER BY estimated_monthly_loss DESC NULLS LAST`,
      [storeId]
    )

    const leaks = rows.map((r) => ({
      id: r.leak_id,
      leak_type: r.leak_type,
      title: r.title || r.leak_type,
      description: r.description,
      estimated_monthly_loss: parseFloat(r.estimated_monthly_loss || '0'),
      confidence_score: parseFloat(r.confidence_score || '0'),
      confidence_explanation: r.confidence_explanation || '',
      severity: r.severity || 'medium',
      affected_customers_count: parseInt(r.affected_customers_count || '0'),
      recommended_action: (r.recommended_action_json as Record<string, unknown>) || {},
      status: r.status,
    }))

    return NextResponse.json(leaks)
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('Leaks error:', err)
    return NextResponse.json({ error: 'Failed to load leaks' }, { status: 500 })
  }
}
