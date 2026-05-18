// app/api/scan/[id]/stream/route.ts
import { jobs, emitters } from '@/lib/store';
import type { TraceEvent } from '@/lib/types';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use await params to correctly access id in Next.js 15+
  const { id } = await params;
  const job = jobs.get(id);
  const emitter = emitters.get(id);

  if (!job || !emitter) {
    return new Response('Job not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send any events that already happened before the client connected
      for (const trace of job.traces) {
        send(trace);
      }

      // Stream new events as they arrive
      const onTrace = (event: TraceEvent) => send(event);
      const onDone = (payload: { findings: unknown; plan: unknown; report: unknown }) => {
        send({ done: true, ...payload });
        controller.close();
        emitter.off('trace', onTrace);
        emitter.off('done', onDone);
      };

      emitter.on('trace', onTrace);
      emitter.on('done', onDone);

      // If already complete, send done immediately
      if (job.status === 'complete') {
        onDone({ findings: job.findings, plan: job.plan ?? null, report: job.report ?? null });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
