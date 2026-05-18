// lib/agents/idor-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey2Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

const SYSTEM_PROMPT = `You are an IDOR (Insecure Direct Object Reference) vulnerability scanner agent.

${AUTHORIZED_LAB_CONTEXT}

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
${JSON_ARRAY_OUTPUT_RULE}`;

export async function runIdorAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] IDOR Agent was active');

  emit({
    agentName: 'IDOR Agent',
    action: `Scanning ${state.targetUrl} for insecure direct object references`,
    reasoning: 'Will detect numeric IDs in URL and enumerate adjacent values to check for missing authorization',
    status: 'running',
  });

  const model = createKey2Model();
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, injectPayloadTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Test this user-owned target for IDOR issues only: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({ agentName: 'IDOR Agent', action: 'Reasoning', reasoning: content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'IDOR Agent');

  emit({
    agentName: 'IDOR Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? 'Access control issues found' : 'No IDOR detected',
    status: 'done',
  });

  return { agentResults: { idor: findings } };
}
