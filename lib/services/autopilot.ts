/**
 * Autopilot System — Autonomous profit protection
 * Daily scans, auto-execution of low-risk fixes, notifications
 */

import { query, queryOne, execute } from '@/lib/db'
import { LeakDetector } from './leakDetector'
import { ActionExecutor } from './actionExecutor'

interface AutopilotSettings {
    store_id: string
    enabled: boolean
    auto_execute_low_risk: boolean
    auto_execute_medium_risk: boolean
    require_approval_high_risk: boolean
    daily_digest_email: string | null
    slack_webhook_url: string | null
    scan_hour_utc: number
    last_run_at: string | null
}

interface StoreInfo {
    store_id: string
    name: string
    daily_digest_email?: string
}

export class Autopilot {
    /**
     * Run daily autopilot for a specific store
     */
    async runDailyAutopilot(storeId: string): Promise<{
        leaksDetected: number
        actionsGenerated: number
        actionsExecuted: number
        actionsPending: number
    }> {
        const settings = await queryOne<AutopilotSettings>(
            'SELECT * FROM autopilot_settings WHERE store_id = $1',
            [storeId]
        )

        if (!settings?.enabled) {
            return { leaksDetected: 0, actionsGenerated: 0, actionsExecuted: 0, actionsPending: 0 }
        }

        console.log(`[Autopilot] Running daily scan for store ${storeId}`)

        // 1. Detect leaks
        const detector = new LeakDetector(storeId)
        const leaks = await detector.detectAllLeaks()

        // 2. Generate actions from new leaks
        const executor = new ActionExecutor()
        let actionsGenerated = 0
        let actionsExecuted = 0
        let actionsPending = 0

        for (const leak of leaks) {
            // Check if action already exists for this leak type
            const existing = await queryOne(
                `SELECT action_id FROM actions WHERE store_id = $1 AND action_type = $2 AND status NOT IN ('failed', 'completed') LIMIT 1`,
                [storeId, leak.leak_type]
            )
            if (existing) continue

            // Get the saved leak ID
            const savedLeak = await queryOne<{ leak_id: string }>(
                `SELECT leak_id FROM revenue_leaks WHERE store_id = $1 AND leak_type = $2 ORDER BY detected_at DESC LIMIT 1`,
                [storeId, leak.leak_type]
            )
            if (!savedLeak) continue

            const actionId = await ActionExecutor.generateActionFromLeak(
                storeId,
                savedLeak.leak_id,
                leak.leak_type,
                leak.estimated_monthly_loss,
                {}
            )

            if (!actionId) continue
            actionsGenerated++

            // Determine if we should auto-execute
            const shouldExecute = this.shouldAutoExecute(leak.recommended_action.risk_level, settings)

            if (shouldExecute) {
                try {
                    await executor.executeAction(actionId)
                    actionsExecuted++

                    await this.logNotification(storeId, 'action_executed', 'system', {
                        action_id: actionId,
                        leak_type: leak.leak_type,
                        expected_impact: leak.estimated_monthly_loss,
                    })
                } catch (err) {
                    console.error(`[Autopilot] Failed to auto-execute action ${actionId}:`, err)
                    actionsPending++
                }
            } else {
                actionsPending++
            }
        }

        // 3. Measure outcomes for actions executed 30+ days ago
        const completedActions = await query<{ action_id: string }>(
            `SELECT action_id FROM actions
       WHERE store_id = $1 AND status = 'completed' AND measurement_date IS NULL
       AND executed_at < NOW() - INTERVAL '30 days'`,
            [storeId]
        )

        for (const action of completedActions) {
            await executor.measureOutcome(action.action_id)
        }

        // 4. Send daily digest if configured
        if (settings.daily_digest_email) {
            await this.sendDailyDigest(storeId, settings.daily_digest_email, {
                leaksDetected: leaks.length,
                actionsGenerated,
                actionsExecuted,
                actionsPending,
                totalMonthlyImpact: leaks.reduce((s, l) => s + l.estimated_monthly_loss, 0),
            })
        }

        // 5. Send Slack notification if configured
        if (settings.slack_webhook_url && (leaks.length > 0 || actionsExecuted > 0)) {
            await this.sendSlackNotification(settings.slack_webhook_url, storeId, leaks.length, actionsExecuted)
        }

        // 6. Update last run time
        await execute(
            'UPDATE autopilot_settings SET last_run_at = NOW(), updated_at = NOW() WHERE store_id = $1',
            [storeId]
        )

        return { leaksDetected: leaks.length, actionsGenerated, actionsExecuted, actionsPending }
    }

    /** Determine if an action should be auto-executed based on risk level and settings */
    shouldAutoExecute(riskLevel: string, settings: AutopilotSettings): boolean {
        if (riskLevel === 'low' && settings.auto_execute_low_risk) return true
        if (riskLevel === 'medium' && settings.auto_execute_medium_risk) return true
        return false
    }

    /** Send daily digest email */
    private async sendDailyDigest(storeId: string, email: string, summary: {
        leaksDetected: number
        actionsGenerated: number
        actionsExecuted: number
        actionsPending: number
        totalMonthlyImpact: number
    }): Promise<void> {
        // Log the notification intent (actual email sending requires an email service like SendGrid/Resend)
        await this.logNotification(storeId, 'daily_digest', 'email', {
            to: email,
            subject: `LeakProof Daily Report — ${summary.leaksDetected} leaks, $${Math.round(summary.totalMonthlyImpact).toLocaleString()}/mo at stake`,
            ...summary,
        })

        // If email service is configured:
        // await sendEmail(email, 'daily_digest', { ...summary })
        console.log(`[Autopilot] Daily digest queued for ${email}: ${summary.leaksDetected} leaks, $${Math.round(summary.totalMonthlyImpact)}/mo total impact`)
    }

    /** Send Slack notification */
    private async sendSlackNotification(
        webhookUrl: string,
        storeId: string,
        leaksDetected: number,
        actionsExecuted: number
    ): Promise<void> {
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🔍 *LeakProof Autopilot Update*\n• ${leaksDetected} profit leaks detected\n• ${actionsExecuted} fixes auto-executed\n• Visit your dashboard to review pending approvals`,
                }),
            })
            await this.logNotification(storeId, 'autopilot_summary', 'slack', { leaksDetected, actionsExecuted })
        } catch (err) {
            console.error('[Autopilot] Failed to send Slack notification:', err)
        }
    }

    /** Log a notification */
    private async logNotification(storeId: string, type: string, channel: string, payload: Record<string, unknown>): Promise<void> {
        await execute(`
      INSERT INTO notification_log (store_id, type, channel, payload, sent_at, status)
      VALUES ($1, $2, $3, $4, NOW(), 'sent')
    `, [storeId, type, channel, JSON.stringify(payload)])
    }

    /** Run autopilot for all enabled stores (called by cron job) */
    async runAllStores(): Promise<void> {
        const currentHour = new Date().getUTCHours()

        const stores = await query<{ store_id: string; scan_hour_utc: number }>(
            `SELECT store_id, scan_hour_utc FROM autopilot_settings WHERE enabled = true AND scan_hour_utc = $1`,
            [currentHour]
        )

        for (const store of stores) {
            try {
                await this.runDailyAutopilot(store.store_id)
            } catch (err) {
                console.error(`[Autopilot] Failed for store ${store.store_id}:`, err)
            }
        }
    }
}
