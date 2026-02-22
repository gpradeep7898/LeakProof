import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { MetricEngine } from '@/lib/services/metricEngine';
import { getDefaultStoreId } from '@/lib/store';

export async function POST(req: NextRequest) {
    try {
        const storeId = await getDefaultStoreId();
        const metrics = new MetricEngine();

        await metrics.recalculateAll(storeId);

        return NextResponse.json({
            message: 'Metrics recalculated successfully',
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        console.error('Recalculation error:', e);
        return NextResponse.json({ error: e.message || 'Recalculation failed' }, { status: 500 });
    }
}
