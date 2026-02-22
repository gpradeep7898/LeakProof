
// Mock client for Function Configuration
const shopifyGraphQL = {
    // This would be replaced by actual @shopify/shopify-api GQL client
    mutate: async (query: string, variables: any) => { return { status: 'mock_success', data: { appInstallation: { id: 'app_123' } } } }
};

export class ShopifyActionDispatcher {

    /**
     * Dispatch an action to the correct execution mode
     */
    async dispatch(action: any): Promise<{ executed: boolean; mode: string, referenceId?: string }> {

        console.log(`[DISPATCH] Processing action ${action.id} of type ${action.action_type}`);

        switch (action.action_type) {
            case 'discount_exclusion':
                return await this.configureDiscountFunction(action);

            case 'winback_campaign':
            case 'reorder_reminder':
            case 'inventory_alert':
                return await this.triggerFlowEvent(action);

            case 'price_optimization':
            case 'subscription_rescue':
                return await this.queueAsyncJob(action);

            default:
                throw new Error(`Unknown action type: ${action.action_type}`);
        }
    }

    // 1. Synchronous Configuration of Shopify Functions
    private async configureDiscountFunction(action: any) {
        // We do NOT use Scripts. We update the App Metafield that the Function reads.
        const metaField = {
            namespace: "leakproof_functions",
            key: "vip_exclusion_config",
            value: JSON.stringify({
                excluded_customer_ids: action.configuration.excluded_customer_ids,
                cart_threshold: action.configuration.cart_threshold || 0
            }),
            type: "json"
        };

        // Use Admin GraphQL to set AppInstallation metafield
        const query = `mutation CreateAppDataMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                userErrors { field message }
            }
        }`;

        await shopifyGraphQL.mutate(query, {
            metafields: [{
                ownerId: "gid://shopify/AppInstallation/CURRENT", // Applies to the app installation scope
                ...metaField
            }]
        });

        return { executed: true, mode: 'FUNCTION_CONFIG' };
    }

    // 2. Trigger Shopify Flow
    private async triggerFlowEvent(action: any) {
        // Fire a 'flow/trigger' mutation
        const triggerPayload = {
            customer_id: action.configuration.customer_id,
            product_id: action.configuration.product_id,
            detected_leak: action.leak_id,
            recommended_offer: action.configuration.offer_code
        };

        console.log(`[FLOW] Triggering leakproof.risk.detected`, triggerPayload);

        // Simulate flow trigger
        // await shopifyClient.post('/admin/api/2024-01/flow/trigger', ...);

        return { executed: true, mode: 'FLOW_TRIGGER' };
    }

    // 3. Queue Async Background Job
    private async queueAsyncJob(action: any) {
        // For heavy lifting (Bulk Mutations)
        const { queues } = require('../queue/bull');

        await queues.execution.add('execute-bulk-mutation', {
            action_id: action.id,
            mutation_type: action.action_type,
            payload: action.configuration
        }, {
            priority: 1, // High priority
            attempts: 5,
            backoff: { type: 'exponential', delay: 60000 } // Wait 1m, 2m, 4m... if rate limited
        });

        return { executed: false, mode: 'QUEUED_ASYNC', referenceId: action.id };
    }
}
