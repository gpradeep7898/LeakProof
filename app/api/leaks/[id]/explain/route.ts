import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const storeId = await getStoreFromRequest(request)
    const leak = await queryOne<{
      title: string
      description: string
      estimated_monthly_loss: string
      recommended_action: string
      recommended_action_json: unknown
      confidence_explanation: string
      affected_count: string
      affected_customers_count: string
    }>(
      `SELECT title, description, estimated_monthly_loss, recommended_action, recommended_action_json,
              confidence_explanation, affected_count, affected_customers_count
       FROM revenue_leaks WHERE leak_id = $1 AND store_id = $2`,
      [id, storeId]
    )

    if (!leak) {
      return NextResponse.json({ error: 'Leak not found' }, { status: 404 })
    }

    const loss = parseFloat(leak.estimated_monthly_loss || '0')
    const action = leak.recommended_action
      || (leak.recommended_action_json && typeof leak.recommended_action_json === 'object'
        ? (leak.recommended_action_json as { type?: string; implementation?: string }).type || ''
        : '')
    const explain = `${leak.description} If no action is taken, you could lose approximately $${Math.round(loss).toLocaleString()} in the next 30 days. Recommended action: ${action}. ${leak.confidence_explanation || ''}`

    return NextResponse.json({ explain })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('Explain error:', err)
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 })
  }
}
