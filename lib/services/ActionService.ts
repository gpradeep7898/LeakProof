
// Mock of the existing ShopifyExecutor but updated
import { ShopifyActionDispatcher } from './ShopifyActionDispatcher';
import { RecoveryEngine } from './RecoveryEngine';
import { queryOne } from '../db';

export class ActionService {

    private dispatcher: ShopifyActionDispatcher;
    private recoveryEngine: RecoveryEngine;

    constructor() {
        this.dispatcher = new ShopifyActionDispatcher();
        this.recoveryEngine = new RecoveryEngine();
    }

    /**
     * Entry point for Merchant Approval
     */
    async approveAction(actionId: string, storeId: string, userId: string) {

        // 1. Fetch Action
        const action = await queryOne<{ id: string, action_type: string, risk_level: string }>(`SELECT * FROM actions WHERE id = $1`, [actionId]);
        if (!action) throw new Error('Action not found');

        // 2. Log Approval (Audit)
        // await db.auditLogs.create({ action_id, actor_id: userId, type: 'APPROVE' });

        // 3. Dispatch to Execution Layer
        try {
            // First capture baseline for measurement later
            await this.recoveryEngine.captureBaseline(storeId, action.action_type);

            const result = await this.dispatcher.dispatch(action);

            // Update status
            const newStatus = result.executed ? 'COMPLETED' : 'QUEUED';
            // await db.actions.updateSTatus(actionId, newStatus);

            return { success: true, status: newStatus };

        } catch (e) {
            console.error('Execution failed', e);
            // Revert state if possible (rollback snapshot)
            throw e;
        }
    }
}
