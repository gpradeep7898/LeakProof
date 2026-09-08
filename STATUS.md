# LeakProof — Status Audit
_Generated: 2026-09-07_

---

## 1. Stack Inventory

**Framework / Language / Runtime**
| Item | Value |
|---|---|
| Framework | Next.js 14.2.18 (App Router) |
| Language | TypeScript 5.6 |
| Package manager | npm |
| Node version | Not pinned (no `.nvmrc`, no `engines` in package.json) |

**Dependencies**

| Package | Purpose |
|---|---|
| `next 14.2.18` | Full-stack React framework (App Router) |
| `react / react-dom 18` | UI rendering |
| `@tanstack/react-query 5` | Server-state cache / data fetching |
| `framer-motion 12` | Animations |
| `lucide-react` | Icon set |
| `recharts 3` | Charting (referenced in ARCHITECTURE.md but no chart components found in codebase) |
| `tailwindcss 3 / postcss / autoprefixer` | CSS |
| `clsx / tailwind-merge` | Classname utilities |
| `react-hot-toast` | Toast notifications |
| `pg 8` | PostgreSQL client (raw SQL — no ORM) |
| `bullmq 5 / ioredis 5` | Background job queues / Redis — configured in `lib/queue/bull.ts` but workers never started in normal dev flow |
| `papaparse / csv-parse` | CSV parsing (client and server side) |
| `json2csv` | CSV export |
| `multer` | File upload middleware (required by the CSV upload route) |
| `nanoid 5` | Short ID generation |
| `uuid 13` | UUID generation |
| `dotenv 17` | Environment variable loading in migration scripts |
| **`stripe 17`** | **WRONG — violates Shopify Partner Agreement. App fees must go through Shopify Billing API, not Stripe.** |

**Database**
- Engine: PostgreSQL
- ORM: none — raw SQL via `pg.Pool` (`lib/db.ts`)
- Migrations: exist but fragmented across 7 files (`scripts/migrate.js`, `migrate_leakproof_full.js`, `migrate_v3.js`, `migrate_v4.js`, `migrate_profit_os.js`, `migrate_production.js`, `migrate_csv_support.js`, `schema_production.sql`). No migration tracking table — re-running is idempotent via `IF NOT EXISTS`. The canonical "run this" command is `npm run db:migrate:full`.

**Hosting / Deploy config**
- MISSING — no `vercel.json`, no `Dockerfile`, no `fly.toml`, no `.railway.json`. Nothing. Zero deploy config.

---

## 2. Shopify Integration Status

| Item | Status | Evidence |
|---|---|---|
| shopify.app.toml (Partner config) | **MISSING** | No `.toml` file anywhere in repo |
| OAuth install flow (initiation) | **PARTIAL** | `app/api/auth/shopify/route.ts` — correct redirect URL, CSRF state cookie, HMAC verify |
| OAuth callback / token exchange | **PARTIAL** | `app/api/auth/shopify/callback/route.ts` — token exchanged, store upserted. No webhook registration after install. |
| Session token auth (App Bridge) | **MISSING** | No `@shopify/app-bridge` package. No `@shopify/app-bridge-react`. App is a standalone web app, not embedded in Shopify Admin. |
| Admin API client | **PARTIAL (WRONG PROTOCOL)** | `lib/shopify/client.ts` — fully REST. Calls `/orders.json`, `/customers.json`, `/products.json`. Shopify requires GraphQL for all new public apps. REST is being deprecated. |
| Requested access scopes | **PARTIAL** | `app/api/auth/shopify/route.ts:9`: `'read_orders,read_customers,read_products,write_script_tags,read_discounts,read_analytics'`. `write_script_tags` is unnecessary for analytics; `read_analytics` requires Partner approval; 6 scopes vs the minimum possible. No `SCOPES.md` justification file. |
| Webhook registration | **MISSING** | No routes under `/api/webhooks/`. No registration call in OAuth callback. |
| GDPR: `customers/data_request` | **MISSING** | Grep for "gdpr", "data_request", "customers_redact", "shop_redact" returns zero results. |
| GDPR: `customers/redact` | **MISSING** | Same. |
| GDPR: `shop/redact` | **MISSING** | Same. |
| Shopify Billing API (appSubscriptionCreate) | **MISSING** | `stripe` package in `package.json`. No `appSubscriptionCreate` mutation anywhere. |
| Polaris / App Bridge UI | **MISSING** | Custom Tailwind CSS components throughout. No `@shopify/polaris` in package.json. |

