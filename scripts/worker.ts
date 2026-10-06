/**
 * LeakProof background worker entrypoint.
 *
 * Runs the BullMQ workers (leak detection, action execution, measurement)
 * as a long-lived process. Start with `npm run worker`.
 *
 * Requires REDIS_URL and DATABASE_URL in the environment.
 * Deploy as a separate service/process alongside the Next.js app.
 */
import 'dotenv/config'
import { setupWorkers } from '../lib/workers'

async function main() {
  if (!process.env.REDIS_URL) {
    console.warn('[worker] REDIS_URL not set — defaulting to redis://localhost:6379/1')
  }
  setupWorkers()

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — shutting down…`)
    // BullMQ workers close their connections on process exit; give in-flight
    // jobs a moment before forcing exit.
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  console.log('[worker] running. Press Ctrl+C to stop.')
}

main().catch((err) => {
  console.error('[worker] fatal startup error:', err)
  process.exit(1)
})
