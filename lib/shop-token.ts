/**
 * Access-token retrieval with transparent decryption.
 * Tokens are stored AES-256-GCM encrypted (shopify_access_token + shopify_access_token_iv).
 * Legacy plaintext tokens (pre-Phase-2) are passed through with a rotation warning.
 */
import { queryOne, execute } from './db'
import { decryptSecret, encryptSecret } from './crypto'

interface TokenRow {
  shopify_domain: string
  shopify_access_token: string | null
  shopify_access_token_iv: string | null
}

export async function getStoreAccessToken(storeId: string): Promise<string | null> {
  const row = await queryOne<TokenRow>(
    'SELECT shopify_domain, shopify_access_token, shopify_access_token_iv FROM stores WHERE store_id = $1',
    [storeId]
  )
  if (!row?.shopify_access_token) return null

  // Encrypted token: decrypt
  if (row.shopify_access_token_iv) {
    try {
      return decryptSecret(row.shopify_access_token, row.shopify_access_token_iv)
    } catch (err) {
      console.error(`[token] Failed to decrypt token for store ${storeId}:`, err)
      return null
    }
  }

  // Legacy plaintext token: pass through, warn once per process
  console.warn(`[token] Store ${storeId} has a plaintext token — will be re-encrypted on next OAuth.`)
  return row.shopify_access_token
}

/** Encrypt + store a Shopify access token for a shop domain. */
export async function storeEncryptedToken(shopDomain: string, accessToken: string): Promise<void> {
  const { ciphertext, iv } = encryptSecret(accessToken)
  await execute(
    `UPDATE stores SET shopify_access_token = $2, shopify_access_token_iv = $3, updated_at = NOW()
     WHERE shopify_domain = $1`,
    [shopDomain, ciphertext, iv]
  )
}
