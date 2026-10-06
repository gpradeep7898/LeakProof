/**
 * Shopify GraphQL Admin API Client
 * Uses cost-based rate limiting (leaky bucket: 1000 pts, 50 pts/s refill).
 * API version: 2026-07
 */

const API_VERSION = '2026-07'

interface GraphQLResponse<T> {
  data: T
  errors?: unknown[]
  extensions?: { cost?: { requestedQueryCost: number; throttleStatus: { currentlyAvailable: number; restoreRate: number } } }
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// ── Order types ────────────────────────────────────────────────────────────────
export interface GQLOrder {
  id: string           // gid://shopify/Order/123
  legacyResourceId: string
  name: string
  email: string | null
  createdAt: string
  updatedAt: string
  totalPriceSet: MoneyBag
  subtotalPriceSet: MoneyBag
  totalTaxSet: MoneyBag
  totalDiscountsSet: MoneyBag
  financialStatus: string | null
  displayFulfillmentStatus: string
  discountCodes: string[]
  customer: GQLCustomerRef | null
  lineItems: { nodes: GQLLineItem[] }
  shippingLines: { nodes: { originalPriceSet: MoneyBag }[] }
  paymentGatewayNames: string[]
  currencyCode: string
  note: string | null
  tags: string[]
  sourceIdentifier: string | null
}

export interface GQLCustomerRef {
  id: string
  legacyResourceId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  numberOfOrders: number
  amountSpent: Money
  tags: string[]
}

export interface GQLLineItem {
  id: string
  title: string
  quantity: number
  sku: string | null
  originalUnitPriceSet: MoneyBag
  discountedTotalSet: MoneyBag
  product: { id: string; legacyResourceId: string } | null
  variant: { id: string; legacyResourceId: string } | null
}

export interface GQLCustomer {
  id: string
  legacyResourceId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  numberOfOrders: number
  amountSpent: Money
  createdAt: string
  updatedAt: string
  lastOrder: { id: string; name: string } | null
  tags: string[]
  emailMarketingConsent: { marketingState: string } | null
}

export interface GQLProduct {
  id: string
  legacyResourceId: string
  title: string
  vendor: string
  productType: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  tags: string[]
  status: string
  variants: { nodes: GQLVariant[] }
}

export interface GQLVariant {
  id: string
  legacyResourceId: string
  title: string
  price: string
  sku: string | null
  inventoryQuantity: number | null
  compareAtPrice: string | null
}

interface MoneyBag { shopMoney: Money }
interface Money { amount: string; currencyCode: string }

// ── Client ────────────────────────────────────────────────────────────────────
export class ShopifyGraphQLClient {
  private shopDomain: string
  private accessToken: string
  private endpoint: string
  private availableCost = 1000
  private readonly restoreRate = 50

  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain
    this.accessToken = accessToken
    this.endpoint = `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    // Throttle: wait if we'd exceed cost budget
    if (this.availableCost < 100) {
      const waitMs = Math.ceil((100 - this.availableCost) / this.restoreRate) * 1000
      await new Promise((r) => setTimeout(r, waitMs))
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10)
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      return this.query<T>(query, variables)
    }

    if (!response.ok) {
      throw new Error(`Shopify GraphQL error ${response.status}: ${await response.text()}`)
    }

    const json = (await response.json()) as GraphQLResponse<T>

    // Update cost tracking
    const cost = json.extensions?.cost
    if (cost) {
      this.availableCost = cost.throttleStatus.currentlyAvailable
    }

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
    }

    return json.data
  }

  /** Fetch all orders created on or after sinceDate, paginated */
  async *getOrdersAll(sinceDate: Date): AsyncGenerator<GQLOrder> {
    const sinceISO = sinceDate.toISOString()
    let cursor: string | null = null

    while (true) {
      type OrderPage = { orders: { nodes: GQLOrder[]; pageInfo: PageInfo } }
      const data: OrderPage = await this.query<OrderPage>(
        ORDER_QUERY,
        { query: `created_at:>='${sinceISO}'`, after: cursor }
      )
      for (const order of data.orders.nodes) yield order
      if (!data.orders.pageInfo.hasNextPage) break
      cursor = data.orders.pageInfo.endCursor
    }
  }

  /** Fetch all customers, paginated */
  async *getCustomersAll(): AsyncGenerator<GQLCustomer> {
    let cursor: string | null = null

    while (true) {
      type CustomerPage = { customers: { nodes: GQLCustomer[]; pageInfo: PageInfo } }
      const data: CustomerPage = await this.query<CustomerPage>(
        CUSTOMER_QUERY,
        { after: cursor }
      )
      for (const c of data.customers.nodes) yield c
      if (!data.customers.pageInfo.hasNextPage) break
      cursor = data.customers.pageInfo.endCursor
    }
  }

  /** Fetch all active products, paginated */
  async *getProductsAll(): AsyncGenerator<GQLProduct> {
    let cursor: string | null = null

    while (true) {
      type ProductPage = { products: { nodes: GQLProduct[]; pageInfo: PageInfo } }
      const data: ProductPage = await this.query<ProductPage>(
        PRODUCT_QUERY,
        { query: 'status:active', after: cursor }
      )
      for (const p of data.products.nodes) yield p
      if (!data.products.pageInfo.hasNextPage) break
      cursor = data.products.pageInfo.endCursor
    }
  }

  /** Register a webhook subscription */
  async registerWebhook(topic: string, callbackUrl: string): Promise<string> {
    const data = await this.query<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null
        userErrors: Array<{ field: string; message: string }>
      }
    }>(WEBHOOK_CREATE_MUTATION, {
      topic,
      webhookSubscription: { callbackUrl, format: 'JSON' },
    })

    const { webhookSubscription, userErrors } = data.webhookSubscriptionCreate
    if (userErrors.length) {
      throw new Error(`Webhook registration error: ${userErrors.map((e) => e.message).join(', ')}`)
    }
    return webhookSubscription!.id
  }
}

export function createGraphQLClient(shopDomain: string, accessToken: string) {
  return new ShopifyGraphQLClient(shopDomain, accessToken)
}

// ── GraphQL fragments & queries ───────────────────────────────────────────────

const ORDER_QUERY = `
  query GetOrders($query: String, $after: String) {
    orders(first: 250, query: $query, after: $after) {
      nodes {
        id
        legacyResourceId
        name
        email
        createdAt
        updatedAt
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        financialStatus
        displayFulfillmentStatus
        discountCodes
        customer {
          id
          legacyResourceId
          email
          firstName
          lastName
          numberOfOrders
          amountSpent { amount currencyCode }
          tags
        }
        lineItems(first: 50) {
          nodes {
            id
            title
            quantity
            sku
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedTotalSet { shopMoney { amount currencyCode } }
            product { id legacyResourceId }
            variant { id legacyResourceId }
          }
        }
        shippingLines(first: 5) {
          nodes {
            originalPriceSet { shopMoney { amount currencyCode } }
          }
        }
        paymentGatewayNames
        currencyCode
        note
        tags
        sourceIdentifier
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const CUSTOMER_QUERY = `
  query GetCustomers($after: String) {
    customers(first: 250, after: $after) {
      nodes {
        id
        legacyResourceId
        email
        firstName
        lastName
        numberOfOrders
        amountSpent { amount currencyCode }
        createdAt
        updatedAt
        lastOrder { id name }
        tags
        emailMarketingConsent { marketingState }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PRODUCT_QUERY = `
  query GetProducts($query: String, $after: String) {
    products(first: 250, query: $query, after: $after) {
      nodes {
        id
        legacyResourceId
        title
        vendor
        productType
        createdAt
        updatedAt
        publishedAt
        tags
        status
        variants(first: 100) {
          nodes {
            id
            legacyResourceId
            title
            price
            sku
            inventoryQuantity
            compareAtPrice
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const WEBHOOK_CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`
