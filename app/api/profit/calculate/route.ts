import { NextResponse } from 'next/server'
import { ProfitCalculator } from '@/lib/services/profitCalculator'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const shopifyOrder = body.order;

        if (!shopifyOrder) {
            return NextResponse.json({ error: 'Order data required' }, { status: 400 })
        }

        const calculator = new ProfitCalculator()
        const profitData = await calculator.calculateOrderProfit(shopifyOrder)

        return NextResponse.json(profitData)
    } catch (err) {
        console.error('Profit calculation error:', err)
        return NextResponse.json({ error: 'Failed to calculate profit' }, { status: 500 })
    }
}
