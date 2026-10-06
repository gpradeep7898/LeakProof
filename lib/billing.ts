/**
 * Shopify Billing (App Subscriptions) — the revenue path.
 *
 * Plans: Starter $19 / Growth $49 / Scale $99, all with a 14-day free trial.
 * Charges go through Shopify's Billing API (required for App Store apps) —
 * never an external payment link.
 */
import { NextResponse } from 'next/server'
import { query, queryOne, execute } from './db'
import { createGraphQLClient } from './shopify/graphql-client'
import { getStoreAccessToken } from './shop-token'

export const TRIAL_DAYS = 14

export const PLANS = {
  starter: {
    key: 'starter',
    name: 'LeakProof Starter',
    price: 19,
    blurb: 'For new stores finding their first leaks.',
    features: ['Leak detection & alerts', 'Money Snapshot', 'Weekly founder summary', '1 store'],
  },
  growth: {
    key: 'growth',
    name: 'LeakProof Growth',
    price: 49,
    blurb: 'For growing stores plugging leaks every week.',
    features: [
      'Everything in Starter',
      'Payout Fee Decoder',
      'App-Stack ROI Auditor',
      'Discount P&L per code',
      'One-click corrective actions',
    ],
  },
  scale: {
    key: 'scale',
    name: 'LeakProof Scale',
    price: 99,
    blurb: 'For high-volume stores where small leaks are big money.',
    features: ['Everything in Growth', 'Ad-waste truth layer', 'Priority leak scans', 'Benchmarks vs similar stores'],
  },
} as const

export type PlanKey = keyof typeof PLANS

function isTestMode(): boolean {
  if (process.env.BILLING_TEST_MODE === 'true') return true
  if (process.env.BILLING_TEST_MODE === 'false') return false
  return process.env.NODE_ENV !== 'production' // safe default: test charges off-production
}

interface SubscriptionRow {
  status: string
  plan_name: string
  trial_ends_at: string | null
}

/** Latest subscription state from our DB. */
export async function getSubscription(storeId: string): Promise<SubscriptionRow | null> {
  return queryOne<SubscriptionRow>(
    `SELECT status, plan_name, trial_ends_at FROM app_subscriptions
     WHERE store_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [storeId]
  )
}

/** True when the store may use paid features: active sub, or dev bypass. */
export async function hasActiveBilling(storeId: string): Promise<boolean> {
  // Local demo/dev never hits billing.
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_UNAUTHENTICATED === 'true') {
    return true
  }
  const sub = await getSubscription(storeId)
  if (!sub) return false
  const status = sub.status.toLowerCase()
  if (status === 'active') return true
  return false
}

/**
 * Route-handler guard. Returns a 402 response when billing is required,
 * or null when the request may proceed.
 */
export async function billingGuard(storeId: string): Promise<NextResponse | null> {
  if (await hasActiveBilling(storeId)) return null
  return NextResponse.json(
    { error: 'Payment required', subscribeUrl: '/app/billing' },
    { status: 402 }
  )
}

/** Create a Shopify app subscription and return the merchant confirmation URL. */
export async function createSubscription(
  storeId: string,
  planKey: PlanKey,
  returnUrl: string
): Promise<{ confirmationUrl: string; subscriptionId: string }> {
  const plan = PLANS[planKey]
  if (!plan) throw new Error(`Unknown plan: ${planKey}`)

  const token = await getStoreAccessToken(storeId)
  const store = await queryOne<{ shopify_domain: string }>(
    'SELECT shopify_domain FROM stores WHERE store_id = $1',
    [storeId]
  )
  if (!token || !store?.shopify_domain) {
    throw new Error('Store is not connected to Shopify')
  }

  const client = createGraphQLClient(store.shopify_domain, token)
  const data = await client.query<{
    appSubscriptionCreate: {
      userErrors: Array<{ field: string[]; message: string }>
      confirmationUrl: string | null
      appSubscription: { id: string; status: string } | null
    }
  }>(
    `mutation appSubscriptionCreate(
       $name: String!, $returnUrl: URL!, $test: Boolean, $trialDays: Int,
       $lineItems: [AppSubscriptionLineItemInput!]!
     ) {
       appSubscriptionCreate(
         name: $name, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, lineItems: $lineItems
       ) {
         userErrors { field message }
         confirmationUrl
         appSubscription { id status }
       }
     }`,
    {
      name: plan.name,
      returnUrl,
      test: isTestMode(),
      trialDays: TRIAL_DAYS,
      lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: plan.price, currencyCode: 'USD' } } } }],
    }
  )

  const result = data.appSubscriptionCreate
  if (result.userErrors?.length) {
    throw new Error(`Shopify billing error: ${result.userErrors.map((e) => e.message).join('; ')}`)
  }
  if (!result.confirmationUrl || !result.appSubscription) {
    throw new Error('Shopify did not return a confirmation URL')
  }

  await execute(
    `INSERT INTO app_subscriptions (store_id, shopify_subscription_id, plan_name, price_cents, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [storeId, result.appSubscription.id, planKey, plan.price * 100, result.appSubscription.status.toLowerCase()]
  )
  await execute(`UPDATE stores SET billing_status = 'pending', billing_plan = $2 WHERE store_id = $1`, [
    storeId,
    planKey,
  ])

  return { confirmationUrl: result.confirmationUrl, subscriptionId: result.appSubscription.id }
}

/** Record a subscription status change (from webhooks or return-URL confirmation). */
export async function recordSubscriptionStatus(
  storeId: string,
  shopifySubscriptionId: string,
  status: string
): Promise<void> {
  const s = status.toLowerCase()
  await execute(
    `UPDATE app_subscriptions SET status = $3, updated_at = NOW()
     WHERE store_id = $1 AND shopify_subscription_id = $2`,
    [storeId, shopifySubscriptionId, s]
  )
  const billingStatus = s === 'active' ? 'active' : s === 'cancelled' || s === 'expired' ? 'cancelled' : 'pending'
  await execute(`UPDATE stores SET billing_status = $2 WHERE store_id = $1`, [storeId, billingStatus])
}

/** Pull the live subscription state from Shopify and sync our DB. */
export async function syncSubscriptionFromShopify(storeId: string): Promise<SubscriptionRow | null> {
  const token = await getStoreAccessToken(storeId)
  const store = await queryOne<{ shopify_domain: string }>(
    'SELECT shopify_domain FROM stores WHERE store_id = $1',
    [storeId]
  )
  if (!token || !store?.shopify_domain) return null

  const client = createGraphQLClient(store.shopify_domain, token)
  const data = await client.query<{
    appInstallation: {
      activeSubscriptions: Array<{ id: string; name: string; status: string }>
    }
  }>(
    `{
       appInstallation {
         activeSubscriptions {
           id
           name
           status
         }
       }
     }`
  )
  const subs = data.appInstallation?.activeSubscriptions ?? []
  if (subs.length === 0) {
    await execute(`UPDATE stores SET billing_status = 'none' WHERE store_id = $1`, [storeId])
    return null
  }
  const live = subs[0]
  await recordSubscriptionStatus(storeId, live.id, live.status)
  return getSubscription(storeId)
}
