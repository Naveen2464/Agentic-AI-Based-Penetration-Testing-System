# Agentic Web Vulnerability Scanner

> Next.js + LangChain + LangGraph · College Project Reference

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Shared Types](#shared-types)
5. [Shared State (LangGraph)](#shared-state-langgraph)
6. [The 4 LangChain Tools](#the-4-langchain-tools)
7. [Orchestrator Agent](#orchestrator-agent)
8. [Agent 1 — XSS Agent](#agent-1--xss-agent)
9. [Agent 2 — SQLi Agent](#agent-2--sqli-agent)
10. [Agent 3 — CSRF Agent](#agent-3--csrf-agent)
11. [Agent 4 — IDOR Agent](#agent-4--idor-agent)
12. [Agent 5 — Security Headers Agent](#agent-5--security-headers-agent)
13. [Agent 6 — Open Redirect Agent](#agent-6--open-redirect-agent)
14. [Report Agent](#report-agent)
15. [LangGraph Graph Wiring](#langgraph-graph-wiring)
16. [API Routes (Next.js)](#api-routes-nextjs)
17. [Frontend Traceability UI](#frontend-traceability-ui)
18. [Package Installation](#package-installation)
19. [Target Applications for Testing](#target-applications-for-testing)

---

## System Overview

A multi-agent pipeline that autonomously scans a target web URL for 6 common vulnerabilities. Each vulnerability has a dedicated specialist agent that runs a LangChain ReAct loop, uses tool functions to interact with the target, and emits structured trace events in real time. A LangGraph `StateGraph` orchestrates parallel execution and aggregates findings.

### The 6 Target Vulnerabilities

| # | Vulnerability | Agent | Detection Signal |
|---|---|---|---|
| 1 | Reflected XSS | `XssAgent` | Payload reflected unescaped in response body |
| 2 | SQL Injection | `SqliAgent` | DB error strings in response |
| 3 | CSRF | `CsrfAgent` | POST forms missing csrf token input |
| 4 | IDOR | `IdorAgent` | Adjacent IDs return 200 with data |
| 5 | Missing Security Headers | `HeaderAgent` | CSP / HSTS / X-Frame-Options absent |
| 6 | Open Redirect | `RedirectAgent` | Redirect chain ends on external domain |

### LangGraph Topology

```
START
  └── Orchestrator Agent          ← LLM-powered: analyses URL, builds scan plan, decides which agents to run
        ├── XSS agent node        → [fetchHtml, injectPayload]
        ├── SQLi agent node       → [injectPayload, fetchHtml]
        ├── CSRF agent node       → [fetchHtml, checkHeaders]
        ├── IDOR agent node       → [injectPayload, fetchHtml]
        ├── Header agent node     → [checkHeaders, fetchHtml]
        └── Redirect agent node   → [followRedirect, injectPayload]
              └── (all fan-in) → Aggregator node
                                      └── Report Agent  ← LLM-powered: produces structured markdown report
                                                └── END
```

The **Orchestrator Agent** is LLM-driven — it reasons about the target URL before dispatching agents. The **Report Agent** is also LLM-driven — it receives all deduplicated findings and produces a structured human-readable report with an executive summary, risk scoring, and per-finding remediation steps. All 6 specialist agent nodes run in parallel between them.

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Agent framework:** LangGraph (`@langchain/langgraph`)
- **LLM tooling:** LangChain (`@langchain/core`, `@langchain/anthropic`)
- **LLM:** Claude Sonnet (`claude-sonnet-4-20250514`)
- **Schema validation:** Zod
- **Real-time UI:** Server-Sent Events (SSE)
- **Language:** TypeScript

---

## Project Structure

```
/app
  /api
    /scan
      route.ts                    ← POST: creates scan job, starts graph
    /scan/[id]/stream
      route.ts                    ← GET: SSE stream of trace events
  page.tsx                        ← Frontend UI

/lib
  types.ts                        ← TraceEvent, Finding, ScanReport, ScanJob
  state.ts                        ← LangGraph StateGraph definition

  /tools
    index.ts                      ← All 4 DynamicStructuredTool exports

  /agents
    orchestrator-agent.ts         ← LLM supervisor: analyses URL, builds scan plan
    xss-agent.ts
    sqli-agent.ts
    csrf-agent.ts
    idor-agent.ts
    header-agent.ts
    redirect-agent.ts
    report-agent.ts               ← LLM reporter: synthesises findings into a structured report
    utils.ts                      ← parseFindings() helper

  graph.ts                        ← buildScanGraph() — wires all nodes/edges
```

---

## Shared Types

```typescript
// lib/types.ts

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface TraceEvent {
  id: string;
  agentName: string;
  action: string;       // e.g. "Injecting XSS payload into /search?q="
  reasoning: string;    // e.g. "Input field reflects value without encoding"
  timestamp: number;
  status: 'running' | 'done' | 'error';
}

export interface Finding {
  vulnType: string;
  severity: Severity;
  location: string;
  evidence: string;
  recommendation: string;
}

// Produced by the Orchestrator Agent before scanning begins
export interface ScanPlan {
  targetSummary: string;        // e.g. "PHP login app with visible form inputs"
  agentsToRun: string[];        // e.g. ["xss", "sqli", "csrf"]
  reasoning: string;            // why those agents were selected
  riskContext: string;          // any notable observations about the target
}

// Produced by the Report Agent after all findings are collected
export interface ScanReport {
  executiveSummary: string;
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  totalFindings: number;
  findingsBySeverity: Record<Severity, number>;
  sections: ReportSection[];
  generatedAt: string;          // ISO timestamp
}

export interface ReportSection {
  vulnType: string;
  severity: Severity;
  description: string;
  findings: Finding[];
  remediationSteps: string[];
  references: string[];
}

export interface ScanJob {
  id: string;
  targetUrl: string;
  status: 'pending' | 'running' | 'complete';
  traces: TraceEvent[];
  findings: Finding[];
  plan?: ScanPlan;
  report?: ScanReport;
}

export type EmitFn = (e: Omit<TraceEvent, 'id' | 'timestamp'>) => void;
```

---

## Shared State (LangGraph)

Every node reads and writes this. The `reducer` on `traces` and `findings` appends rather than replaces, so parallel agents don't clobber each other.

```typescript
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
```

---

## The 4 LangChain Tools

All tools are `DynamicStructuredTool` instances with Zod schemas. They are the only mechanism agents use to interact with the outside world — no direct `fetch` calls inside agent logic.

```typescript
// lib/tools/index.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// ─── Tool 1: fetchHtml ──────────────────────────────────────────────────────
// Used by: XSS, SQLi, CSRF, IDOR, Header agents
// Purpose: Retrieve the full HTML of a page for DOM analysis

export const fetchHtmlTool = new DynamicStructuredTool({
  name: 'fetchHtml',
  description:
    'Fetch the raw HTML of a URL. Use to inspect DOM structure, forms, ' +
    'scripts, input fields, and meta tags. Returns status code and body.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'VulnScanner/1.0' },
    });
    const body = await res.text();
    return JSON.stringify({
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: body.slice(0, 8000), // truncate to save tokens
    });
  },
});

// ─── Tool 2: injectPayload ──────────────────────────────────────────────────
// Used by: XSS, SQLi, IDOR, Redirect agents
// Purpose: Submit a request with injected test values via GET or POST

export const injectPayloadTool = new DynamicStructuredTool({
  name: 'injectPayload',
  description:
    'Submit a GET or POST request with injected test parameters. ' +
    'Use for XSS payload injection, SQL injection, IDOR ID enumeration, ' +
    'and open redirect parameter testing. Returns status, location header, and response body.',
  schema: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST']),
    params: z.record(z.string()).describe('Key-value pairs to inject as params or body fields'),
  }),
  func: async ({ url, method, params }) => {
    let res: Response;

    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      res = await fetch(`${url}?${qs}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'VulnScanner/1.0' },
      });
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VulnScanner/1.0',
        },
        body: new URLSearchParams(params).toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
    }

    const body = await res.text().catch(() => '');
    return JSON.stringify({
      status: res.status,
      location: res.headers.get('location'),
      body: body.slice(0, 4000),
    });
  },
});

// ─── Tool 3: checkHeaders ───────────────────────────────────────────────────
// Used by: Header agent (primary), CSRF agent (secondary)
// Purpose: Inspect HTTP response headers without downloading the full body

export const checkHeadersTool = new DynamicStructuredTool({
  name: 'checkHeaders',
  description:
    'Fetch only the HTTP response headers from a URL using a HEAD request. ' +
    'Use to check for security headers: Content-Security-Policy, ' +
    'Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, ' +
    'Referrer-Policy, Permissions-Policy. Also returns Set-Cookie attributes.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'VulnScanner/1.0' },
    });
    return JSON.stringify(Object.fromEntries(res.headers.entries()));
  },
});

// ─── Tool 4: followRedirect ─────────────────────────────────────────────────
// Used by: Redirect agent (primary)
// Purpose: Trace the full redirect chain to detect open redirect destinations

export const followRedirectTool = new DynamicStructuredTool({
  name: 'followRedirect',
  description:
    'Follow a URL and return the complete redirect chain (up to 5 hops). ' +
    'Use to detect open redirects — if the final destination is on a different ' +
    'domain than the original, it is potentially an open redirect vulnerability.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const chain: string[] = [url];
    let current = url;

    for (let i = 0; i < 5; i++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'VulnScanner/1.0' },
      });
      const loc = res.headers.get('location');
      if (!loc) break;
      chain.push(loc);
      current = loc.startsWith('http') ? loc : new URL(loc, current).href;
    }

    const originalHost = new URL(url).hostname;
    const finalHost = new URL(current).hostname;

    return JSON.stringify({
      chain,
      final: current,
      crossOrigin: originalHost !== finalHost,
      originalHost,
      finalHost,
    });
  },
});
```

---

## Orchestrator Agent

The orchestrator is a **real LLM-powered agent**, not just a passthrough node. It receives the target URL, uses `fetchHtml` to inspect the target before any scanning begins, reasons about what kind of application it is, and produces a `ScanPlan` that documents which specialist agents to run and why. This plan is stored in state and streamed to the frontend so the user can see the scanner's intent before execution begins.

**Responsibilities:**
- Fetch the target page to understand its structure (forms, tech stack clues, URL patterns)
- Decide which of the 6 specialist agents are most relevant
- Produce a `ScanPlan` with explicit reasoning for each decision
- Emit trace events so the user sees its reasoning in real time

**Tools:** `fetchHtml`

```typescript
// lib/agents/orchestrator-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { fetchHtmlTool } from '../tools';
import type { ScanStateType, ScanPlan, EmitFn } from '../types';

const SYSTEM_PROMPT = `You are the orchestrator of a web vulnerability scanning system.
You are given a target URL. Your job is to:

1. Use fetchHtml to retrieve the page and analyse its structure:
   - What kind of application is this? (login form, e-commerce, blog, API, etc.)
   - What input fields, forms, and URL parameters are visible?
   - Are there any obvious clues about the tech stack (PHP, Django, Rails, Node.js)?
   - Does the URL contain numeric IDs that suggest IDOR risk?
   - Does the URL have redirect-style parameters?

2. Based on your analysis, decide which of these 6 specialist agents to run:
   - xss: run if there are input fields or URL query parameters that reflect content
   - sqli: run if there are input fields, login forms, or search boxes
   - csrf: run if there are POST forms visible (login, signup, settings)
   - idor: run if there are numeric IDs in the URL path or query params
   - headers: always run — security headers should be checked on every target
   - redirect: run if there are redirect/url/next parameters in the URL or forms

3. Return a JSON object (no markdown fences):
{
  "targetSummary": "<1-2 sentence description of what the target appears to be>",
  "agentsToRun": ["xss", "sqli", "csrf", "idor", "headers", "redirect"],
  "reasoning": "<explain why each included agent is relevant for this specific target>",
  "riskContext": "<any notable observations: e.g. login form visible, numeric IDs in path, no HTTPS>"
}

Always include "headers" in agentsToRun. Be explicit and specific in your reasoning.`;

export async function runOrchestratorAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'Orchestrator',
    action: `Analysing target: ${state.targetUrl}`,
    reasoning: 'Fetching the target page to understand its structure before deciding which agents to run',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  // Step 1: fetch the page
  let pageSnapshot = '';
  try {
    pageSnapshot = await fetchHtmlTool.invoke({ url: state.targetUrl });
  } catch (err) {
    emit({
      agentName: 'Orchestrator',
      action: 'Failed to fetch target page',
      reasoning: `Error: ${String(err)}. Will proceed with all agents as a fallback.`,
      status: 'error',
    });
    // Fallback: run all agents
    const fallbackPlan: ScanPlan = {
      targetSummary: 'Could not fetch target — proceeding with full scan.',
      agentsToRun: ['xss', 'sqli', 'csrf', 'idor', 'headers', 'redirect'],
      reasoning: 'Target was unreachable during planning. Running all agents as a precaution.',
      riskContext: 'Unknown — fetch failed.',
    };
    emit({ agentName: 'Orchestrator', action: 'Falling back to full scan', reasoning: 'All 6 agents will run', status: 'done' });
    return { scanPlan: fallbackPlan };
  }

  emit({
    agentName: 'Orchestrator',
    action: 'Page fetched — analysing structure',
    reasoning: 'Inspecting forms, input fields, URL parameters, and tech stack clues',
    status: 'running',
  });

  // Step 2: ask the LLM to reason about the page and produce a plan
  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Target URL: ${state.targetUrl}\n\nPage snapshot:\n${pageSnapshot.slice(0, 6000)}`
    ),
  ]);

  const raw = String(response.content);

  let plan: ScanPlan;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found');
    plan = JSON.parse(match[0]) as ScanPlan;
  } catch {
    // Fallback if parsing fails
    plan = {
      targetSummary: 'Could not parse orchestrator output — running full scan.',
      agentsToRun: ['xss', 'sqli', 'csrf', 'idor', 'headers', 'redirect'],
      reasoning: raw.slice(0, 500),
      riskContext: 'Unknown.',
    };
  }

  emit({
    agentName: 'Orchestrator',
    action: `Scan plan ready — running ${plan.agentsToRun.length} agents`,
    reasoning: `${plan.targetSummary} | Agents selected: ${plan.agentsToRun.join(', ')} | ${plan.reasoning.slice(0, 200)}`,
    status: 'done',
  });

  return { scanPlan: plan };
}
```

The `scanPlan.agentsToRun` array is then used in the graph's conditional edges to skip irrelevant agents, avoiding wasted LLM calls on targets where an agent clearly doesn't apply.

---

## Agent 1 — XSS Agent

**Vulnerability:** Reflected XSS — user input echoed into the HTML response without encoding.

**Detection logic:**
1. Fetch the page and extract all `<input name="...">` field names and URL query params
2. For each param, inject 3 payloads via `injectPayload`
3. Check if the raw payload string appears literally in the response body (unescaped reflection)

**Tools:** `fetchHtml`, `injectPayload`

```typescript
// lib/agents/xss-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(1)",
];

const SYSTEM_PROMPT = `You are a Reflected XSS vulnerability scanner agent.

Your task:
1. Use fetchHtml to retrieve the target page HTML.
2. Identify all <input> name attributes and URL query parameters present in the page.
3. For each parameter found, use injectPayload (GET and POST) with each of these payloads:
   ${XSS_PAYLOADS.map(p => `- ${p}`).join('\n   ')}
4. Check if any payload appears literally (unescaped) in the response body.
5. If a payload is reflected, that parameter is vulnerable.

At every step, explain your reasoning clearly before calling a tool.

Return your final answer as a JSON array:
[{
  "vulnType": "Reflected XSS",
  "severity": "high",
  "location": "<url> → param: <name>",
  "evidence": "Payload '<payload>' found in response body",
  "recommendation": "HTML-encode all user-controlled output. Implement a Content-Security-Policy header."
}]
Return [] if no vulnerabilities found.`;

export function createXssAgent() {
  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  return createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, injectPayloadTool],
    messageModifier: SYSTEM_PROMPT,
  });
}

export async function runXssAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'XSS Agent',
    action: `Starting XSS scan on ${state.targetUrl}`,
    reasoning: 'Will fetch page HTML, identify input fields, then inject payloads to test for unescaped reflection',
    status: 'running',
  });

  const agent = createXssAgent();
  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Scan this URL for Reflected XSS vulnerabilities: ${state.targetUrl}` }],
  });

  // Emit intermediate reasoning steps
  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({
        agentName: 'XSS Agent',
        action: 'Reasoning',
        reasoning: msg.content.slice(0, 300),
        status: 'running',
      });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'XSS Agent');

  emit({
    agentName: 'XSS Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length
      ? `Vulnerable parameters: ${findings.map(f => f.location).join(', ')}`
      : 'No reflected XSS detected',
    status: 'done',
  });

  return { agentResults: { xss: findings } };
}
```

---

## Agent 2 — SQLi Agent

**Vulnerability:** SQL Injection — user input interpreted as SQL by the backend database.

**Detection signals:** `SQL syntax`, `mysql_fetch_array`, `ORA-01756`, `pg_query`, `sqlite3`, `Unclosed quotation mark`, `You have an error in your SQL syntax`.

**Strategy:** Baseline the normal response first, then inject. Compare response length and check for error strings.

**Tools:** `injectPayload`, `fetchHtml`

```typescript
// lib/agents/sqli-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1--",
  "1; DROP TABLE users--",
  "' UNION SELECT null,null--",
  "admin'--",
  "' AND SLEEP(2)--",
];

