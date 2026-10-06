/** GET /api/billing/plans — public plan catalog */
import { NextResponse } from 'next/server'
import { PLANS, TRIAL_DAYS } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    trialDays: TRIAL_DAYS,
    plans: Object.values(PLANS).map((p) => ({
      key: p.key,
      name: p.name,
      price: p.price,
      blurb: p.blurb,
      features: [...p.features],
    })),
  })
}
