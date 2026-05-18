// lib/agents/orchestrator-agent.ts
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { fetchHtmlTool } from '../tools';
import type { ScanStateType } from '../state';
import type { ScanPlan, EmitFn } from '../types';
import { createKey1Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, messageContentToText } from './utils';

const SYSTEM_PROMPT = `You are the orchestrator of a web vulnerability scanning system.
You are given a target URL and a snapshot of its HTML. Your job is to:

${AUTHORIZED_LAB_CONTEXT}

1. Analyse the provided page structure:
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

3. Output your findings as a raw JSON object (no markdown fences, no tool calls, no explanations):
{
  "targetSummary": "<1-2 sentence description of what the target appears to be>",
  "agentsToRun": ["xss", "sqli", "csrf", "idor", "headers", "redirect"],
  "reasoning": "<explain why each included agent is relevant for this specific target>",
  "riskContext": "<any notable observations: e.g. login form visible, numeric IDs in path, no HTTPS>"
}

Always include "headers" in agentsToRun. Be explicit and specific in your reasoning.
DO NOT attempt to call any functions or tools. Just output the JSON.`;

export async function runOrchestratorAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] Orchestrator Agent was active');

  emit({
    agentName: 'Orchestrator',
    action: `Analysing target: ${state.targetUrl}`,
    reasoning: 'Fetching the target page to understand its structure before deciding which agents to run',
    status: 'running',
  });

  const model = createKey1Model();

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
    fallbackPlan.agentsToRun.forEach((agent) => {
      console.log(`[Orchestrator] Calling ${agent} agent`);
    });
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
      `Authorized local university benchmark target URL: ${state.targetUrl}\n\nPage snapshot:\n${pageSnapshot.slice(0, 6000)}`
    ),
  ]);

  const raw = messageContentToText(response.content);

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

  plan.agentsToRun.forEach((agent) => {
    console.log(`[Orchestrator] Calling ${agent} agent`);
  });

  emit({
    agentName: 'Orchestrator',
    action: `Scan plan ready — running ${plan.agentsToRun.length} agents`,
    reasoning: `${plan.targetSummary} | Agents selected: ${plan.agentsToRun.join(', ')} | ${String(plan.reasoning || '').slice(0, 200)}`,
    status: 'done',
  });

  return { scanPlan: plan };
}
