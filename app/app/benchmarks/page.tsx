'use client'

import { Page, Layout } from '@shopify/polaris'
import { BenchmarkDashboard } from '@/components/benchmarks/BenchmarkDashboard'

export default function BenchmarksPage() {
  return (
    <Page
      title="Industry Benchmarks"
      subtitle="See how your store compares to similar DTC merchants."
    >
      <Layout>
        <Layout.Section>
          <BenchmarkDashboard />
        </Layout.Section>
      </Layout>
    </Page>
  )
}
