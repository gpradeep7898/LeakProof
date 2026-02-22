/**
 * Shopify OAuth Callback Handler
 * GET /api/auth/shopify/callback
 */
import { NextRequest, NextResponse } from 'next/server'
import { ShopifyClient } from '@/lib/shopify/client'
import { query, execute, queryOne } from '@/lib/db'
import { nanoid } from 'nanoid'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || ''
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/shopify/callback`

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl

    const shop = searchParams.get('shop') || ''
    const code = searchParams.get('code') || ''
    const state = searchParams.get('state') || ''
    const hmac = searchParams.get('hmac') || ''

    // Validate state (CSRF protection)
    const storedState = req.cookies.get('shopify_oauth_state')?.value
    const storedShop = req.cookies.get('shopify_oauth_shop')?.value

    if (!storedState || storedState !== state) {
        return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 })
    }

    if (storedShop !== shop) {
        return NextResponse.json({ error: 'Shop mismatch' }, { status: 400 })
    }

    // Verify HMAC signature
    const allParams: Record<string, string> = {}
    searchParams.forEach((value, key) => { allParams[key] = value })

    const isValid = await ShopifyClient.verifyHmac(SHOPIFY_API_SECRET, allParams, hmac)
    if (!isValid) {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
    }

    // Exchange code for access token
    let accessToken: string
    try {
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: SHOPIFY_API_KEY,
                client_secret: SHOPIFY_API_SECRET,
                code,
            }),
        })

        if (!tokenResponse.ok) {
            throw new Error(`Token exchange failed: ${tokenResponse.status}`)
        }

        const tokenData = await tokenResponse.json() as { access_token: string; scope: string }
        accessToken = tokenData.access_token

        // Upsert store record
        const existingStore = await queryOne<{ store_id: string }>(
            'SELECT store_id FROM stores WHERE shopify_domain = $1',
            [shop]
        )

        if (existingStore) {
            // Update existing store
            await execute(`
        UPDATE stores SET
          shopify_access_token = $1,
          shopify_scope = $2,
          shopify_domain = $3,
          onboarded_at = COALESCE(onboarded_at, NOW()),
          updated_at = NOW()
        WHERE shopify_domain = $4
      `, [accessToken, tokenData.scope, shop, shop])
        } else {
            // Create new store
            await execute(`
        INSERT INTO stores (store_id, name, shopify_domain, shopify_access_token, shopify_scope, plan, onboarded_at, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 'free', NOW(), NOW(), NOW())
      `, [shop, shop, accessToken, tokenData.scope])
        }

    } catch (err) {
        console.error('Shopify OAuth callback error:', err)
        return NextResponse.redirect(`${APP_URL}/app/connect?error=oauth_failed`)
    }

    // Clear OAuth cookies and redirect to app
    const response = NextResponse.redirect(`${APP_URL}/app?connected=shopify`)
    response.cookies.delete('shopify_oauth_state')
    response.cookies.delete('shopify_oauth_shop')

    return response
}
