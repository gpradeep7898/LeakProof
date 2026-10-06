import { QUEUES, createWorker } from './queue/bull';

export function setupWorkers() {
  createWorker(QUEUES.DETECTION, async (job: { data: { storeId: string } }) => {
    const { storeId } = job.data;
    const { LeakDetector } = await import('./services/leakDetector');
    const detector = new LeakDetector(storeId);
    console.log(`[JOB] Starting leak detection for store ${storeId}`);
    await detector.detectAllLeaks();
    console.log(`[JOB] Finished leak detection for store ${storeId}`);
  }, 5);

  createWorker(QUEUES.EXECUTION, async (job: { data: { action_id: string; mutation_type: string; payload: unknown } }) => {
    const { action_id, mutation_type } = job.data;
    const { execute, queryOne } = await import('./db');
    const existing = await queryOne<{ status: string }>(
      'SELECT status FROM actions WHERE action_id = $1',
      [action_id]
    );
    if (existing && ['completed', 'executed'].includes(existing.status)) {
      console.log(`[JOB] Action ${action_id} already ${existing.status} — skipping.`);
      return { skipped: true };
    }
    console.log(`[JOB] Executing async mutation ${mutation_type} for action ${action_id}`);
    try {
      const { ActionExecutor } = await import('./services/actionExecutor');
      const result = await new ActionExecutor().executeAction(action_id);
      if (!result.success) throw new Error(result.error || 'execution failed');
      console.log(`[JOB] Mutation ${mutation_type} completed for action ${action_id}.`);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await execute(
        `UPDATE actions SET status = 'failed', outcome = $2, updated_at = NOW() WHERE action_id = $1`,
        [action_id, message]
      );
      console.error(`[JOB] Mutation ${mutation_type} failed for action ${action_id}: ${message}`);
      throw err; // let BullMQ retry per job options
    }
  }, 5);

  createWorker(QUEUES.MEASUREMENT, async (job: { data: { storeId: string } }) => {
    const { RecoveryEngine } = await import('./services/RecoveryEngine');
    const engine = new RecoveryEngine();
    const baseline = await engine.captureBaseline(job.data.storeId, 'profit_metric');
    const impact = engine.measureImpact(baseline, 110, 30);
    console.log(`[JOB] Measurement complete. Recovered Profit: $${impact.profit_recovered}`);
  }, 2);

  console.log('Workers started successfully.');
}
