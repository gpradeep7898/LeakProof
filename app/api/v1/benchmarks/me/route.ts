/**
 * Benchmarks API
 * GET /api/v1/benchmarks/me — Get merchant's benchmark comparison
 * GET /api/v1/benchmarks/category/[category] — Get category benchmarks
 */
import { NextRequest, NextResponse } from 'next/server'
import { BenchmarkService } from '@/lib/services/benchmarkService'
import { getDefaultStoreId } from '@/lib/store'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
    try {
        const storeId = await getDefaultStoreId()
        const service = new BenchmarkService()

        const [benchmark, merchantMetrics] = await Promise.all([
            service.getMerchantBenchmark(storeId),
            service.computeMerchantMetrics(storeId),
        ])

        if (!benchmark || !merchantMetrics) {
            const general = await service.getGeneralBenchmark()
            return NextResponse.json({
                benchmark: general,
                merchantMetrics: null,
                hasData: false,
                message: 'Upload order data to see your benchmark comparison',
            })
        }

        return NextResponse.json({
            benchmark,
            merchantMetrics,
            hasData: true,
        })
    } catch (err) {
        console.error('[Benchmarks] Error:', err)
        return NextResponse.json({ error: 'Failed to load benchmarks' }, { status: 500 })
    }
}