const DB_ERROR_SIGNALS = [
  'SQL syntax',
  'mysql_fetch',
  'ORA-0',
  'pg_query',
  'sqlite3',
  'Unclosed quotation',
  'syntax error',
  'SQLSTATE',
  'Microsoft OLE DB',
  'ODBC SQL Server',
];

const SYSTEM_PROMPT = `You are a SQL Injection vulnerability scanner agent.

Your task:
1. Use fetchHtml to get the target page and record the baseline response length and content.
2. Identify all input fields and URL query parameters.
3. For each parameter, use injectPayload with these SQL injection payloads:
   ${SQLI_PAYLOADS.map(p => `- ${p}`).join('\n   ')}
4. After each injection, look for these database error signals in the response body:
   ${DB_ERROR_SIGNALS.join(', ')}
5. Also check if the response body changed significantly in length (possible data leak via UNION-based injection).

Explain your reasoning at every step before calling a tool.

Return a JSON array of findings:
[{
  "vulnType": "SQL Injection",
  "severity": "critical",
  "location": "<url> → param: <name>",
  "evidence": "DB error: <error string found>",
  "recommendation": "Use parameterized queries or prepared statements. Never concatenate user input into SQL strings."
}]
Return [] if no vulnerabilities found.`;

export async function runSqliAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'SQLi Agent',
    action: `Starting SQL injection scan on ${state.targetUrl}`,
    reasoning: 'Will baseline the response, then inject payloads and watch for database error messages',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, injectPayloadTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Scan for SQL injection vulnerabilities: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({ agentName: 'SQLi Agent', action: 'Reasoning', reasoning: msg.content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'SQLi Agent');

  emit({
    agentName: 'SQLi Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? `Vulnerable params: ${findings.map(f => f.location).join(', ')}` : 'No SQL injection detected',
    status: 'done',
  });

  return { agentResults: { sqli: findings } };
}
```

---

## Agent 3 — CSRF Agent

**Vulnerability:** Missing CSRF tokens on state-changing POST forms.

**Strategy:** Purely structural analysis — no payload injection. Fetches pages, parses all `<form>` elements, and checks for absence of CSRF token inputs. Also checks `Set-Cookie` headers for `SameSite` attribute as a mitigating factor.

**Tools:** `fetchHtml`, `checkHeaders`

```typescript
// lib/agents/csrf-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, checkHeadersTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const CSRF_TOKEN_NAMES = [
  'csrf', '_csrf', 'csrf_token', '_token',
  'authenticity_token', 'nonce', '__RequestVerificationToken',
];