---

## 3. Data Layer

### Tables (from `scripts/migrate_leakproof_full.js` + `schema_production.sql`)

| Table | Key Fields | Actually Written By Code? |
|---|---|---|
| `stores` | store_id (PK), name, plan, shopify_domain, shopify_access_token | YES — OAuth callback, seed |
| `customers` | customer_id+store_id (PK), email_hash, segment, churn_risk_score, total_orders, total_revenue, lifetime_value, avg_order_value | YES — `shopifySync.syncCustomers()`, CSV import |
| `orders` | order_id+store_id (PK), customer_id, total_price, total_discounts, net_profit, cogs, platform_fees, payment_processing_fees, ad_attribution_cost, shipping_cost | YES — `shopifySync.syncOrders()`, CSV import |
| `order_items` | id, order_id, store_id, product_id, sku, quantity, line_price, line_total | PARTIAL — CSV import path only; Shopify sync does not write order_items |
| `products` | product_id+store_id (PK), sku, cogs, avg_selling_price, repurchase_rate, churn_correlation | YES — `shopifySync.syncProducts()`, CSV import |
| `discounts` | discount_id, code, total_discount_amount, leakage_amount | LIKELY DEAD — no code path visibly writes here |
| `computed_metrics` | store_id (PK), repeat_rate, revenue_at_risk, avg_reorder_days | DEAD — `metricEngine.ts` exists but not wired to any route |
| `revenue_leaks` | leak_id, store_id, leak_type, severity, estimated_monthly_loss, recommended_action_json | YES — `leakDetector.detectAllLeaks()` |
| `actions` | action_id, leak_id, status, potential_gain, expected_impact | PARTIAL — action routes read/write; execution is mock for most types |
| `customer_segments` | segment_id, segment_name, customer_count | PARTIAL — segment routes may populate; depends on CSV import |
| `segment_members` | segment_id, customer_id, store_id | PARTIAL — same as above |
| `product_intelligence` | product_id, repeat_rate, suitability_score | DEAD — no writes found |
| `churn_predictions` | customer_id, predicted_reorder_date | DEAD — no writes found |
| `action_approval_logs` | log_id, action_id, actor_id, action_type | DEAD — schema in `schema_production.sql` but no code writes here |
| `recovery_measurements` | measurement_id, profit_recovered, confidence_score | DEAD — ARCHITECTURE.md describes it; `RecoveryEngine.ts` exists but is not called |
| `billing_events` | event_id, charge_type, shopify_charge_id | DEAD — never written |
| `import_jobs` / `import_rows` | job staging tables | PARTIAL — CSV upload pipeline uses these |

---

## 4. Business Logic

### Profit / Margin Calculations

| Location | Function | Formula | Real or Fake? |
|---|---|---|---|
| `lib/services/shopifySync.ts:46` | `calculateOrderProfit()` | revenue − COGS − shipping − discounts − platformFees − paymentFees − adCost − returnCost | Real Shopify data, but COGS defaults to 35% estimate if not in DB; CAC hardcoded $45; return cost hardcoded 3%; shipping floor 4% of revenue |
| `lib/services/profitCalculator.ts:24` | `calculateOrderProfit()` | Same structure, more DB lookups | Mixed — COGS from DB if available, shipping weight-based with hardcoded rates, return rate faked via dummy query (`SELECT 0.05 as return_rate`) |
| `app/api/v1/profit/summary/route.ts:19` | Inline SQL | `SUM(net_profit)` from `orders` table | Real data if sync has run; empty/zeros before first sync |

### Leak Detection

| Leak Type | File:Function | Formula | Notes |
|---|---|---|---|
| VIP churn | `leakDetector.ts:125` | `churnedVIPCount * avgAOV * 0.3` | Real SQL; 0.3 multiplier is assumed "winback probability" — hardcoded |
| One-time buyers | `leakDetector.ts:175` | `(totalValue * 0.3) / 3` | Real SQL |
| Discount waste on VIPs | `leakDetector.ts:209` | `SUM(total_discounts)` for segment='VIP' | Real SQL; depends on segment being populated first |
| Product low-repeat | `leakDetector.ts:244` | `avgRevenue * 0.2 * productCount / 6` | Semi-real — depends on `repurchase_rate` col, which is 0 after Shopify sync (not computed) |
| SKU fatigue | `leakDetector.ts:285` | `fatigue.length * 50` | FAKE — `$50` per product is a hardcoded placeholder; `churn_correlation` column is never computed |
| Discount dependency | `leakDetector.ts:315` | `revenueAtRisk * 0.2 * 0.3` | Real SQL |

