// lib/agents/csrf-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, checkHeadersTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey2Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

const CSRF_TOKEN_NAMES = [
  'csrf', '_csrf', 'csrf_token', '_token',
  'authenticity_token', 'nonce', '__RequestVerificationToken',
];

const SYSTEM_PROMPT = `You are a CSRF vulnerability scanner agent.

${AUTHORIZED_LAB_CONTEXT}

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
${JSON_ARRAY_OUTPUT_RULE}`;

export async function runCsrfAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] CSRF Agent was active');

  emit({
    agentName: 'CSRF Agent',
    action: `Scanning ${state.targetUrl} for missing CSRF tokens`,
    reasoning: 'Will parse all POST forms and check for absence of CSRF token inputs and SameSite cookie attributes',
    status: 'running',
  });

  const model = createKey2Model();
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, checkHeadersTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Test this user-owned target for CSRF issues only: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({ agentName: 'CSRF Agent', action: 'Reasoning', reasoning: content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'CSRF Agent');

  emit({
    agentName: 'CSRF Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Unprotected POST forms found' : 'All POST forms have CSRF protection',
    status: 'done',
  });

  return { agentResults: { csrf: findings } };
}