const SYSTEM_PROMPT = `You are a CSRF vulnerability scanner agent.

Your task:
1. Use fetchHtml to retrieve the target page HTML.
2. Find all <form> elements in the HTML.
3. For each form with method="POST" (or no method specified, which defaults to GET — skip those):
   - Check whether any <input> has a name attribute containing: ${CSRF_TOKEN_NAMES.join(', ')}
   - If none found, the form is potentially CSRF-vulnerable
4. Also use checkHeaders to inspect Set-Cookie headers:
   - If cookies lack SameSite=Strict or SameSite=Lax, the CSRF risk is higher — note this in the finding.
5. Do NOT flag GET forms — they should not modify server state.

Explain your reasoning before each tool call.

Return a JSON array:
[{
  "vulnType": "CSRF",
  "severity": "high",
  "location": "<url> → <form action>",
  "evidence": "POST form at <action> has no CSRF token input. Cookies missing SameSite attribute.",
  "recommendation": "Add a per-session CSRF token to all state-changing forms. Set SameSite=Lax or Strict on session cookies."
}]
Return [] if no vulnerabilities found.`;

export async function runCsrfAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'CSRF Agent',
    action: `Scanning ${state.targetUrl} for missing CSRF tokens`,
    reasoning: 'Will parse all POST forms and check for absence of CSRF token inputs and SameSite cookie attributes',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, checkHeadersTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Scan for CSRF vulnerabilities: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({ agentName: 'CSRF Agent', action: 'Reasoning', reasoning: msg.content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'CSRF Agent');

  emit({
    agentName: 'CSRF Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Unprotected POST forms found' : 'All POST forms have CSRF protection',
    status: 'done',
  });

  return { agentResults: { csrf: findings } };
}
```

---

## Agent 4 — IDOR Agent

**Vulnerability:** Insecure Direct Object Reference — accessing other users' resources by guessing or incrementing IDs.

**ID patterns detected:**

```
/user/42          → path segment
?id=42            → query param
?user_id=42       → named param
?order_id=42      → named param
```

**Strategy:** Detect numeric IDs in the URL, then enumerate adjacent values (±1, ±2, and low values like 1, 2, 3). A 200 response with non-empty data body signals missing authorization checks.

**Tools:** `fetchHtml`, `injectPayload`

```typescript
// lib/agents/idor-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const SYSTEM_PROMPT = `You are an IDOR (Insecure Direct Object Reference) vulnerability scanner agent.

