'use client'

import { useEffect, useState, useCallback } from 'react'
import { Page, Layout, Card, Button, Badge, Spinner, Banner } from '@shopify/polaris'
import { Check } from 'lucide-react'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

interface Plan {
  key: string
  name: string
  price: number
  blurb: string
  features: string[]
}

export default function BillingPage() {
  const authedFetch = useAuthenticatedFetch()
  const [plans, setPlans] = useState<Plan[]>([])
  const [trialDays, setTrialDays] = useState(14)
  const [status, setStatus] = useState<{ active: boolean; subscription: { status: string; plan: string } | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        authedFetch('/api/billing/plans').then((r) => r.json()),
        authedFetch('/api/billing/status').then((r) => r.json()),
      ])
      setPlans(p.plans || [])
      setTrialDays(p.trialDays || 14)
      setStatus(s)
    } catch {
      setError('Could not load billing information.')
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    load()
  }, [load])

  const subscribe = async (planKey: string) => {
    setSubscribing(planKey)
    setError('')
    try {
      const res = await authedFetch('/api/billing/subscribe', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')
      // Shopify-hosted confirmation — merchant approves, then returns to /app/billing/confirm
      window.top!.location.href = data.confirmationUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
      setSubscribing(null)
    }
  }

  if (loading) {
    return (
      <Page title="Billing">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Spinner />
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    )
  }

  return (
    <Page title="Choose your plan">
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical">{error}</Banner>
          </Layout.Section>
        )}
        {status?.active && status.subscription && (
          <Layout.Section>
            <Banner tone="success">
              You're on <strong>{status.subscription.plan}</strong> — status: {status.subscription.status}.
              LeakProof is watching your store for leaks.
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <p style={{ marginBottom: 16, color: '#5c5f62' }}>
            Every plan starts with a {trialDays}-day free trial. Billed through Shopify — cancel
            anytime from your Shopify admin, one click.
          </p>
        </Layout.Section>
        {plans.map((plan) => {
          const current = status?.subscription?.plan === plan.key && status?.active
          return (
            <Layout.Section key={plan.key} variant="oneThird">
              <Card>
                <div style={{ padding: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700 }}>{plan.name}</h3>
                    {current && <Badge tone="success">Current plan</Badge>}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, margin: '8px 0' }}>
                    ${plan.price}
                    <span style={{ fontSize: 14, fontWeight: 400 }}>/month</span>
                  </div>
                  <p style={{ color: '#5c5f62', marginBottom: 12 }}>{plan.blurb}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <Check size={16} style={{ color: '#008060', flexShrink: 0, marginTop: 2 }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={current || subscribing !== null}
                    loading={subscribing === plan.key}
                    onClick={() => subscribe(plan.key)}
                  >
                    {current ? 'Current plan' : `Start ${trialDays}-day free trial`}
                  </Button>
                </div>
              </Card>
            </Layout.Section>
          )
        })}
      </Layout>
    </Page>
  )
}
