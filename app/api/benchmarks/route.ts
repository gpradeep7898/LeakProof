import { NextResponse } from 'next/server'
import { getStoreFromRequest } from '@/lib/store'

export const dynamic = 'force-dynamic'
import { BenchmarkService } from '@/lib/services/benchmarkService'

export async function GET() {
    try {
        const storeId = await getStoreFromRequest(null)
        const service = new BenchmarkService()
        const data = await service.getMerchantBenchmarks(storeId)

        return NextResponse.json(data)
    } catch (err) {
        console.error('Benchmarks error:', err)
        return NextResponse.json({ error: 'Failed to load benchmarks' }, { status: 500 })
    }
}