Your task:
1. Use fetchHtml to retrieve the target page and identify numeric IDs in:
   - URL path segments (e.g. /user/42)
   - Query parameters (e.g. ?id=42, ?user_id=5, ?order_id=100)
2. For each numeric ID found, use injectPayload (GET method) to request adjacent values:
   - originalId - 1, originalId - 2
   - originalId + 1, originalId + 2
   - Low values: 1, 2, 3
3. A finding is confirmed if:
   - The response returns HTTP 200
   - The response body contains meaningful data (not a login redirect or error page)
   - The data appears to belong to a different resource/user

This is heuristic — flag it as potential IDOR if steps above are met.

Explain your reasoning before each step.

Return a JSON array:
[{
  "vulnType": "IDOR",
  "severity": "high",
  "location": "<url> → param: <id param name>",
  "evidence": "ID <original> accessible; ID <tested> also returned HTTP 200 with data",
  "recommendation": "Implement server-side authorization checks. Verify the requesting user owns the resource before returning it."
}]
Return [] if no vulnerabilities found.`;

export async function runIdorAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'IDOR Agent',
    action: `Scanning ${state.targetUrl} for insecure direct object references`,
    reasoning: 'Will detect numeric IDs in URL and enumerate adjacent values to check for missing authorization',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, injectPayloadTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Scan for IDOR vulnerabilities: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({ agentName: 'IDOR Agent', action: 'Reasoning', reasoning: msg.content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'IDOR Agent');

  emit({
    agentName: 'IDOR Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Access control issues found' : 'No IDOR detected',
    status: 'done',
  });

  return { agentResults: { idor: findings } };
}
```

---

## Agent 5 — Security Headers Agent

**Vulnerability:** Missing HTTP security headers.

**Headers checked:**

| Header | Prevents | Severity if missing |
|---|---|---|
| `content-security-policy` | XSS, injection | medium |
| `x-frame-options` | Clickjacking | medium |
| `strict-transport-security` | SSL stripping / MITM | high |
| `x-content-type-options` | MIME sniffing | low |
| `referrer-policy` | Referrer leakage | low |
| `permissions-policy` | Feature abuse | info |

