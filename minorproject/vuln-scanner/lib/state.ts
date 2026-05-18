// lib/state.ts
import { Annotation } from '@langchain/langgraph';
import type { TraceEvent, Finding, ScanPlan, ScanReport } from './types';

export const ScanState = Annotation.Root({
  targetUrl: Annotation<string>,

  // Set by the Orchestrator Agent — which agents to run and why
  scanPlan: Annotation<ScanPlan | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  traces: Annotation<TraceEvent[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  findings: Annotation<Finding[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  agentResults: Annotation<Record<string, Finding[]>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),

  // Set by the Report Agent — final structured report
  report: Annotation<ScanReport | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  status: Annotation<'running' | 'complete'>({
    reducer: (_a, b) => b,
    default: () => 'running',
  }),
});

export type ScanStateType = typeof ScanState.State;
