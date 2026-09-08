# Shopify Access Scopes Justification

Requested scopes: `read_orders,read_customers,read_products,read_discounts`

## read_orders
**Required.** Core business function: LeakProof ingests order history (180-day backfill +
real-time webhooks) to compute true profit, identify discount waste, detect churn patterns,
and surface revenue leaks. Without order data the app has nothing to analyse.

## read_customers
**Required.** Customer-level analysis (repeat-purchase rate, order count per customer,
days-since-last-order, LTV:CAC ratio, churn risk score, segment classification) is the
primary leak-detection mechanism. `numberOfOrders` on the customer object is the key
field — LeakProof uses it to distinguish repeat buyers from one-time buyers when
calculating discount waste on repeat purchasers.

No customer PII (email, phone, address) is stored. Customer IDs are stored as-is for
internal joins; emails are SHA-256 hashed if captured. All customer identities are
anonymised in the merchant-facing UI.

## read_products
**Required.** Product data provides the COGS reference and enables per-SKU analysis
(repeat-purchase rate per SKU, SKU fatigue detection, gross margin per product variant).
Without product data, COGS is estimated at 35 % of revenue — far less accurate.

## read_discounts
**Required.** Discount code usage is the foundation of the "discount waste" leak detector.
The app needs to know which discount codes exist and their value type (percentage vs fixed)
to correctly calculate wasted margin on repeat buyers.

## Intentionally NOT requested
| Scope | Reason not included |
|---|---|
| `write_script_tags` | Original plan included storefront injection; removed — out of scope for v1 |
| `read_analytics` | Shopify Analytics is insufficient for our per-order profit calculation; we compute from raw orders instead. This scope requires Shopify Partner approval. |
| `write_orders` | No write actions on orders in v1 |
| `write_products` | No price modifications in v1 |
| `read_price_rules` | Covered by read_discounts |
| Any customer PII scope | All analysis works on aggregated metrics and anonymised IDs |