**Tools:** `checkHeaders`, `fetchHtml`

```typescript
// lib/agents/header-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, checkHeadersTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const REQUIRED_HEADERS = {
  'content-security-policy': {
    severity: 'medium',
    prevents: 'XSS and injection attacks',
    fix: "Content-Security-Policy: default-src 'self'",
  },
  'x-frame-options': {
    severity: 'medium',
    prevents: 'Clickjacking',
    fix: 'X-Frame-Options: DENY',
  },
  'strict-transport-security': {
    severity: 'high',
    prevents: 'SSL stripping and protocol downgrade attacks',
    fix: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  },
  'x-content-type-options': {
    severity: 'low',
    prevents: 'MIME type sniffing',
    fix: 'X-Content-Type-Options: nosniff',
  },
  'referrer-policy': {
    severity: 'low',
    prevents: 'Sensitive URL leakage in Referer header',
    fix: 'Referrer-Policy: strict-origin-when-cross-origin',
  },
  'permissions-policy': {
    severity: 'info',
    prevents: 'Unauthorized browser feature access',
    fix: 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  },
};

const SYSTEM_PROMPT = `You are a Security Headers scanner agent.

Your task:
1. Use checkHeaders to fetch the HTTP response headers from the target URL.
2. Check for the presence of these security headers:
   ${Object.entries(REQUIRED_HEADERS).map(([h, v]) => `- ${h}: prevents ${v.prevents}`).join('\n   ')}
3. Each missing header is a SEPARATE finding.
4. For x-content-type-options, also verify the value is "nosniff" (not just present).
5. For strict-transport-security, only flag if the site uses HTTPS.
6. Use fetchHtml if you need to confirm the site uses HTTPS.

Return a JSON array — one entry per missing header:
[{
  "vulnType": "Missing Security Header",
  "severity": "<see table above>",
  "location": "<url> → HTTP headers",
  "evidence": "Header '<header-name>' is absent from the response",
  "recommendation": "Add the following header to all responses: <exact header value>"
}]
Return [] if all headers are present.`;

export async function runHeaderAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'Header Agent',
    action: `Checking security headers on ${state.targetUrl}`,
    reasoning: 'Will inspect HTTP response headers for CSP, HSTS, X-Frame-Options, and other security directives',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  const agent = createReactAgent({
    llm: model,
    tools: [checkHeadersTool, fetchHtmlTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Check security headers for: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({ agentName: 'Header Agent', action: 'Reasoning', reasoning: msg.content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'Header Agent');

  emit({
    agentName: 'Header Agent',
    action: `Scan complete — ${findings.length} missing header(s)`,
    reasoning: findings.length
      ? `Missing: ${findings.map(f => f.evidence.split("'")[1]).join(', ')}`
      : 'All security headers present',
    status: 'done',
  });

  return { agentResults: { headers: findings } };
}
```

---

## Agent 6 — Open Redirect Agent

**Vulnerability:** Unvalidated redirects — server blindly forwards user to attacker-controlled URL.

**Redirect parameters probed:** `redirect`, `url`, `next`, `return`, `goto`, `destination`, `continue`, `redir`

**Payloads used:** `https://evil.com`, `//evil.com`, `\evil.com`

**Tools:** `injectPayload`, `followRedirect`

```typescript
// lib/agents/redirect-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { injectPayloadTool, followRedirectTool } from '../tools';
import type { ScanStateType, EmitFn } from '../types';
import { parseFindings } from './utils';

const REDIRECT_PARAMS = [
  'redirect', 'url', 'next', 'return',
  'goto', 'destination', 'continue', 'redir', 'return_url',
];

const EVIL_PAYLOADS = [
  'https://evil.com',
  '//evil.com',
  '\\evil.com',
  'https://evil.com%2F@legitimate.com',
];

const SYSTEM_PROMPT = `You are an Open Redirect vulnerability scanner agent.

Your task:
1. Check if the target URL already contains redirect-style parameters: ${REDIRECT_PARAMS.join(', ')}
2. If not found in the URL, use injectPayload (GET method) to try each of these parameter names with the value "https://evil.com".
3. For any parameter that results in a 301/302/303/307/308 response, use followRedirect to trace the full redirect chain.
4. If the final destination is on a different domain than the original target, it is an open redirect.
5. Also test protocol-relative payloads: //evil.com and encoded variants.

Explain your reasoning before each tool call.

Return a JSON array:
[{
  "vulnType": "Open Redirect",
  "severity": "high",
  "location": "<url> → param: <name>",
  "evidence": "Redirect chain: [<original>] → [<evil.com>]",
  "recommendation": "Validate redirect destinations against an allowlist of trusted domains. Never accept arbitrary URLs as redirect targets."
}]
Return [] if no vulnerabilities found.`;

export async function runRedirectAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  emit({
    agentName: 'Redirect Agent',
    action: `Scanning ${state.targetUrl} for open redirect vulnerabilities`,
    reasoning: 'Will inject external URLs into common redirect parameters and trace the resulting redirect chain',
    status: 'running',
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  const agent = createReactAgent({
    llm: model,
    tools: [injectPayloadTool, followRedirectTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Scan for open redirect vulnerabilities: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    if (msg._getType() === 'ai' && typeof msg.content === 'string' && msg.content.length > 10) {
      emit({ agentName: 'Redirect Agent', action: 'Reasoning', reasoning: msg.content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = String(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'Redirect Agent');

  emit({
    agentName: 'Redirect Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Unvalidated redirect destination found' : 'No open redirect detected',
    status: 'done',
  });

  return { agentResults: { redirect: findings } };
}
```

---

## Utility: parseFindings

All agents use this helper to safely parse the LLM's JSON output.

```typescript
// lib/agents/utils.ts
import type { Finding } from '../types';

export function parseFindings(raw: string, agentName: string): Finding[] {
  try {
    // Strip markdown code fences if present
    const clean = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Extract JSON array from the string
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (f): f is Finding =>
        typeof f.vulnType === 'string' &&
        typeof f.severity === 'string' &&
        typeof f.location === 'string'
    );
  } catch {
    console.error(`[${agentName}] Failed to parse findings from:`, raw.slice(0, 200));
    return [];
  }
}
```

---

## Report Agent

