'use client'

import { useEffect, useState } from 'react'
import { Page, Layout, Card, Banner, Spinner, Button } from '@shopify/polaris'
import Link from 'next/link'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

/**
 * Return URL after the merchant approves (or declines) on Shopify's
 * confirmation page. We re-sync live state and route accordingly.
 */
export default function BillingConfirmPage() {
  const authedFetch = useAuthenticatedFetch()
  const [state, setState] = useState<'checking' | 'active' | 'inactive'>('checking')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const s = await authedFetch('/api/billing/status').then((r) => r.json())
        if (!cancelled) setState(s.active ? 'active' : 'inactive')
      } catch {
        if (!cancelled) setState('inactive')
      }
    }
    check()
    const t = setInterval(check, 3000)
    const stop = setTimeout(() => clearInterval(t), 30000)
    return () => {
      cancelled = true
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [authedFetch])

  return (
    <Page title="Subscription">
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: 24, textAlign: 'center' }}>
              {state === 'checking' && (
                <>
                  <Spinner />
                  <p style={{ marginTop: 12 }}>Confirming your subscription with Shopify…</p>
                </>
              )}
              {state === 'active' && (
                <>
                  <Banner tone="success">You're subscribed — LeakProof is now watching your store.</Banner>
                  <div style={{ marginTop: 16 }}>
                    <Link href="/app">
                      <Button variant="primary">Open Money Snapshot</Button>
                    </Link>
                  </div>
                </>
              )}
              {state === 'inactive' && (
                <>
                  <Banner tone="warning">
                    We couldn't confirm an active subscription yet. If you just approved it, wait a
                    moment — otherwise pick a plan to continue.
                  </Banner>
                  <div style={{ marginTop: 16 }}>
                    <Link href="/app/billing">
                      <Button variant="primary">Back to plans</Button>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
