import { Queue, Worker } from 'bullmq';

// Connection options - use object to avoid ioredis version mismatch with BullMQ's bundled dep
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/1';
let connection: { host: string; port: number; maxRetriesPerRequest: number | null; db?: number };
try {
  const u = new URL(redisUrl);
  connection = {
    host: u.hostname || 'localhost',
    port: parseInt(u.port || '6379', 10),
    maxRetriesPerRequest: null,
    db: u.pathname?.length > 1 ? parseInt(u.pathname.slice(1), 10) : undefined,
  };
} catch {
  connection = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
}

export const QUEUES = {
  DETECTION: 'q-detection',
  EXECUTION: 'q-execution',
  MEASUREMENT: 'q-measurement',
  BILLING: 'q-billing',
};

const detectionQueue = new Queue(QUEUES.DETECTION, { connection });
const executionQueue = new Queue(QUEUES.EXECUTION, { connection });
const measurementQueue = new Queue(QUEUES.MEASUREMENT, { connection });
const billingQueue = new Queue(QUEUES.BILLING, { connection });

export const queues = {
    detection: detectionQueue,
    execution: executionQueue,
    measurement: measurementQueue,
    billing: billingQueue
};

// Worker setup helper (to be used in a worker process)
export function createWorker(queueName: string, processor: (job: any) => Promise<any>, concurrency: number = 5) {
    const worker = new Worker(queueName, processor, {
        connection,
        concurrency,
        limiter: {
            max: 10, // Max jobs per interval
            duration: 1000 // Per second (Shopify API friendly rate limiting)
        }
    });

    worker.on('completed', (job) => {
        console.log(`Job ${job.id} completed in ${queueName}`);
    });

    worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed in ${queueName}: ${err.message}`);
    });

    return worker;
}