The report agent is the final node in the graph. It receives the fully deduplicated and sorted `findings` array from the aggregator and uses an LLM call to produce a structured `ScanReport`. This is what gets rendered in the frontend's report panel and can be exported as markdown or JSON.

**Responsibilities:**
- Write an executive summary of the scan results in plain language
- Assign an overall risk level based on the highest-severity finding
- Group findings by vulnerability type into sections
- For each section, write a human-readable description and step-by-step remediation instructions
- Add relevant CVE/OWASP references per vulnerability type

**No tools** — the report agent only processes data already in state. It does not make any HTTP requests.

```typescript
// lib/agents/report-agent.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ScanStateType, ScanReport, ReportSection, Finding, Severity, EmitFn } from '../types';

const OWASP_REFS: Record<string, string[]> = {
  'Reflected XSS':          ['OWASP A03:2021 Injection', 'CWE-79', 'https://owasp.org/Top10/A03_2021-Injection/'],
  'SQL Injection':           ['OWASP A03:2021 Injection', 'CWE-89', 'https://owasp.org/Top10/A03_2021-Injection/'],
  'CSRF':                    ['OWASP A01:2021 Broken Access Control', 'CWE-352', 'https://owasp.org/www-community/attacks/csrf'],
  'IDOR':                    ['OWASP A01:2021 Broken Access Control', 'CWE-639', 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/'],
  'Missing Security Header': ['OWASP A05:2021 Security Misconfiguration', 'CWE-693', 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/'],
  'Open Redirect':           ['OWASP A01:2021 Broken Access Control', 'CWE-601', 'https://owasp.org/www-community/attacks/Unvalidated_Redirects_and_Forwards_Cheat_Sheet'],
};

const SYSTEM_PROMPT = `You are a security report writer. You will receive a list of vulnerability findings from an automated web scanner.

Your job is to produce a structured security report as a JSON object. Be clear, professional, and developer-focused.

Return ONLY a JSON object in this exact shape (no markdown fences):
{
  "executiveSummary": "<2-4 sentence plain-language summary of what was found and the overall risk>",
  "overallRiskLevel": "<critical|high|medium|low|informational>",
  "sections": [
    {
      "vulnType": "<vulnerability type>",
      "severity": "<critical|high|medium|low|info>",
      "description": "<2-3 sentence explanation of why this vulnerability is dangerous>",
      "remediationSteps": [
        "<step 1>",
        "<step 2>",
        "<step 3>"
      ]
    }
  ]
}

Rules:
- overallRiskLevel = the highest severity among all findings
- One section per unique vulnType — do not repeat vulnTypes
- remediationSteps should be concrete, actionable developer instructions (not generic advice)
- description should explain the real-world impact, not just define the term
- Keep executiveSummary non-technical enough for a project supervisor to understand`;

export async function runReportAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  const findings = state.findings;

  emit({
    agentName: 'Report Agent',
    action: `Generating report for ${findings.length} finding(s)`,
    reasoning: 'Synthesising all scan results into an executive summary with per-vulnerability remediation guidance',
    status: 'running',
  });

  if (findings.length === 0) {
    const emptyReport: ScanReport = {
      executiveSummary: 'No vulnerabilities were detected during the scan. The target application passed all checks run by the scanner. This does not guarantee the application is fully secure — manual review is always recommended.',
      overallRiskLevel: 'informational',
      totalFindings: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      sections: [],
      generatedAt: new Date().toISOString(),
    };
    emit({ agentName: 'Report Agent', action: 'Report complete — no findings', reasoning: 'Clean scan result', status: 'done' });
    return { report: emptyReport, status: 'complete' };
  }

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  const findingsText = findings
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.vulnType}\n   Location: ${f.location}\n   Evidence: ${f.evidence}\n   Recommendation: ${f.recommendation}`)
    .join('\n\n');

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Target: ${state.targetUrl}\n\nFindings:\n${findingsText}`
    ),
  ]);

  const raw = String(response.content);

  // Count findings by severity
  const findingsBySeverity: Record<Severity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  };
  for (const f of findings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
  }

  // Group findings by vulnType for embedding into sections
  const findingsByType = findings.reduce<Record<string, Finding[]>>((acc, f) => {
    acc[f.vulnType] = acc[f.vulnType] ? [...acc[f.vulnType], f] : [f];
    return acc;
  }, {});

  let report: ScanReport;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in response');
    const parsed = JSON.parse(match[0]);

    const sections: ReportSection[] = (parsed.sections ?? []).map((s: ReportSection) => ({
      ...s,
      findings: findingsByType[s.vulnType] ?? [],
      references: OWASP_REFS[s.vulnType] ?? [],
    }));

    report = {
      executiveSummary: parsed.executiveSummary ?? '',
      overallRiskLevel: parsed.overallRiskLevel ?? 'informational',
      totalFindings: findings.length,
      findingsBySeverity,
      sections,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    // Graceful fallback — build a basic report from raw data
    report = {
      executiveSummary: `The scan found ${findings.length} issue(s) across the target application. Manual review is recommended.`,
      overallRiskLevel: findings.some(f => f.severity === 'critical') ? 'critical'
        : findings.some(f => f.severity === 'high') ? 'high'
        : findings.some(f => f.severity === 'medium') ? 'medium' : 'low',
      totalFindings: findings.length,
      findingsBySeverity,
      sections: Object.entries(findingsByType).map(([vulnType, vFindings]) => ({
        vulnType,
        severity: vFindings[0].severity,
        description: vFindings[0].recommendation,
        findings: vFindings,
        remediationSteps: [vFindings[0].recommendation],
        references: OWASP_REFS[vulnType] ?? [],
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  emit({
    agentName: 'Report Agent',
    action: `Report complete — overall risk: ${report.overallRiskLevel.toUpperCase()}`,
    reasoning: `${report.totalFindings} finding(s) across ${report.sections.length} vulnerability type(s). ${report.executiveSummary.slice(0, 150)}`,
    status: 'done',
  });

  return { report, status: 'complete' };
}
```

---

## LangGraph Graph Wiring

The graph now has 10 nodes. The orchestrator runs first and produces a `scanPlan`. Conditional edges read `scanPlan.agentsToRun` to skip irrelevant agents. The aggregator deduplicates findings, then the report agent synthesises the final report.

