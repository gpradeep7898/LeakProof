/**
 * Leaks API v1
 * GET /api/v1/leaks — List all leaks
 * POST /api/v1/leaks/scan — Trigger new leak scan
 */
import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { LeakDetector } from '@/lib/services/leakDetector'
import { getStoreFromRequest, unauthorizedResponse } from '@/lib/store'

export async function GET(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req)
        const { searchParams } = req.nextUrl
        const limit = parseInt(searchParams.get('limit') || '50')
        const severity = searchParams.get('severity')

        let sql = `
      SELECT
        leak_id AS id,
        leak_type,
        title,
        description,
        severity,
        estimated_monthly_loss,
        confidence_score,
        affected_customers_count,
        affected_orders_count,
        status,
        priority_rank,
        recommended_action_json,
        created_at AS detected_at
      FROM revenue_leaks
      WHERE store_id = $1
    `
        const params: (string | number)[] = [storeId]

        if (severity) {
            sql += ` AND severity = $${params.length + 1}`
            params.push(severity)
        }

        sql += ` ORDER BY estimated_monthly_loss DESC LIMIT $${params.length + 1}`
        params.push(limit)

        const leaks = await query<{
            id: string; leak_type: string; title: string; description: string
            severity: string; estimated_monthly_loss: string; confidence_score: string
            affected_customers_count: string; affected_orders_count: string
            status: string; priority_rank: string
            recommended_action_json: Record<string, unknown>; detected_at: string
        }>(sql, params)

        const totalAtRisk = leaks.reduce((s, l) => s + parseFloat(l.estimated_monthly_loss || '0'), 0)

        return NextResponse.json({
            leaks: leaks.map((l) => ({
                id: l.id,
                type: l.leak_type,
                title: l.title || l.description,
                description: l.description,
                severity: l.severity || 'medium',
                estimatedMonthlyLoss: parseFloat(l.estimated_monthly_loss || '0'),
                confidenceScore: parseFloat(l.confidence_score || '0'),
                affectedCustomersCount: parseInt(l.affected_customers_count || '0'),
                affectedOrdersCount: parseInt(l.affected_orders_count || '0'),
                status: l.status,
                priorityRank: parseInt(l.priority_rank || '0'),
                recommendedAction: l.recommended_action_json || {},
                detectedAt: l.detected_at,
            })),
            totalLeaks: leaks.length,
            totalAtRisk,
            scannedAt: new Date().toISOString(),
        })
    } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
        console.error('[Leaks API] Error:', err)
        return NextResponse.json({ error: 'Failed to load leaks', leaks: [], totalAtRisk: 0 }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const storeId = await getStoreFromRequest(req)
        const detector = new LeakDetector(storeId)
        const leaks = await detector.detectAllLeaks()
        const totalAtRisk = leaks.reduce((s, l) => s + l.estimated_monthly_loss, 0)

        return NextResponse.json({
            success: true,
            detected: leaks.length,
            totalAtRisk,
            scannedAt: new Date().toISOString(),
        })
    } catch (err) {
    const authRes = unauthorizedResponse(err)
    if (authRes) return authRes
        console.error('[Leaks Scan] Error:', err)
        return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
    }
}
