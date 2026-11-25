import { processDueDeliveries } from '../src/lib/deliveries.ts';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

while (!stopping) {
  await processDueDeliveries().catch(error => console.error('delivery_cycle_failed', error instanceof Error ? error.message : 'unknown'));
  await new Promise(resolve => setTimeout(resolve, 1000));
}