```typescript
// lib/graph.ts
import { StateGraph, END } from '@langchain/langgraph';
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
function shouldRunAgent(agentKey: string) {
  return (state: ScanStateType): string => {
    const plan = state.scanPlan;
    if (!plan || plan.agentsToRun.includes(agentKey)) {
      return agentKey; // proceed to agent node
    }
    return 'aggregator'; // skip directly to aggregator
  };
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
    .addNode('report',       (s) => runReportAgent(s, emit))

    // Entry → Orchestrator
    .addEdge('__start__', 'orchestrator')

    // Orchestrator → conditional fan-out (skip agents not in plan)
    .addConditionalEdges('orchestrator', shouldRunAgent('xss'),      { xss: 'xss',           aggregator: 'aggregator' })
    .addConditionalEdges('orchestrator', shouldRunAgent('sqli'),     { sqli: 'sqli',         aggregator: 'aggregator' })
    .addConditionalEdges('orchestrator', shouldRunAgent('csrf'),     { csrf: 'csrf',         aggregator: 'aggregator' })
    .addConditionalEdges('orchestrator', shouldRunAgent('idor'),     { idor: 'idor',         aggregator: 'aggregator' })
    .addConditionalEdges('orchestrator', shouldRunAgent('headers'),  { headers: 'headers',   aggregator: 'aggregator' })
    .addConditionalEdges('orchestrator', shouldRunAgent('redirect'), { redirect: 'redirect', aggregator: 'aggregator' })

    // All agent nodes → Aggregator (fan-in)
    .addEdge('xss',      'aggregator')
    .addEdge('sqli',     'aggregator')
    .addEdge('csrf',     'aggregator')
    .addEdge('idor',     'aggregator')
    .addEdge('headers',  'aggregator')
    .addEdge('redirect', 'aggregator')

    // Aggregator → Report Agent → END
    .addEdge('aggregator', 'report')
    .addEdge('report', '__end__');

  return graph.compile();
}
```

---

## API Routes (Next.js)

### POST `/api/scan` — Start a scan

```typescript
// app/api/scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { EventEmitter } from 'events';
import { buildScanGraph } from '@/lib/graph';
import type { ScanJob, TraceEvent } from '@/lib/types';

// In-memory store — sufficient for a college project
export const jobs = new Map<string, ScanJob>();
export const emitters = new Map<string, EventEmitter>();

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
```

### GET `/api/scan/[id]/stream` — SSE trace stream

```typescript
// app/api/scan/[id]/stream/route.ts
import { jobs, emitters } from '../../route';
import type { TraceEvent } from '@/lib/types';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const job = jobs.get(params.id);
  const emitter = emitters.get(params.id);

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
```

---

## Frontend Traceability UI

### Core page component

```tsx
// app/page.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import type { TraceEvent, Finding, ScanPlan, ScanReport } from '@/lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E24B4A',
  high:     '#EF9F27',
  medium:   '#378ADD',
  low:      '#1D9E75',
  info:     '#888780',
};

const AGENT_COLORS: Record<string, string> = {
  'Orchestrator':  '#7F77DD',
  'XSS Agent':     '#E24B4A',
  'SQLi Agent':    '#D85A30',
  'CSRF Agent':    '#EF9F27',
  'IDOR Agent':    '#7F77DD',
  'Header Agent':  '#378ADD',
  'Redirect Agent':'#1D9E75',
  'Report Agent':  '#5DCAA5',
};

export default function Home() {
  const [url, setUrl]         = useState('');
  const [scanning, setScanning] = useState(false);
  const [traces, setTraces]   = useState<TraceEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [plan, setPlan]       = useState<ScanPlan | null>(null);
  const [report, setReport]   = useState<ScanReport | null>(null);
  const traceEndRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [traces]);

  const startScan = async () => {
    if (!url) return;
    setScanning(true);
    setTraces([]);
    setFindings([]);
    setPlan(null);
    setReport(null);

    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const { id } = await res.json();

    const es = new EventSource(`/api/scan/${id}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) {
        setFindings(data.findings ?? []);
        setPlan(data.plan ?? null);
        setReport(data.report ?? null);
        setScanning(false);
        es.close();
      } else {
        setTraces((prev) => [...prev, data as TraceEvent]);
      }
    };
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: '1.5rem' }}>
        Web Vulnerability Scanner
      </h1>

      {/* URL Input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '2rem' }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:8080/dvwa"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
        />
        <button
          onClick={startScan}
          disabled={scanning}
          style={{ padding: '8px 20px', borderRadius: 6, background: '#378ADD', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {scanning ? 'Scanning...' : 'Start Scan'}
        </button>
      </div>

      {/* Scan Plan (shown as soon as orchestrator finishes) */}
      {plan && <PlanCard plan={plan} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>

        {/* Agent Trace Feed */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: '1rem' }}>Agent trace feed</h2>
          <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {traces.map((t) => <TraceCard key={t.id} trace={t} />)}
            <div ref={traceEndRef} />
            {!scanning && traces.length === 0 && (
              <p style={{ color: '#888', fontSize: 13 }}>Trace events will appear here during the scan.</p>
            )}
          </div>
        </div>

        {/* Findings Panel */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: '1rem' }}>
            Findings {findings.length > 0 && `(${findings.length})`}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
            {!scanning && findings.length === 0 && traces.length > 0 && (
              <p style={{ color: '#1D9E75', fontSize: 13 }}>No vulnerabilities detected.</p>
            )}
          </div>
        </div>

      </div>

      {/* Report Panel — shown after scan completes */}
      {report && <ReportPanel report={report} />}
    </main>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────
