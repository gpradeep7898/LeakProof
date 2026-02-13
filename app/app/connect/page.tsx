'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Papa from 'papaparse'
import { toast } from 'react-hot-toast'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ShoppingCart,
  Database,
  AlertCircle,
} from 'lucide-react'
import {
  detectSchema,
  validateRequiredColumns,
  anonymizeId,
  getValue,
  type DetectedSchema,
} from '@/lib/csv-utils'

type Step = 'method' | 'csv' | 'verify'

export default function DataConnect() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('method')
  const [method, setMethod] = useState<'shopify' | 'csv' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [detectedSchema, setDetectedSchema] = useState<DetectedSchema | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; missing: string[] } | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    inserted?: { customers: number; orders: number; products: number; orderItems?: number }
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parseFile = useCallback((f: File) => {
    return new Promise<Record<string, string>[]>((resolve, reject) => {
      setParseProgress(0)
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
          const rows = (results.data || []) as Record<string, string>[]
          const cleaned = rows.map((r) => {
            const out: Record<string, string> = {}
            Object.entries(r).forEach(([k, v]) => {
              if (k && v !== undefined && v !== null) out[k.trim()] = String(v).trim()
            })
            return out
          })
          resolve(cleaned)
        },
        error: (err) => reject(err),
      })
    })
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setError('')
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are accepted.')
      return
    }
    setFile(f)
    try {
      setParseProgress(10)
      const rows = await parseFile(f)
      setParseProgress(50)
      setRawRows(rows)
      const headers = rows[0] ? Object.keys(rows[0]) : []
      const schema = detectSchema(headers, rows)
      setDetectedSchema(schema)
      setValidation(validateRequiredColumns(headers))
      setParseProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
      setRawRows([])
      setDetectedSchema(null)
      setValidation(null)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    setError('')
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are accepted.')
      return
    }
    setFile(f)
    try {
      setParseProgress(10)
      const rows = await parseFile(f)
      setParseProgress(50)
      setRawRows(rows)
      const headers = rows[0] ? Object.keys(rows[0]) : []
      setDetectedSchema(detectSchema(headers, rows))
      setValidation(validateRequiredColumns(headers))
      setParseProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
      setRawRows([])
      setDetectedSchema(null)
      setValidation(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/csv/upload', { method: 'POST', body: formData })
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

  const canUpload = file && rawRows.length > 0 && validation?.valid
  const previewRows = rawRows.slice(0, 10)
  const anonymizedPreview = previewRows.map((r) => {
    const cust = getValue(r, 'customer_id', 'customerid', 'email', 'customer_email')
    return { ...r, _anon: anonymizeId(cust) }
  })

  const steps = [
    { id: 'method', label: 'Choose Method', done: step !== 'method' || !!method },
    { id: 'csv', label: 'Connect Data', done: step === 'csv' || step === 'verify' },
    { id: 'verify', label: 'Verify Import', done: step === 'verify' },
  ]

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect Your Data</h1>
        <p className="text-gray-600 max-w-2xl">
          Link your Shopify store or upload a CSV to surface where money leaks, why it happens, and what to fix first. No black-box AI—every insight is explainable.
        </p>
      </motion.div>

      {/* Progress stepper */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 mb-12"
      >
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
                s.done ? 'bg-teal/15 text-teal' : step === s.id ? 'bg-teal text-white shadow-lg shadow-teal/30' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center text-sm font-bold">{i + 1}</span>
              )}
              <span className="font-medium text-sm">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-5 h-5 text-gray-300 mx-1" />
            )}
          </div>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'method' && (
          <motion.div
            key="method"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid md:grid-cols-2 gap-6"
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.02, boxShadow: '0 20px 40px -12px rgba(14, 165, 164, 0.25)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setMethod('shopify'); setStep('csv') }}
              className="group relative overflow-hidden border-2 border-gray-200 rounded-2xl p-8 text-left w-full bg-white hover:border-teal/50 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-teal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-teal/15 flex items-center justify-center mb-5 group-hover:bg-teal/25 transition-colors">
                  <ShoppingCart className="w-7 h-7 text-teal" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">Connect Shopify</h3>
                <p className="text-gray-600 text-sm mb-4">Automatically sync orders, customers, and products. Updates in real-time.</p>
                <ul className="text-sm text-gray-600 space-y-2 mb-4">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> Automatic updates every hour</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> Secure OAuth connection</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> Full historical data import</li>
                </ul>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-xl font-medium group-hover:bg-teal-600 transition-colors">
                  Connect Now <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02, boxShadow: '0 20px 40px -12px rgba(245, 158, 11, 0.25)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setMethod('csv'); setStep('csv') }}
              className="group relative overflow-hidden border-2 border-gray-200 rounded-2xl p-8 text-left w-full bg-white hover:border-amber-400/50 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-amber-500/15 flex items-center justify-center mb-5 group-hover:bg-amber-500/25 transition-colors">
                  <FileSpreadsheet className="w-7 h-7 text-amber-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">Upload CSV</h3>
                <p className="text-gray-600 text-sm mb-4">Upload a single denormalized CSV with order, customer, and product data.</p>
                <ul className="text-sm text-gray-600 space-y-2 mb-4">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> Manual control over data</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> Platform agnostic</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> No API connection required</li>
                </ul>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-amber-400/50 text-amber-700 rounded-xl font-medium group-hover:bg-amber-500/10 transition-colors">
                  Upload Files <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </motion.button>
          </motion.div>
        )}

        {step === 'csv' && method === 'csv' && (
          <motion.div
            key="csv"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl space-y-6"
          >
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
                file ? 'border-teal bg-gradient-to-br from-teal/5 to-white' : 'border-gray-300 bg-white hover:border-teal/50 hover:bg-gray-50/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  handleFileChange(e)
                }}
                className="hidden"
              />
              <motion.div
                animate={{ scale: file ? 0.9 : 1 }}
                className="inline-block mb-4"
              >
                <Upload className="w-16 h-16 text-teal/60" />
              </motion.div>
              <p className="font-semibold text-gray-900 mb-1">
                {file ? (
                  <>
                    {file.name} <span className="text-gray-500 font-normal">({(file.size / 1024).toFixed(1)} KB)</span>
                  </>
                ) : (
                  'Drag and drop your CSV here'
                )}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Single denormalized export with order, customer, product columns
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="px-6 py-2.5 bg-teal text-white rounded-xl font-medium disabled:opacity-50 hover:bg-teal-600 transition-colors"
              >
                {file ? 'Choose Another File' : 'Browse Files'}
              </motion.button>

              {parseProgress > 0 && parseProgress < 100 && (
                <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden max-w-xs mx-auto">
                  <motion.div
                    className="h-full bg-teal"
                    initial={{ width: 0 }}
                    animate={{ width: `${parseProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>

            {/* Validation summary */}
            {validation && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-4 flex items-center gap-3 ${
                  validation.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                {validation.valid ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">Valid format</p>
                      <p className="text-sm text-green-700">{rawRows.length} rows detected. Ready to import.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-800">Missing required columns</p>
                      <p className="text-sm text-red-700">Add: {validation.missing.join(', ')}</p>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Detected columns preview */}
            {detectedSchema && detectedSchema.headers.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="font-medium text-gray-900">Detected columns ({detectedSchema.headers.length})</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {detectedSchema.headers.slice(0, 8).join(', ')}
                    {detectedSchema.headers.length > 8 && '...'}
                  </p>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        {detectedSchema.headers.slice(0, 6).map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 truncate max-w-[120px]">
                            {h}
                          </th>
                        ))}
                        {detectedSchema.headers.length > 6 && (
                          <th className="px-3 py-2 text-gray-400">...</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {anonymizedPreview.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50">
                          {detectedSchema.headers.slice(0, 6).map((h) => {
                            const val = h.toLowerCase().includes('customer') || h.toLowerCase().includes('email')
                              ? r._anon
                              : (r as Record<string, string>)[h]
                            return (
                              <td key={h} className="px-3 py-2 text-gray-600 truncate max-w-[120px]" title={val}>
                                {val || '—'}
                              </td>
                            )
                          })}
                          {detectedSchema.headers.length > 6 && <td className="px-3 py-2 text-gray-300">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                  Preview shows anonymized customer IDs (cust_xxx). PII is never displayed.
                </p>
              </motion.div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setStep('method'); setMethod(null); setFile(null); setRawRows([]); setDetectedSchema(null); setValidation(null) }}
                className="px-5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </motion.button>
              <motion.button
                whileHover={{ scale: canUpload ? 1.02 : 1 }}
                whileTap={{ scale: canUpload ? 0.98 : 1 }}
                onClick={handleUpload}
                disabled={!canUpload || uploading}
                className="px-6 py-2.5 bg-teal text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-600 transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    Import Data
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === 'csv' && method === 'shopify' && (
          <motion.div
            key="shopify"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-xl bg-white rounded-2xl p-10 border border-gray-200 shadow-sm text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-teal/15 flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-8 h-8 text-teal" />
            </div>
            <p className="text-gray-700 mb-6">
              You&apos;ll be redirected to Shopify to authorize LeakProof. Your data stays private and is never shared.
            </p>
            <div className="flex gap-4 justify-center">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep('method')}
                className="px-5 py-2.5 border border-gray-300 rounded-xl font-medium"
              >
                Back
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-2.5 bg-teal text-white rounded-xl font-medium"
              >
                Authorize Shopify →
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === 'verify' && result?.inserted && (
          <motion.div
            key="verify"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xl bg-white rounded-2xl p-10 border border-gray-200 shadow-lg text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-xl mb-2">Import Successful</h3>
            <p className="text-gray-600 mb-6">Your data has been imported and insights are being computed.</p>
            <ul className="space-y-2 mb-8 text-left max-w-xs mx-auto">
              <li className="flex justify-between"><span className="text-gray-600">Customers</span> <span className="font-semibold">{result.inserted.customers}</span></li>
              <li className="flex justify-between"><span className="text-gray-600">Orders</span> <span className="font-semibold">{result.inserted.orders}</span></li>
              <li className="flex justify-between"><span className="text-gray-600">Products</span> <span className="font-semibold">{result.inserted.products}</span></li>
            </ul>
            <motion.a
              href="/app"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal text-white rounded-xl font-medium hover:bg-teal-600 transition-colors"
            >
              View Money Snapshot <ChevronRight className="w-5 h-5" />
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-12 text-sm text-gray-500">
        Need help? <a href="#" className="text-teal hover:underline">View connection guide</a> · Sample CSV in <code className="bg-gray-100 px-1 rounded">data/demo-orders.csv</code>
      </p>
    </div>
  )
}
