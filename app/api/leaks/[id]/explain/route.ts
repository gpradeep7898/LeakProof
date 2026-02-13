import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getDefaultStoreId } from '@/lib/store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const storeId = await getDefaultStoreId()
    const leak = await queryOne<{
      description: string
      estimated_monthly_loss: string
      recommended_action: string
      confidence_explanation: string
      affected_count: string
    }>(
      `SELECT description, estimated_monthly_loss, recommended_action, confidence_explanation, affected_count
       FROM revenue_leaks WHERE leak_id = $1 AND store_id = $2`,
      [id, storeId]
    )

    if (!leak) {
      return NextResponse.json({ error: 'Leak not found' }, { status: 404 })
    }

    const loss = parseFloat(leak.estimated_monthly_loss || '0')
    const explain = `${leak.description} If no action is taken, you could lose approximately $${Math.round(loss).toLocaleString()} in the next 30 days. ${leak.recommended_action} ${leak.confidence_explanation}`

    return NextResponse.json({ explain })
  } catch (err) {
    console.error('Explain error:', err)
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 })
  }
}
