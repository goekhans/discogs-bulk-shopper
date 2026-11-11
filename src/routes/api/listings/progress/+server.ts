import type { RequestHandler } from './$types';
import { getJobRegistry, type JobState } from '#lib/server/scraper/jobs.js';

export const HEARTBEAT_MS = 2000;

const encoder = new TextEncoder();
const event = (state: JobState) => encoder.encode(`data: ${JSON.stringify(state)}\n\n`);

/**
 * GET /api/listings/progress — Server-Sent Events with the job state on every progress update
 * and every 2s, until the job is done or failed. Without a running job the last state is sent
 * once and the stream closes.
 */
export const GET: RequestHandler = () => {
  const registry = getJobRegistry();

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const initial = registry.get();
      controller.enqueue(event(initial));
      if (initial.status !== 'running') {
        controller.close();
        return;
      }

      const finish = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      const send = (state: JobState) => {
        try {
          controller.enqueue(event(state));
        } catch {
          finish();
          return;
        }
        if (state.status === 'done' || state.status === 'error') finish();
      };

      const unsubscribe = registry.subscribe(send);
      const heartbeat = setInterval(() => send(registry.get()), HEARTBEAT_MS);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        cleanup = () => {};
      };
    },
    cancel() {
      // The client went away; the job keeps running and the next subscriber picks it up.
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
