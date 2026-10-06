import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { MetricEngine } from '@/lib/services/metricEngine';
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store';

export async function POST(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req);
        const metrics = new MetricEngine();

        await metrics.recalculateAll(storeId);

        return NextResponse.json({
            message: 'Metrics recalculated successfully',
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
    const authRes = unauthorizedResponse(e)
    if (authRes) return authRes
        console.error('Recalculation error:', e);
        return NextResponse.json({ error: e.message || 'Recalculation failed' }, { status: 500 });
    }
}
