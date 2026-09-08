import { NextRequest } from 'next/server'
import { queryOne } from './db'
import { getStoreIdFromToken } from './auth/session-token'

/**
 * Resolve store_id from a request.
 * Priority: session token (embedded app) → first store (dev fallback).
 */
export async function getStoreFromRequest(req: NextRequest | null): Promise<string> {
  if (req) {
    const authHeader = req.headers.get('Authorization')
    const tokenStoreId = await getStoreIdFromToken(authHeader)
    if (tokenStoreId) return tokenStoreId
  }

  // Dev fallback: use the first (only) store when no token is present.
  // Remove this branch before App Store submission.
  const row = await queryOne<{ store_id: string }>('SELECT store_id FROM stores LIMIT 1')
  if (!row) throw new Error('No store configured. Run db:migrate first.')
  return row.store_id
}

/** Legacy helper — prefer getStoreFromRequest in route handlers */
export async function getDefaultStoreId(): Promise<string> {
  const row = await queryOne<{ store_id: string }>('SELECT store_id FROM stores LIMIT 1')
  if (!row) throw new Error('No store configured. Run db:migrate first.')
  return row.store_id
}