function PlanCard({ plan }: { plan: ScanPlan }) {
  return (
    <div style={{ border: '1px solid #7F77DD44', borderRadius: 8, padding: '14px 16px', fontSize: 13, background: '#EEEDFE33' }}>
      <div style={{ fontWeight: 500, marginBottom: 6, color: '#534AB7' }}>Orchestrator scan plan</div>
      <p style={{ margin: '0 0 6px' }}>{plan.targetSummary}</p>
      <p style={{ margin: '0 0 6px', color: '#666' }}>{plan.reasoning}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {plan.agentsToRun.map(a => (
          <span key={a} style={{ background: '#7F77DD22', color: '#534AB7', border: '1px solid #7F77DD55', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
            {a}
          </span>
        ))}
      </div>
      {plan.riskContext && (
        <p style={{ margin: '8px 0 0', color: '#888', fontSize: 12 }}>Context: {plan.riskContext}</p>
      )}
    </div>
  );
}

// ─── Trace Card ───────────────────────────────────────────────────────────────
function TraceCard({ trace }: { trace: TraceEvent }) {
  const color = AGENT_COLORS[trace.agentName] ?? '#888';
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
          {trace.agentName}
        </span>
        {trace.status === 'running' && <span style={{ color: '#EF9F27', fontSize: 11 }}>⟳ running</span>}
        {trace.status === 'done'    && <span style={{ color: '#1D9E75', fontSize: 11 }}>✓ done</span>}
        {trace.status === 'error'   && <span style={{ color: '#E24B4A', fontSize: 11 }}>✗ error</span>}
      </div>
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{trace.action}</div>
      <div style={{ color: '#666', fontSize: 12, lineHeight: 1.5 }}>{trace.reasoning}</div>
    </div>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────
function FindingCard({ finding }: { finding: Finding }) {
  const color = SEVERITY_COLORS[finding.severity] ?? '#888';
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ background: color + '22', color, border: `1px solid ${color}66`, borderRadius: 4, padding: '2px 8px', fontSize: 11, textTransform: 'uppercase', fontWeight: 500 }}>
          {finding.severity}
        </span>
        <span style={{ fontWeight: 500 }}>{finding.vulnType}</span>
      </div>
      <div style={{ color: '#555', marginBottom: 4 }}><strong style={{ fontWeight: 500 }}>Location:</strong> {finding.location}</div>
      <div style={{ color: '#555', marginBottom: 4 }}><strong style={{ fontWeight: 500 }}>Evidence:</strong> {finding.evidence}</div>
      <div style={{ color: '#555', fontSize: 12, borderTop: '1px solid #f0f0f0', paddingTop: 6, marginTop: 6 }}>
        {finding.recommendation}
      </div>
    </div>
  );
}

// ─── Report Panel ─────────────────────────────────────────────────────────────
function ReportPanel({ report }: { report: ScanReport }) {
  const riskColor = SEVERITY_COLORS[report.overallRiskLevel] ?? '#888';
  return (
    <div style={{ marginTop: '2rem', border: '1px solid #e5e5e5', borderRadius: 10, padding: '20px 24px', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Scan report</h2>
        <span style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}66`, borderRadius: 4, padding: '2px 10px', fontSize: 11, textTransform: 'uppercase', fontWeight: 500 }}>
          {report.overallRiskLevel} risk
        </span>
        <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>{new Date(report.generatedAt).toLocaleString()}</span>
      </div>

      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>{report.executiveSummary}</p>

      {/* Severity breakdown */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Object.entries(report.findingsBySeverity).map(([sev, count]) =>
          count > 0 ? (
            <span key={sev} style={{ background: (SEVERITY_COLORS[sev] ?? '#888') + '22', color: SEVERITY_COLORS[sev] ?? '#888', border: `1px solid ${(SEVERITY_COLORS[sev] ?? '#888')}55`, borderRadius: 4, padding: '3px 10px', fontSize: 11 }}>
              {count} {sev}
            </span>
          ) : null
        )}
      </div>

      {/* Per-vuln sections */}
      {report.sections.map((s, i) => (
        <div key={i} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ background: (SEVERITY_COLORS[s.severity] ?? '#888') + '22', color: SEVERITY_COLORS[s.severity] ?? '#888', border: `1px solid ${(SEVERITY_COLORS[s.severity] ?? '#888')}55`, borderRadius: 4, padding: '1px 7px', fontSize: 10, textTransform: 'uppercase' }}>
              {s.severity}
            </span>
            <strong style={{ fontWeight: 500 }}>{s.vulnType}</strong>
          </div>
          <p style={{ margin: '0 0 8px', color: '#555', lineHeight: 1.6 }}>{s.description}</p>
          <div style={{ marginBottom: 6 }}>
            {s.remediationSteps.map((step, j) => (
              <div key={j} style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#444' }}>
                <span style={{ color: '#1D9E75', fontWeight: 500 }}>{j + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          {s.references.length > 0 && (
            <div style={{ fontSize: 11, color: '#888' }}>
              References: {s.references.join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Package Installation

```bash
npm install @langchain/langgraph @langchain/anthropic @langchain/core langchain zod
```

Add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Add to `next.config.js` (required for Node.js APIs in route handlers):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@langchain/langgraph'],
};
module.exports = nextConfig;
```

---

## Target Applications for Testing

> **Important:** Only scan applications you own or have explicit permission to test. Scanning live sites without permission is illegal.

Recommended local test targets:

| App | Stack | Vulns Covered | Setup |
|---|---|---|---|
| [DVWA](https://github.com/digininja/DVWA) | PHP/MySQL | XSS, SQLi, CSRF, IDOR | Docker: `docker run -p 8080:80 vulnerables/web-dvwa` |
| [Juice Shop](https://github.com/juice-shop/juice-shop) | Node.js | XSS, SQLi, IDOR, redirect | Docker: `docker run -p 3000:3000 bkimminich/juice-shop` |
| [WebGoat](https://github.com/WebGoat/WebGoat) | Java | CSRF, headers, IDOR | Docker: `docker run -p 8080:8080 webgoat/webgoat` |

---

## Quick Reference: Agent → Tool Matrix

| Agent | fetchHtml | injectPayload | checkHeaders | followRedirect | LLM call |
|---|:---:|:---:|:---:|:---:|:---:|
| Orchestrator Agent | ✓ | | | | ✓ |
| XSS Agent          | ✓ | ✓ | | | ✓ |
| SQLi Agent         | ✓ | ✓ | | | ✓ |
| CSRF Agent         | ✓ |   | ✓ | | ✓ |
| IDOR Agent         | ✓ | ✓ | | | ✓ |
| Header Agent       | ✓ |   | ✓ | | ✓ |
| Redirect Agent     |   | ✓ | | ✓ | ✓ |
| Report Agent       |   |   | | | ✓ |
