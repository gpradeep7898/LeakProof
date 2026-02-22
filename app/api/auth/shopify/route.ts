/**
 * Shopify OAuth Initiation
 * GET /api/auth/shopify?shop=mystore.myshopify.com
 */
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || ''
const SCOPES = 'read_orders,read_customers,read_products,write_script_tags,read_discounts,read_analytics'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/shopify/callback`

export async function GET(req: NextRequest) {
    const shop = req.nextUrl.searchParams.get('shop')

    if (!shop) {
        return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
    }

    // Validate shop domain format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
        return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
    }

    if (!SHOPIFY_API_KEY) {
        return NextResponse.json({
            error: 'Shopify integration not configured. Set SHOPIFY_API_KEY in environment variables.',
            setup_required: true,
        }, { status: 503 })
    }

    // Generate state for CSRF protection
    const state = nanoid(32)

    // Build OAuth URL
    const params = new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
        'grant_options[]': 'per-user',
    })

    const authUrl = `https://${shop}/admin/oauth/authorize?${params}`

    // Store state in cookie for verification
    const response = NextResponse.redirect(authUrl)
    response.cookies.set('shopify_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 600, // 10 minutes
        path: '/',
    })
    response.cookies.set('shopify_oauth_shop', shop, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 600,
        path: '/',
    })

    return response
}
