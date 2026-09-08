import type {FastifyInstance} from 'fastify';
import type {NotificationSource} from './events.js';
import type {ReadinessResult} from './readiness.js';

export function registerEventStream(app: FastifyInstance, readiness: () => Promise<ReadinessResult>, source?: NotificationSource) {
  const streams = new Set<() => void>();
  let closing = false;
  app.addHook('preClose', async () => {
    closing = true;
    for (const close of [...streams]) close();
    await source?.close();
  });
  app.get('/events', async (request, reply) => {
    if (closing || streams.size >= 100) return reply.code(503).send({code: 'EVENT_STREAM_CAPACITY', message: 'The event stream is unavailable. Retry shortly.'});
    let ready = await readiness();
    if (ready.status !== 'ready' || !source) return reply.code(503).send({code: ready.status === 'ready' ? 'NOTIFICATIONS_UNAVAILABLE' : ready.code, message: 'Verified event invalidations are unavailable.'});
    if (closing || streams.size >= 100) return reply.code(503).send({code: 'EVENT_STREAM_CAPACITY', message: 'The event stream is unavailable. Retry shortly.'});
    let closed = false, started = false, lost = false;
    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let forceClose: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (closed) return;
      closed = true; unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      streams.delete(close);
      if (started && !reply.raw.destroyed) {
        reply.raw.end();
        forceClose = setTimeout(() => reply.raw.destroy(), 500);
        forceClose.unref();
      }
    };
    const write = (frame: string) => {
      if (closed || !started) return;
      // No application queue: disconnect a slow consumer as soon as Node's
      // bounded response buffer fills; its next connection must refresh state.
      if (reply.raw.writableLength > 16_384 || !reply.raw.write(frame)) { close(); reply.raw.destroy(); }
    };
    reply.raw.once('close', () => { if (forceClose) clearTimeout(forceClose); close(); });
    streams.add(close);
    try {
      unsubscribe = await source.subscribe(event => {
        if (event.chainId !== ready.chainId) return;
        write(`event: invalidate\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'resync_required') { lost = true; close(); }
      }, () => { lost = true; close(); });
      // Subscribe first, then re-read readiness. The initial refresh covers any
      // committed notifications that arrived while headers were being prepared.
      ready = await readiness();
      if (closed || lost || closing || ready.status !== 'ready' || request.raw.aborted || reply.raw.destroyed) {
        unsubscribe(); close();
        if (!reply.raw.destroyed) return reply.code(503).send({code: 'EVENT_STREAM_UNAVAILABLE', message: 'The event stream changed. Refresh shortly.'});
        return reply;
      }
      reply.hijack();
      const headers = {
        ...reply.getHeaders(), 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no',
      };
      for (const [name, value] of Object.entries(headers)) if (value !== undefined) reply.raw.setHeader(name, value);
      reply.raw.writeHead(200);
      started = true;
      write(`retry: 3000\nevent: invalidate\ndata: ${JSON.stringify({type: 'refresh', chainId: ready.chainId, block: ready.block, hash: ready.hash})}\n\n`);
      if (!closed) {
        heartbeat = setInterval(() => write(': heartbeat\n\n'), 15_000);
        heartbeat.unref();
      }
      return reply;
    } catch {
      close();
      if (!reply.raw.destroyed && !started) return reply.code(503).send({code: 'NOTIFICATIONS_UNAVAILABLE', message: 'The event stream is unavailable. Retry shortly.'});
      return reply;
    }
  });
}
