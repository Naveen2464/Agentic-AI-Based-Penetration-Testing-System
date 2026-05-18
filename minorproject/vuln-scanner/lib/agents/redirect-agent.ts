// lib/agents/redirect-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { injectPayloadTool, followRedirectTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey3Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

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

${AUTHORIZED_LAB_CONTEXT}

Your task:
1. Check if the target URL already contains redirect-style parameters: ${REDIRECT_PARAMS.join(', ')}
2. If not found in the URL, use injectPayload (GET method) to try each of these parameter names with the value "https://evil.com".
3. For any parameter that results in a 301/302/303/307/308 response, use followRedirect to trace the full redirect chain.
4. If the final destination is on a different domain than the original target, it is an open redirect.
5. Also test these payload variants: ${EVIL_PAYLOADS.join(', ')}.

Explain your reasoning before each tool call.

Return a JSON array:
[{
  "vulnType": "Open Redirect",
  "severity": "high",
  "location": "<url> → param: <name>",
  "evidence": "Redirect chain: [<original>] → [<evil.com>]",
  "recommendation": "Validate redirect destinations against an allowlist of trusted domains. Never accept arbitrary URLs as redirect targets."
}]
${JSON_ARRAY_OUTPUT_RULE}`;

export async function runRedirectAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] Redirect Agent was active');

  emit({
    agentName: 'Redirect Agent',
    action: `Scanning ${state.targetUrl} for open redirect vulnerabilities`,
    reasoning: 'Will inject external URLs into common redirect parameters and trace the resulting redirect chain',
    status: 'running',
  });

  const model = createKey3Model();
  const agent = createReactAgent({
    llm: model,
    tools: [injectPayloadTool, followRedirectTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Test this user-owned target for open redirect issues only: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({ agentName: 'Redirect Agent', action: 'Reasoning', reasoning: content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'Redirect Agent');

  emit({
    agentName: 'Redirect Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Unvalidated redirect destination found' : 'No open redirect detected',
    status: 'done',
  });

  return { agentResults: { redirect: findings } };
}
