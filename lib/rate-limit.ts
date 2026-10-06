/**
 * Sliding-window rate limiter for API routes.
 * Uses Redis when REDIS_URL is set, otherwise an in-memory fallback
 * (per-process — fine for single-instance, best-effort otherwise).
 */
import { NextResponse } from 'next/server'

interface Bucket {
  count: number
  resetAt: number
}

const memory = new Map<string, Bucket>()
let redis: { eval: (script: string, keys: number, ...args: Array<string | number>) => Promise<unknown> } | null = null
let redisTried = false

async function getRedis() {
  if (redisTried) return redis
  redisTried = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    const { default: IORedis } = await import('ioredis')
    const client = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    redis = client as unknown as typeof redis
  } catch {
    redis = null
  }
  return redis
}

const SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
return {count, ttl}
`

export interface RateLimitOptions {
  /** max requests per window */
  limit: number
  /** window in seconds */
  windowSec: number
  /** key scope, e.g. `recalc` — combined with store id */
  scope: string
}

/**
 * Returns a 429 response when over the limit, else null.
 * Standard tiers: { limit: 60, windowSec: 60 } for reads,
 * { limit: 10, windowSec: 60 } for heavy mutations.
 */
export async function rateLimit(
  storeId: string,
  opts: RateLimitOptions
): Promise<NextResponse | null> {
  const key = `rl:${opts.scope}:${storeId}`
  const now = Math.floor(Date.now() / 1000)

  const r = await getRedis()
  if (r) {
    try {
      const [count, ttl] = (await r.eval(SCRIPT, 1, key, opts.limit, opts.windowSec, now)) as [
        number,
        number
      ]
      if (count > opts.limit) {
        return limited(ttl)
      }
      return null
    } catch {
      // fall through to memory
    }
  }

  const b = memory.get(key)
  if (!b || b.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + opts.windowSec })
    return null
  }
  b.count += 1
  if (b.count > opts.limit) {
    return limited(b.resetAt - now)
  }
  return null
}

function limited(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Rate limit exceeded. Try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfterSec)) } }
  )
}
