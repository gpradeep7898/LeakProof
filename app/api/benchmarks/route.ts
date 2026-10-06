import { NextRequest, NextResponse } from 'next/server'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'
import { billingGuard } from '@/lib/billing'

export const dynamic = 'force-dynamic'
import { BenchmarkService } from '@/lib/services/benchmarkService'

export async function GET(request: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(request)
    const billingRes = await billingGuard(storeId)
    if (billingRes) return billingRes
        const service = new BenchmarkService()
        const data = await service.getMerchantBenchmarks(storeId)

        return NextResponse.json(data)
    } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
        console.error('Benchmarks error:', err)
        return NextResponse.json({ error: 'Failed to load benchmarks' }, { status: 500 })
    }
}
