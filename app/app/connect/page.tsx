'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Page, Layout, Card, Text, Button, Banner,
  DropZone, BlockStack, InlineStack, Badge,
  TextField, List, ProgressBar,
} from '@shopify/polaris'
import { toast } from 'react-hot-toast'
import Papa from 'papaparse'
import {
  detectSchema,
  validateRequiredColumns,
} from '@/lib/csv-utils'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

type Step = 'method' | 'csv' | 'shopify' | 'verify'

export default function DataConnect() {
  const authedFetch = useAuthenticatedFetch()
  const router       = useRouter()
  const [step, setStep]           = useState<Step>('method')
  const [shopDomain, setShopDomain] = useState('')
  const [shopDomainError, setShopDomainError] = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [rawRows, setRawRows]     = useState<Record<string, string>[]>([])
  const [detectedSchema, setDetectedSchema] = useState<{ headers: string[] } | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; missing: string[] } | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [result, setResult]       = useState<{
    inserted?: { customers: number; orders: number; products: number }
  } | null>(null)

  const parseFile = useCallback((f: File) => {
    return new Promise<Record<string, string>[]>((resolve, reject) => {
      setParseProgress(10)
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (results) => {
          setParseProgress(100)
          if (results.errors.length > 0 && results.data.length === 0) {
            reject(new Error('Could not parse CSV. Check file format.'))
            return
          }
          const rows = (results.data as Record<string, string>[]).map((r) => {
            const out: Record<string, string> = {}
            Object.entries(r).forEach(([k, v]) => {
              if (k && v !== undefined && v !== null) out[k.trim()] = String(v).trim()
            })
            return out
          })
          resolve(rows)
        },
        error: (err) => reject(err),
      })
    })
  }, [])

  const handleDropFiles = useCallback(async (_accepted: File[], accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setError('')
    setFile(f)
    try {
      const rows = await parseFile(f)
      setRawRows(rows)
      const headers = rows[0] ? Object.keys(rows[0]) : []
      setDetectedSchema(detectSchema(headers, rows))
      setValidation(validateRequiredColumns(headers))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
      setRawRows([])
      setDetectedSchema(null)
      setValidation(null)
    }
  }, [parseFile])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authedFetch('/api/csv/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setResult(data)
      setStep('verify')
      toast.success('Data imported successfully!')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      setError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleConnectShopify = () => {
    const domain = shopDomain.trim().toLowerCase()
    if (!domain) {
      setShopDomainError('Enter your Shopify store domain.')
      return
    }
    const validDomain = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(domain)
    if (!validDomain) {
      setShopDomainError('Must be in the format: yourstore.myshopify.com')
      return
    }
    setShopDomainError('')
    window.location.href = `/api/auth/shopify?shop=${encodeURIComponent(domain)}`
  }

  const canUpload = file && rawRows.length > 0 && validation?.valid

  // ── Method selection ─────────────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <Page title="Connect Your Data" subtitle="Choose how you want to bring in your Shopify data.">
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Connect Shopify Store</Text>
                <Text as="p" tone="subdued">
                  Automatic real-time sync. Orders, customers, and products update every hour.
                </Text>
                <List type="bullet">
                  <List.Item>Secure OAuth — no passwords stored</List.Item>
                  <List.Item>180-day historical backfill on first install</List.Item>
                  <List.Item>Real-time order webhooks</List.Item>
                </List>
                <Button variant="primary" onClick={() => setStep('shopify')}>
                  Connect Shopify →
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" align="start">
                  <Text variant="headingMd" as="h2">Upload CSV</Text>
                  <Badge tone="attention">Manual</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Upload a single denormalized CSV with order, customer, and product columns.
                  Platform-agnostic — works with any export.
                </Text>
                <List type="bullet">
                  <List.Item>No API connection required</List.Item>
                  <List.Item>Full control over data</List.Item>
                  <List.Item>Sample file in <code>data/demo-orders.csv</code></List.Item>
                </List>
                <Button onClick={() => setStep('csv')}>Upload CSV</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    )
  }

  // ── Shopify OAuth ─────────────────────────────────────────────────────────────
  if (step === 'shopify') {
    return (
      <Page
        title="Connect Shopify Store"
        backAction={{ content: 'Back', onAction: () => setStep('method') }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="p">
                  Enter your Shopify store domain. You&apos;ll be redirected to Shopify to
                  authorize LeakProof. Your data stays private and is never shared.
                </Text>
                <TextField
                  label="Store domain"
                  value={shopDomain}
                  onChange={setShopDomain}
                  placeholder="yourstore.myshopify.com"
                  autoComplete="off"
                  error={shopDomainError}
                  helpText="Enter the full .myshopify.com domain"
                />
                <InlineStack gap="300">
                  <Button variant="primary" onClick={handleConnectShopify}>
                    Authorize on Shopify →
                  </Button>
                  <Button onClick={() => setStep('method')}>Back</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    )
  }

  // ── CSV Upload ────────────────────────────────────────────────────────────────
  if (step === 'csv') {
    return (
      <Page
        title="Upload CSV"
        backAction={{ content: 'Back', onAction: () => setStep('method') }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}

              <Card>
                <BlockStack gap="400">
                  <DropZone
                    accept=".csv"
                    type="file"
                    onDrop={handleDropFiles}
                    label="Upload CSV file"
                  >
                    {file ? (
                      <DropZone.FileUpload actionTitle={file.name} actionHint="Drop another file to replace" />
                    ) : (
                      <DropZone.FileUpload actionTitle="Add CSV" actionHint="or drop a file to upload" />
                    )}
                  </DropZone>

                  {parseProgress > 0 && parseProgress < 100 && (
                    <ProgressBar progress={parseProgress} size="small" />
                  )}

                  {validation && (
                    <Banner
                      tone={validation.valid ? 'success' : 'critical'}
                      title={validation.valid
                        ? `Valid format — ${rawRows.length} rows ready to import`
                        : `Missing required columns: ${validation.missing.join(', ')}`}
                    />
                  )}

                  {detectedSchema && detectedSchema.headers.length > 0 && (
                    <Text as="p" tone="subdued">
                      Detected columns: {detectedSchema.headers.slice(0, 8).join(', ')}
                      {detectedSchema.headers.length > 8 && ` +${detectedSchema.headers.length - 8} more`}
                    </Text>
                  )}
                </BlockStack>
              </Card>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  disabled={!canUpload || uploading}
                  loading={uploading}
                  onClick={handleUpload}
                >
                  {uploading ? 'Importing…' : 'Import Data'}
                </Button>
                <Button onClick={() => { setStep('method'); setFile(null); setRawRows([]) }}>
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    )
  }

  // ── Verify ────────────────────────────────────────────────────────────────────
  return (
    <Page title="Import Complete">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Banner tone="success" title="Data imported successfully">
                Your store data has been imported. Insights are being computed now.
              </Banner>
              {result?.inserted && (
                <BlockStack gap="200">
                  <Text as="p"><strong>Customers:</strong> {result.inserted.customers}</Text>
                  <Text as="p"><strong>Orders:</strong> {result.inserted.orders}</Text>
                  <Text as="p"><strong>Products:</strong> {result.inserted.products}</Text>
                </BlockStack>
              )}
              <Button variant="primary" url="/app">View Dashboard →</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
