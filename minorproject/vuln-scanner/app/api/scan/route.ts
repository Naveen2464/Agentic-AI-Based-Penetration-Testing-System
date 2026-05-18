// app/api/scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { EventEmitter } from 'events';
import { buildScanGraph } from '@/lib/graph';
import { jobs, emitters } from '@/lib/store';
import type { ScanJob, TraceEvent } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || !URL.canParse(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const job: ScanJob = {
    id,
    targetUrl: url,
    status: 'running',
    traces: [],
    findings: [],
    plan: undefined,
    report: undefined,
  };

  jobs.set(id, job);

  const emitter = new EventEmitter();
  emitters.set(id, emitter);

  const emit = (e: Omit<TraceEvent, 'id' | 'timestamp'>) => {
    const event: TraceEvent = {
      ...e,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    job.traces.push(event);
    emitter.emit('trace', event);
  };

  // Run in background — do not await
  const graph = buildScanGraph(emit);
  graph
    .invoke({
      targetUrl: url,
      scanPlan: null,
      traces: [],
      findings: [],
      agentResults: {},
      report: null,
      status: 'running',
    })
    .then((finalState) => {
      job.findings = finalState.findings;
      job.plan     = finalState.scanPlan ?? undefined;
      job.report   = finalState.report   ?? undefined;
      job.status   = 'complete';
      emitter.emit('done', {
        findings: finalState.findings,
        plan:     finalState.scanPlan,
        report:   finalState.report,
      });
    })
    .catch((err) => {
      console.error('[Scan error]', err);
      job.status = 'complete';
      emitter.emit('done', { findings: [], plan: null, report: null });
    });

  return NextResponse.json({ id });
}
