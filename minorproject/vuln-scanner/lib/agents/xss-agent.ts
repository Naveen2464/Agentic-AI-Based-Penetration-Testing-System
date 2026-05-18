// lib/agents/xss-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey1Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(1)",
];

const SYSTEM_PROMPT = `You are a Reflected XSS vulnerability scanner agent.

${AUTHORIZED_LAB_CONTEXT}

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
${JSON_ARRAY_OUTPUT_RULE}`;

export function createXssAgent() {
  const model = createKey1Model();
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
  console.log('[Agent Active] XSS Agent was active');

  emit({
    agentName: 'XSS Agent',
    action: `Starting XSS scan on ${state.targetUrl}`,
    reasoning: 'Will fetch page HTML, identify input fields, then inject payloads to test for unescaped reflection',
    status: 'running',
  });

  const agent = createXssAgent();
  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Test this user-owned target for Reflected XSS only: ${state.targetUrl}` }],
  });

  // Emit intermediate reasoning steps
  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({
        agentName: 'XSS Agent',
        action: 'Reasoning',
        reasoning: content.slice(0, 300),
        status: 'running',
      });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
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