**Hardcoded values that must be replaced before ship:**
- CAC: `$45` (`shopifySync.ts:167`)
- COGS fallback: 35% of revenue (`shopifySync.ts:58`)
- Platform fee rate: 1.5% (`shopifySync.ts:71`)
- Return cost: 3% of revenue (`shopifySync.ts:77`)
- SKU fatigue loss: `fatigue.length * 50` (`leakDetector.ts:304`)
- VIP churn recovery multiplier: 0.3 (`leakDetector.ts:157`)

**All money is handled as floats.** `parseFloat()` is used throughout. `DECIMAL(12,2)` in DB but no enforcement of minor-unit integers. This violates the stated constraint.

---

## 5. Frontend

| Route | Page | Data Source | Status |
|---|---|---|---|
| `/app` | Money Snapshot Dashboard | `GET /api/v1/profit/summary`, `GET /api/v1/leaks`, `GET /api/v1/benchmarks/me` | Real data (if synced). Build fails so cannot verify in browser. |
| `/app/leaks` | Revenue Leak Map | `GET /api/v1/leaks` | Real data (if synced). |
| `/app/actions` | Action Approval Queue | `GET /api/v1/actions` | Real data structure; actual execution is mostly simulated (no real Shopify mutations). |
| `/app/segments` | Customer Segments | `GET /api/segments` | Real data (if synced/imported). |
| `/app/products` | Product Catalog | `GET /api/products` | Real data (if synced). |
| `/app/connect` | Data Connect | CSV upload → `POST /api/csv/upload`; Shopify OAuth → `GET /api/auth/shopify` | CSV upload works. The "Authorize Shopify →" button at `connect/page.tsx:478` has **no `href` or `onClick`** — clicking it does nothing. Dead UI. |
| `/app/benchmarks` | Benchmarks | `GET /api/v1/benchmarks/me` | Route has TypeScript errors (build breaks here). |

---

## 6. Honest Completion Estimate

| Component | % Complete | Justification |
|---|---|---|
| Database schema | 65% | Tables exist, fragmented migrations, no tracking, several dead tables |
| Shopify OAuth | 50% | Code exists, HMAC validation done, but state stored in third-party cookies (fails embedded), no webhook registration, no post-install setup |
| Shopify API client | 20% | REST only — needs full GraphQL rewrite before App Store submission |
| Data sync (Shopify→DB) | 55% | Orders/products/customers sync works via REST; no order_items sync; not resumable; no cursor persistence |
| Leak detection engine | 50% | 4/6 detectors run on real data; 2 depend on columns never populated (repurchase_rate, churn_correlation) |
| Profit calculation | 40% | Formula correct but 5+ hardcoded fallbacks; floats not minor units |
| Frontend UI | 65% | Custom Tailwind (not Polaris); all pages exist; one dead button; build fails |
| Session token / App Bridge | 0% | Not started |
| Polaris components | 0% | Not started |
| GDPR webhooks | 0% | Not started |
| Shopify Billing API | 0% | Stripe package instead — wrong |
| Unit / integration tests | 0% | Zero test files in the project |
| Deploy configuration | 0% | No Vercel/fly/Docker config |
| shopify.app.toml | 0% | Missing |

