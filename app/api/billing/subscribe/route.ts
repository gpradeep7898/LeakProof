/**
 * POST /api/billing/subscribe — create a Shopify app subscription.
 * Body: { plan: 'starter' | 'growth' | 'scale' }
 * Returns: { confirmationUrl } — redirect the merchant there to approve.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { createSubscription, PLANS, type PlanKey } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const storeId = await getStoreFromRequest(req)
    const body = (await req.json().catch(() => ({}))) as { plan?: string }
    const planKey = body.plan as PlanKey

    if (!planKey || !(planKey in PLANS)) {
      return NextResponse.json(
        { error: `Unknown plan. Choose one of: ${Object.keys(PLANS).join(', ')}` },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const returnUrl = `${appUrl}/app/billing/confirm`
    const { confirmationUrl } = await createSubscription(storeId, planKey, returnUrl)

    return NextResponse.json({ confirmationUrl })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('[billing/subscribe] error:', err)
    return NextResponse.json({ error: 'Failed to start subscription' }, { status: 500 })
  }
}
