import { NextResponse } from 'next/server'
import { getDefaultStoreId } from '@/lib/store'

export const dynamic = 'force-dynamic'
import { ProfitCalculator } from '@/lib/services/profitCalculator'

export async function GET(request: Request) {
    try {
        const storeId = await getDefaultStoreId()
        const { searchParams } = new URL(request.url)
        const timeframe = parseInt(searchParams.get('timeframe') || '30')

        const calculator = new ProfitCalculator()
        const data = await calculator.calculateProfitByDimension(storeId, 'product', timeframe)

        return NextResponse.json(data)
    } catch (err) {
        console.error('Profit by product error:', err)
        return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
    }
}
