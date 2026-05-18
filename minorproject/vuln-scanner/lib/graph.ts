// lib/graph.ts
import { StateGraph } from '@langchain/langgraph';
import { ScanState, ScanStateType } from './state';
import { runOrchestratorAgent } from './agents/orchestrator-agent';
import { runXssAgent }      from './agents/xss-agent';
import { runSqliAgent }     from './agents/sqli-agent';
import { runCsrfAgent }     from './agents/csrf-agent';
import { runIdorAgent }     from './agents/idor-agent';
import { runHeaderAgent }   from './agents/header-agent';
import { runRedirectAgent } from './agents/redirect-agent';
import { runReportAgent }   from './agents/report-agent';
import type { EmitFn, Finding } from './types';

// ─── Aggregator node (pure function — no LLM) ───────────────────────────────
function aggregatorNode(state: ScanStateType): Partial<ScanStateType> {
  const allFindings: Finding[] = Object.values(state.agentResults).flat();

  // Deduplicate by vulnType + location
  const seen = new Set<string>();
  const deduped = allFindings.filter(f => {
    const key = `${f.vulnType}:${f.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity: critical → high → medium → low → info
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  deduped.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));

  return { findings: deduped };
}

// ─── Conditional routing: skip agents not in the scan plan ──────────────────
function routeToAgents(state: ScanStateType): string[] {
  const plan = state.scanPlan;
  if (!plan || !plan.agentsToRun || plan.agentsToRun.length === 0) {
    return ['aggregator'];
  }
  return plan.agentsToRun;
}

// ─── Build and compile the graph ────────────────────────────────────────────
export function buildScanGraph(emit: EmitFn) {
  const graph = new StateGraph(ScanState)
    // Nodes
    .addNode('orchestrator', (s) => runOrchestratorAgent(s, emit))
    .addNode('xss',          (s) => runXssAgent(s, emit))
    .addNode('sqli',         (s) => runSqliAgent(s, emit))
    .addNode('csrf',         (s) => runCsrfAgent(s, emit))
    .addNode('idor',         (s) => runIdorAgent(s, emit))
    .addNode('headers',      (s) => runHeaderAgent(s, emit))
    .addNode('redirect',     (s) => runRedirectAgent(s, emit))
    .addNode('aggregator',   aggregatorNode)
    .addNode('reporter',       (s) => runReportAgent(s, emit))

    // Entry → Orchestrator
    .addEdge('__start__', 'orchestrator')

    // Orchestrator → conditional fan-out (skip agents not in plan)
    .addConditionalEdges('orchestrator', routeToAgents, {
      xss: 'xss',
      sqli: 'sqli',
      csrf: 'csrf',
      idor: 'idor',
      headers: 'headers',
      redirect: 'redirect',
      aggregator: 'aggregator'
    })

    // All agent nodes → Aggregator (fan-in)
    .addEdge('xss',      'aggregator')
    .addEdge('sqli',     'aggregator')
    .addEdge('csrf',     'aggregator')
    .addEdge('idor',     'aggregator')
    .addEdge('headers',  'aggregator')
    .addEdge('redirect', 'aggregator')

    // Aggregator → Reporter → END
    .addEdge('aggregator', 'reporter')
    .addEdge('reporter', '__end__');

  return graph.compile();
}
