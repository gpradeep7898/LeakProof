/**
 * Crypto helpers: AES-256-GCM token encryption + SHA-256 hashing.
 *
 * TOKEN_ENCRYPTION_KEY must be 32 random bytes, hex-encoded (64 chars).
 * Generate: openssl rand -hex 32
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set to 64 hex chars (openssl rand -hex 32)')
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt a secret (e.g. Shopify access token). Returns { ciphertext, iv } hex strings. */
export function encryptSecret(plaintext: string): { ciphertext: string; iv: string } {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: Buffer.concat([tag, ciphertext]).toString('hex'),
    iv: iv.toString('hex'),
  }
}

/** Decrypt a { ciphertext, iv } pair produced by encryptSecret. */
export function decryptSecret(ciphertextHex: string, ivHex: string): string {
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const combined = Buffer.from(ciphertextHex, 'hex')
  const tag = combined.subarray(0, 16)
  const ciphertext = combined.subarray(16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** One-way SHA-256 hex digest (for emails / customer identifiers). Never reversible. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** Constant-time string comparison (HMACs, hashes). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
