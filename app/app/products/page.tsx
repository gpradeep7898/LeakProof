'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Page, Layout, Card, Text, Badge, Spinner, DataTable,
  BlockStack, InlineStack, Button,
} from '@shopify/polaris'
import { Package, TrendingUp, Users, AlertTriangle } from 'lucide-react'

type Product = {
  product_id: string
  product_name: string
  sku: string
  total_revenue: string
  avg_selling_price: string
  gross_margin_pct: string
  repurchase_rate: string
  total_sold: number
  discount_usage_rate?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function productStatus(p: Product): React.ReactNode {
  if (parseFloat(p.total_revenue) === 0) {
    return <Badge>No Sales Yet</Badge>
  }
  if (parseFloat(p.repurchase_rate) >= 20) {
    return <Badge tone="success">High Loyalty</Badge>
  }
  if (parseFloat(p.repurchase_rate) < 10 && p.total_sold > 5) {
    return <Badge tone="warning">Churn Risk</Badge>
  }
  return <Badge tone="info">Active</Badge>
}

function RepeatBar({ rate }: { rate: number }) {
  const pct = Math.min(rate, 100)
  const color = rate > 20 ? '#22c55e' : '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 64, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: '#475569' }}>{rate.toFixed(1)}%</span>
    </div>
  )
}

export default function ProductIntelligencePage() {
  const [sort, setSort] = useState('revenue')
  const [filter, setFilter] = useState('all')

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products', sort],
    queryFn: () => fetcher(`/api/products?sort=${sort}`),
  })

  const filteredProducts = (products || []).filter((p) => {
    if (filter === 'loyal') return parseFloat(p.repurchase_rate) >= 20
    if (filter === 'churn') return parseFloat(p.repurchase_rate) < 10 && p.total_sold > 5
    if (filter === 'nosales') return Number(p.total_revenue) === 0
    if (filter === 'discount') return parseFloat(p.discount_usage_rate || '0') > 50
    return true
  })

  const statCards = [
    { label: 'Total Products', value: products?.length ?? 0, icon: Package },
    { label: 'Active SKUs', value: products?.filter((p) => p.total_sold > 0).length ?? 0, icon: TrendingUp },
    { label: 'High Loyalty Items', value: products?.filter((p) => parseFloat(p.repurchase_rate) >= 20).length ?? 0, icon: Users },
    { label: 'Churn Risk Items', value: products?.filter((p) => parseFloat(p.repurchase_rate) < 10 && p.total_sold > 5).length ?? 0, icon: AlertTriangle },
  ]

  const tableRows = filteredProducts.map((p) => [
    <Text as="span" variant="bodyMd" fontWeight="medium" key={p.product_id}>{p.product_name}</Text>,
    <Text as="span" variant="bodySm" tone="subdued" key={`sku-${p.product_id}`}>{p.sku}</Text>,
    `$${Number(p.total_revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    `$${Number(p.avg_selling_price).toFixed(2)}`,
    `${p.gross_margin_pct}%`,
    <RepeatBar key={`bar-${p.product_id}`} rate={Number(p.repurchase_rate)} />,
    productStatus(p),
  ])

  return (
    <Page
      title="Product Intelligence"
      subtitle="Analyze SKU performance, fatigue, and loyalty drivers."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {statCards.map((s) => (
                <Card key={s.label}>
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="p" tone="subdued" variant="bodySm">{s.label}</Text>
                      <Text as="p" variant="headingLg" fontWeight="bold">{s.value}</Text>
                    </BlockStack>
                    <s.icon size={20} color="#94a3b8" />
                  </InlineStack>
                </Card>
              ))}
            </div>

            {/* Filter + Table */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" wrap>
                  {[
                    { key: 'all', label: 'All Products' },
                    { key: 'loyal', label: 'High Loyalty' },
                    { key: 'churn', label: 'High Churn' },
                    { key: 'discount', label: 'Discount Dependent' },
                    { key: 'nosales', label: 'No Sales Yet' },
                  ].map((f) => (
                    <Button key={f.key} pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                      {f.label}
                    </Button>
                  ))}
                </InlineStack>

                {isLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                    <Spinner />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <Text as="p" tone="subdued">No products match this filter.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'text', 'text']}
                    headings={[
                      'Product Name', 'SKU',
                      <button key="rev" className="flex items-center gap-1 font-medium" onClick={() => setSort('revenue')}>Revenue</button>,
                      'Avg Price', 'Margin',
                      <button key="rep" className="flex items-center gap-1 font-medium" onClick={() => setSort('repeat')}>Repeat Rate</button>,
                      'Status',
                    ]}
                    rows={tableRows}
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
