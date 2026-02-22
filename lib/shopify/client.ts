/**
 * Shopify Admin API Client Wrapper
 * Handles rate limiting, retries, and typed responses
 */

export interface ShopifyConfig {
    shopDomain: string
    accessToken: string
    apiVersion?: string
}

export interface ShopifyOrder {
    id: number
    name: string
    email: string
    created_at: string
    updated_at: string
    total_price: string
    subtotal_price: string
    total_tax: string
    total_discounts: string
    financial_status: string
    fulfillment_status: string | null
    customer: {
        id: number
        email: string
        first_name: string
        last_name: string
        orders_count: number
        total_spent: string
        tags: string
    } | null
    line_items: Array<{
        id: number
        product_id: number
        variant_id: number
        title: string
        quantity: number
        price: string
        sku: string
        total_discount: string
    }>
    shipping_lines: Array<{
        price: string
    }>
    discount_codes: Array<{
        code: string
        amount: string
        type: string
    }>
    gateway: string
    currency: string
    note: string | null
    tags: string
    source_name: string
}

export interface ShopifyCustomer {
    id: number
    email: string
    first_name: string
    last_name: string
    orders_count: number
    total_spent: string
    created_at: string
    updated_at: string
    last_order_id: number | null
    last_order_name: string | null
    tags: string
    accepts_marketing: boolean
}

export interface ShopifyProduct {
    id: number
    title: string
    vendor: string
    product_type: string
    created_at: string
    updated_at: string
    published_at: string | null
    tags: string
    variants: Array<{
        id: number
        product_id: number
        title: string
        price: string
        sku: string
        inventory_quantity: number
        compare_at_price: string | null
    }>
}

export class ShopifyClient {
    private shopDomain: string
    private accessToken: string
    private apiVersion: string
    private baseUrl: string
    private requestCount = 0
    private lastRequestTime = 0

    constructor(config: ShopifyConfig) {
        this.shopDomain = config.shopDomain
        this.accessToken = config.accessToken
        this.apiVersion = config.apiVersion || '2024-01'
        this.baseUrl = `https://${this.shopDomain}/admin/api/${this.apiVersion}`
    }

    /** Rate limit: 2 requests/second for REST API */
    private async throttle(): Promise<void> {
        const now = Date.now()
        const timeSinceLastRequest = now - this.lastRequestTime
        if (timeSinceLastRequest < 500) {
            await new Promise((r) => setTimeout(r, 500 - timeSinceLastRequest))
        }
        this.lastRequestTime = Date.now()
        this.requestCount++
    }

    /** Make authenticated Shopify API request with retry logic */
    async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        await this.throttle()

        const url = `${this.baseUrl}${path}`
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        })

        // Handle rate limiting
        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '2')
            await new Promise((r) => setTimeout(r, retryAfter * 1000))
            return this.request<T>(path, options)
        }

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Shopify API error ${response.status}: ${error}`)
        }

        return response.json() as Promise<T>
    }

    /** Paginate through all results using cursor-based pagination */
    async *paginate<T>(path: string, resourceKey: string, params: Record<string, string> = {}): AsyncGenerator<T[]> {
        const searchParams = new URLSearchParams({ limit: '250', ...params })
        let url = `${path}?${searchParams}`

        while (url) {
            const response = await fetch(`${this.baseUrl}${url}`, {
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json',
                },
            })

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '2')
                await new Promise((r) => setTimeout(r, retryAfter * 1000))
                continue
            }

            if (!response.ok) throw new Error(`Shopify API error ${response.status}`)

            const data = await response.json() as Record<string, T[]>
            yield data[resourceKey] || []

            // Handle Link header pagination
            const linkHeader = response.headers.get('Link')
            if (linkHeader) {
                const nextMatch = linkHeader.match(/<([^>]+)>; rel="next"/)
                if (nextMatch) {
                    url = nextMatch[1].replace(this.baseUrl, '')
                } else {
                    break
                }
            } else {
                break
            }

            await this.throttle()
        }
    }

    /** Get orders within a date range */
    async getOrders(sinceDate: Date): Promise<ShopifyOrder[]> {
        const orders: ShopifyOrder[] = []
        const params = {
            status: 'any',
            created_at_min: sinceDate.toISOString(),
            fields: 'id,name,email,created_at,updated_at,total_price,subtotal_price,total_tax,total_discounts,financial_status,fulfillment_status,customer,line_items,shipping_lines,discount_codes,gateway,currency,note,tags,source_name',
        }

        for await (const batch of this.paginate<ShopifyOrder>('/orders.json', 'orders', params)) {
            orders.push(...batch)
        }

        return orders
    }

    /** Get all customers */
    async getCustomers(): Promise<ShopifyCustomer[]> {
        const customers: ShopifyCustomer[] = []
        const params = {
            fields: 'id,email,first_name,last_name,orders_count,total_spent,created_at,updated_at,last_order_id,last_order_name,tags,accepts_marketing',
        }

        for await (const batch of this.paginate<ShopifyCustomer>('/customers.json', 'customers', params)) {
            customers.push(...batch)
        }

        return customers
    }

    /** Get all products */
    async getProducts(): Promise<ShopifyProduct[]> {
        const products: ShopifyProduct[] = []
        const params = {
            fields: 'id,title,vendor,product_type,created_at,updated_at,published_at,tags,variants',
            status: 'active',
        }

        for await (const batch of this.paginate<ShopifyProduct>('/products.json', 'products', params)) {
            products.push(...batch)
        }

        return products
    }

    /** Create a Shopify Script (for discount exclusions) */
    async createScript(title: string, scriptContent: string): Promise<{ id: number; title: string }> {
        const data = await this.request<{ script_tag: { id: number; title: string } }>('/script_tags.json', {
            method: 'POST',
            body: JSON.stringify({
                script_tag: {
                    event: 'onload',
                    src: scriptContent,
                },
            }),
        })
        return data.script_tag
    }

    /** Update product price */
    async updateProductPrice(productId: number, variantId: number, newPrice: string): Promise<void> {
        await this.request(`/variants/${variantId}.json`, {
            method: 'PUT',
            body: JSON.stringify({
                variant: { id: variantId, price: newPrice },
            }),
        })
    }

    /** Verify HMAC for webhook/OAuth callbacks */
    static async verifyHmac(secret: string, query: Record<string, string>, hmac: string): Promise<boolean> {
        const message = Object.keys(query)
            .filter((k) => k !== 'hmac')
            .sort()
            .map((k) => `${k}=${query[k]}`)
            .join('&')

        const encoder = new TextEncoder()
        const keyData = encoder.encode(secret)
        const msgData = encoder.encode(message)

        const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        const sig = await crypto.subtle.sign('HMAC', key, msgData)
        const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')

        return hex === hmac
    }
}

/** Create a Shopify client for a given store */
export function createShopifyClient(shopDomain: string, accessToken: string): ShopifyClient {
    return new ShopifyClient({ shopDomain, accessToken })
}
