/**
 * GET /api/billing/status — current billing state for the merchant's store.
 * Syncs with Shopify on each call so the UI never shows stale state.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { syncSubscriptionFromShopify, getSubscription, hasActiveBilling, TRIAL_DAYS } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const storeId = await getStoreFromRequest(req)
    // Refresh from Shopify, fall back to DB state if the API call fails.
    const live = await syncSubscriptionFromShopify(storeId).catch(() => null)
    const sub = live ?? (await getSubscription(storeId))
    const active = await hasActiveBilling(storeId)

    return NextResponse.json({
      active,
      trialDays: TRIAL_DAYS,
      subscription: sub
        ? { status: sub.status, plan: sub.plan_name, trialEndsAt: sub.trial_ends_at }
        : null,
    })
  } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
    console.error('[billing/status] error:', err)
    return NextResponse.json({ error: 'Failed to load billing status' }, { status: 500 })
  }
}
