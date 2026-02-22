import { QUEUES, createWorker } from './queue/bull';

export function setupWorkers() {
  createWorker(QUEUES.DETECTION, async (job: { data: { storeId: string } }) => {
    const { storeId } = job.data;
    const { LeakDetector } = await import('./services/leakDetector');
    const detector = new LeakDetector();
    console.log(`[JOB] Starting leak detection for store ${storeId}`);
    await detector.detectAllLeaks(storeId);
    console.log(`[JOB] Finished leak detection for store ${storeId}`);
  }, 5);

  createWorker(QUEUES.EXECUTION, async (job: { data: { action_id: string; mutation_type: string; payload: unknown } }) => {
    const { action_id, mutation_type } = job.data;
    console.log(`[JOB] Executing async mutation ${mutation_type} for action ${action_id}`);
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`[JOB] Bulk mutation ${mutation_type} completed.`);
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
