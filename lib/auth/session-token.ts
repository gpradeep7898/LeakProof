/**
 * Shopify Session Token verification (App Bridge v4 / embedded auth)
 * Session tokens are HS256 JWTs signed with SHOPIFY_API_SECRET.
 * Spec: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 */
import { jwtVerify } from 'jose'
import { queryOne } from '@/lib/db'

interface SessionTokenPayload {
  iss: string    // "https://{shop}/admin"
  dest: string   // "https://{shop}"
  aud: string    // API key
  sub: string    // user ID
  exp: number
  nbf: number
  iat: number
  jti: string
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) throw new Error('SHOPIFY_API_SECRET not configured')

  const key = new TextEncoder().encode(secret)
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
  return payload as unknown as SessionTokenPayload
}

/** Extract shop domain from a verified session token */
export function shopFromPayload(payload: SessionTokenPayload): string {
  return payload.dest.replace('https://', '').replace(/\/$/, '')
}

/** Verify the token from an Authorization: Bearer header and return the store_id */
export async function getStoreIdFromToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const payload = await verifySessionToken(token)
    const shopDomain = shopFromPayload(payload)
    const store = await queryOne<{ store_id: string }>(
      'SELECT store_id FROM stores WHERE shopify_domain = $1',
      [shopDomain]
    )
    return store?.store_id ?? null
  } catch {
    return null
  }
}

/** Verify HMAC for Shopify webhook requests */
export async function verifyWebhookHmac(body: string, hmacHeader: string | null): Promise<boolean> {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret || !hmacHeader) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const hex = Buffer.from(sig).toString('base64')
  return hex === hmacHeader
}
