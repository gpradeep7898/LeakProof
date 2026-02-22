# LeakProof Production Architecture

## 1. Shopify-Safe Execution Layer

We replace direct legacy API calls with **Shopify Functions** and **Async Flow Triggers** to ensure scale, stability, and compliance.

### Fix Type Mapping

| Fix Type | Legacy Approach | Production Architecture | Execution Mode |
|----------|-----------------|-------------------------|----------------|
| **VIP Discount Exclusion** | Shopify Script (Ruby) | **Cart & Checkout Validation Function (Rust/Wasm)** | Synchronous (Edge) |
| **Winback Campaign** | Direct Klaviyo API | **Shopify Flow Trigger** (`leakproof.risk.detected`) | Async (Event-driven) |
| **Pricing Optimization** | REST API PUT | **Bulk Mutation API** (GraphQL) via Job Queue | Async (Background) |
| **Reorder Reminder** | Email API | **Shopify Flow Trigger** (`leakproof.opportunity.reorder`) | Async (Event-driven) |
| **Subscription Rescue** | API Update | **Subscription Contract Update API** | Async (Background) |
| **Inventory Alerting** | Email/Slack API | **Shopify Flow Trigger** | Async (Event-driven) |

### Execution Constraints & Safety
*   **Idempotency**: All action dispatchers request a unique `idempotency_key` (ActionID + Timestamp).
*   **Rate Limits**: All GraphQL mutations are wrapped in a `LeakyBucket` limiter adhering to Shopify's cost-based limits.
*   **Reversibility**: Every mutable action (Price Change, Theme Injection) tracks a `rollback_snapshot` in DB before execution.

---

## 2. Action Approval System (State Machine)

Actions move through a strict lifecycle to ensure auditability and merchant control.

**Lifecycle States:**
1.  `DETECTED`: System identifies leak.
2.  `PROPOSED`: Engine generates a specific `ActionProposal` with `impact_estimate`.
3.  `PENDING_APPROVAL`: Queued for merchant review (High Risk) or Autopilot delay (Low Risk).
4.  `APPROVED`: Merchant/Autopilot authorizes execution. **Audit Log Created.**
5.  `QUEUED`: Sent to Redis Job Queue.
6.  `EXECUTING`: Currently running (e.g., waiting for Bulk Mutation).
7.  `VERIFYING`: Action complete, waiting for propagation (e.g., index update).
8.  `COMPLETED`: Active and monitoring for measurement.
9.  `ROLLED_BACK`: Reverted due to error or merchant request.

**Risk Classification:**
*   **LOW**: Tagging, internal reporting, Flow Triggers. (Autopilot Safe)
*   **MEDIUM**: Price decreases, Email sends. (Notify & Delay)
*   **HIGH**: Price increases, Discount exclusions, Theme modification. (Explicit Approval Required)

---

## 3. Background Job Architecture (BullMQ/Redis)

We separate detection, execution, and measurement into distinct queues to prevent "Analyze" heavy lifting from blocking "Execute" speed.

### Queue Structure
*   `q-detection`: Runs `LeakDetector` per store. Priority: Low. Concurrency: 5.
*   `q-execution`: Runs `ShopifyActionDispatcher`. Priority: High. Concurrency: 20.
*   `q-webhooks`: Ingests `orders/create`, `app/uninstalled`. Priority: Critical.
*   `q-measurement`: Runs `RecoveryEngine` nightly. Priority: Low.

### Infrastructure
*   **Redis**: Persistent store for job state.
*   **Workers**: Node.js workers scaling horizontally based on queue depth.
*   **Safety**: Exponential backoff (1m, 5m, 15m) for API rate limit errors (429).

---

## 4. Recovery Measurement Engine (Attribution)

To charge **Performance Fees**, we must prove causality.

**Methodology: Counterfactual Baseline**
For every action, we capture a `BaselineSnapshot`:
*   *Metric*: The specific metric targeted (e.g., "VIP Churn Rate").
*   *Trend*: The 30-day slope of that metric prior to action.
*   *Control*: (Optional) A similar customer segment NOT receiving the action.

**Profit Lift Calculation:**
$$ \text{Recovered Profit} = (\text{Actual Metric} - (\text{Baseline} \times \text{SeasonalityFactor})) \times \text{ValuePerUnit} $$

**Attribution Window:**
*   Active for 30-90 days post-action.
*   Confidence Score (0-1.0) decays over time as other factors intervene.

---

## 5. Billing API Integration

Billing logic runs strictly *after* Recovery Measurement confirms value.

**Usage-Based Billing Flow:**
1.  `RecoveryEngine` calculates confirmed profit lift for the month: `$1,000`.
2.  App applies agreed take rate (e.g., 5%): `$50`.
3.  System creates a **Usage Record** on the active Subscription via GraphQL.
    *   `description`: "Profit recovery fee for VIP Churn Fix (Feb)"
    *   `amount`: 50.00
    *   `currency`: USD
4.  Shopify aggregates this onto the merchant's monthly invoice.

**Safety Caps:**
*   All plans include a "Capped Amount" to prevent runaway usage charges, requiring merchant re-authorization if exceeded.