**Biggest single blocker to a working end-to-end demo:** The TypeScript build fails (`app/api/v1/benchmarks/me/route.ts` calls methods that don't exist on `BenchmarkService`; `app/api/v1/leaks/route.ts` passes wrong arguments to `LeakDetector`). The app cannot be deployed or even built until these are fixed.

---

## 7. Red Flags

1. **`stripe` in dependencies** (`package.json:36`). Charging merchants via Stripe for app fees violates the Shopify Partner Agreement. Must use `appSubscriptionCreate` GraphQL mutation (Shopify Billing API). Ship as-is and your app will be rejected or delisted.

2. **Build is broken** — `npm run build` fails at type-check. Errors:
   - `app/api/v1/benchmarks/me/route.ts:17` — calls `getMerchantBenchmark()` which does not exist (correct name: `getMerchantBenchmarks()`)
   - `app/api/v1/benchmarks/me/route.ts:18` — calls `computeMerchantMetrics()` which does not exist on `BenchmarkService`
   - `app/api/v1/leaks/route.ts:89-90` — `LeakDetector` constructor takes 0 args but is called with `storeId`; `detectAllLeaks()` takes 1 arg but is called with 0
   - `lib/services/autopilot.ts:50-51` — same `LeakDetector` mismatch
   - `lib/services/csvIngestion.ts:360` — needs `downlevelIteration` or `target` ≥ `es2015`

3. **Zero tests** — no `.test.ts`, `.spec.ts`, or jest/vitest config anywhere in the project. Shopify review will not reject for this, but any financial calculation bug is invisible.

4. **No GDPR webhooks** — Shopify requires `customers/data_request`, `customers/redact`, and `shop/redact` to be registered and functional before approval. Missing entirely.

5. **No Polaris / App Bridge** — All UI uses custom Tailwind CSS. Shopify App Store requires embedded apps to use App Bridge for session token auth. This is a structural rebuild, not a cosmetic change.

6. **REST API only** — `lib/shopify/client.ts` uses `/orders.json`, `/customers.json`, `/products.json` REST endpoints. Shopify has publicly announced REST deprecation. New public apps must use the GraphQL Admin API. The entire sync layer needs to be rewritten.

7. **No `shopify.app.toml`** — Cannot register the app in Partner Dashboard, run `shopify app dev`, or submit to the App Store without this file.

8. **Money is floats** — `parseFloat()` everywhere, `DECIMAL(12,2)` in DB. Financial calculations should use integer minor units to avoid floating-point rounding errors. Calculations like `revenue * 0.029 + 0.30` will silently accumulate error.

9. **Shopify "Connect" button is dead** — `app/app/connect/page.tsx:478`: the "Authorize Shopify →" button has no `href` and no `onClick` handler. Clicking it does absolutely nothing.

10. **OAuth state via third-party cookies** — `app/api/auth/shopify/route.ts:48-58` stores state in cookies. Shopify embedded apps run in an iframe where third-party cookies are blocked in Chrome/Safari. App Bridge session tokens must be used instead.

11. **Missing `SCOPES.md`** — `write_script_tags` and `read_analytics` scopes are requested but unjustified. Shopify review may flag over-permissioned apps.

12. **No resumable sync** — `shopifySync.syncOrders()` fetches all orders since a date in a single in-process loop. If it fails midway, the entire backfill must restart from scratch.

---

## Build and Test Output

### `npm run build`
```
> next build
✓ Compiled successfully
Linting and checking validity of types ... Failed to compile.

./app/api/v1/benchmarks/me/route.ts:17:21
Type error: Property 'getMerchantBenchmark' does not exist on type 'BenchmarkService'.
Did you mean 'getMerchantBenchmarks'?
```
**Result: BUILD FAILS**

### Tests
```
No test framework configured. No test files found.
```
**Result: NO TESTS**

---

## Next 5 Concrete Tasks (Smallest First)

1. **Fix the TypeScript errors** so `npm run build` passes. Three files: fix method names in `benchmarks/me/route.ts`, fix `LeakDetector` constructor/method signature in `leaks/route.ts` and `autopilot.ts`, add `"target": "es2015"` or `"downlevelIteration": true` to `tsconfig.json`. Estimated: 30 minutes.

2. **Wire the "Authorize Shopify" button** in `app/app/connect/page.tsx:478` to redirect to `/api/auth/shopify?shop=<input>`. Add a shop domain input field. The OAuth route exists; the UI just doesn't call it. Estimated: 1 hour.

3. **Add the three mandatory GDPR webhooks** — create `app/api/webhooks/customers-data-request/route.ts`, `customers-redact/route.ts`, `shop-redact/route.ts`. Each should verify the Shopify HMAC and return 200. Register them after OAuth callback. These are required by Shopify and are the #1 reason first submissions fail. Estimated: 2 hours.

4. **Remove `stripe` and create `shopify.app.toml`** — remove Stripe dependency before it causes Partner Agreement issues, create the Partner config so the app can be registered and submitted. Estimated: 1 hour.

5. **Rewrite Shopify API client to use GraphQL Admin API** — replace `/orders.json` REST calls with the `orders` GraphQL query with cursor-based pagination and cost budget tracking. This is load-bearing for App Store approval and future-proofing against REST deprecation. Start with orders only (needed for the v1 discount waste feature). Estimated: 1 day.
