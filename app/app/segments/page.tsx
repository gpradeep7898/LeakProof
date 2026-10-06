'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Badge,
  Button, Spinner, EmptyState, DataTable,
} from '@shopify/polaris'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

type Segment = {
  id: string
  name: string
  customerCount: number
  totalRevenue: number
  suggestedAction: string
}

type Customer = {
  customerId: string
  orders?: number
  totalSpent?: number
  lastOrder?: string
}

const SEGMENT_ICON: Record<string, string> = {
  VIP: '👑',
  Loyal: '❤️',
  'At Risk': '⚠️',
  'At-risk': '⚠️',
  New: '✨',
  Churned: '❌',
  Repeat: '🔄',
  'One-time': '🆕',
  Lapsed: '😴',
  'Discount-Immune': '💰',
  'Discount-Dependent': '🏷️',
}

export default function CustomerSegments() {
  const authedFetch = useAuthenticatedFetch()
  const [data, setData] = useState<{ segments: Segment[]; customers: Customer[]; filter: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    authedFetch(`/api/segments?segment=${filter}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ segments: [], customers: [], filter }))
      .finally(() => setLoading(false))
  }, [filter, authedFetch])

  const segments = data?.segments || []
  const customers = data?.customers || []

  const handleExport = async () => {
    if (filter === 'all') return
    setExporting(true)
    try {
      const r = await authedFetch(`/api/segments/export?segment=${encodeURIComponent(filter)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      const blob = new Blob([j.customerIds.join('\n')], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `segment-${filter}-customer-ids.txt`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success(`Exported ${j.count} anonymized customer IDs`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const tableRows = (() => {
    if (filter === 'all') return []
    return customers.map((c) => [
      `Customer #${c.customerId}`,
      filter,
      String(c.orders ?? '—'),
      c.totalSpent != null ? `$${Math.round(c.totalSpent).toLocaleString()}` : '—',
      c.lastOrder || '—',
    ])
  })()

  if (loading) {
    return (
      <Page title="Customer Segments">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                <Spinner />
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    )
  }

  return (
    <Page
      title="Customer Segments"
      subtitle="Understand who's buying and who's about to leave. (Top 50 shown)"
      primaryAction={filter !== 'all' ? {
        content: 'Export Segment',
        onAction: handleExport,
        loading: exporting,
      } : undefined}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <Text as="p" tone="subdued">
                Customer identities are anonymized by default.
              </Text>
            </Card>

            {segments.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No segments yet"
                  action={{ content: 'Upload CSV', url: '/app/connect' }}
                  image=""
                >
                  <p>Upload CSV to segment customers.</p>
                </EmptyState>
              </Card>
            ) : (
              <>
                {/* Segment overview cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                  {segments.map((s) => (
                    <Card key={s.id}>
                      <BlockStack gap="100">
                        <Text as="p" variant="headingLg">{SEGMENT_ICON[s.name] || '•'}</Text>
                        <Text as="p" variant="headingMd" fontWeight="bold">{s.name}</Text>
                        <Text as="p" variant="headingSm" fontWeight="bold">{s.customerCount}</Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          ${Math.round(s.totalRevenue).toLocaleString()} revenue
                        </Text>
                      </BlockStack>
                    </Card>
                  ))}
                </div>

                {/* Segment filter buttons */}
                <InlineStack gap="200" wrap>
                  <Button
                    pressed={filter === 'all'}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                  {segments.map((s) => (
                    <Button
                      key={s.id}
                      pressed={filter === s.name}
                      onClick={() => setFilter(s.name)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </InlineStack>

                {/* Customer table */}
                {filter !== 'all' && (
                  <Card>
                    {tableRows.length === 0 ? (
                      <Text as="p" tone="subdued">No customers in this segment.</Text>
                    ) : (
                      <DataTable
                        columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
                        headings={['Customer', 'Segment', 'Orders', 'Total Spent', 'Last Order']}
                        rows={tableRows}
                      />
                    )}
                  </Card>
                )}

                {filter === 'all' && (
                  <Card>
                    <Text as="p" tone="subdued">Select a segment to view customers.</Text>
                  </Card>
                )}
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
