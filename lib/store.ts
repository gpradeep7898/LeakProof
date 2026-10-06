import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from './db'
import { getStoreIdFromToken } from './auth/session-token'

/**
 * Thrown when a request carries no valid Shopify session token.
 * Route handlers must convert this to a 401 (see unauthorizedResponse).
 */
export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized: missing or invalid Shopify session token.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Resolve store_id from a request.
 *
 * The ONLY production path is a verified Shopify session token
 * (App Bridge `Authorization: Bearer <token>` header).
 *
 * There is no silent fallback to another store: an unauthenticated request
 * is rejected with UnauthorizedError (401). Cross-merchant data exposure is
 * not possible through this function.
 *
 * Local development: set ALLOW_DEV_UNAUTHENTICATED=true (and keep
 * NODE_ENV != 'production') to use the first store for the demo/seed flow.
 * Never enable this in production.
 */
export async function getStoreFromRequest(req: NextRequest | Request | null): Promise<string> {
  if (req) {
    const authHeader = req.headers.get('Authorization')
    const tokenStoreId = await getStoreIdFromToken(authHeader)
    if (tokenStoreId) return tokenStoreId
  }

  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_UNAUTHENTICATED === 'true') {
    console.warn(
      '[auth] ALLOW_DEV_UNAUTHENTICATED is set — resolving the first store without a session token. ' +
        'Never enable this in production.'
    )
    const row = await queryOne<{ store_id: string }>('SELECT store_id FROM stores LIMIT 1')
    if (!row) throw new Error('No store configured. Run db:migrate first.')
    return row.store_id
  }

  throw new UnauthorizedError()
}

/**
 * Convert an UnauthorizedError into a 401 JSON response.
 * Returns null for any other error so existing handlers keep their behavior.
 */
export function unauthorizedResponse(err: unknown): NextResponse | null {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
