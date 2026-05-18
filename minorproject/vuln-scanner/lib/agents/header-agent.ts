// lib/agents/header-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, checkHeadersTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey2Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

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

${AUTHORIZED_LAB_CONTEXT}

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
${JSON_ARRAY_OUTPUT_RULE}`;

export async function runHeaderAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] Header Agent was active');

  emit({
    agentName: 'Header Agent',
    action: `Checking security headers on ${state.targetUrl}`,
    reasoning: 'Will inspect HTTP response headers for CSP, HSTS, X-Frame-Options, and other security directives',
    status: 'running',
  });

  const model = createKey2Model();
  const agent = createReactAgent({
    llm: model,
    tools: [checkHeadersTool, fetchHtmlTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Check security headers on this user-owned target only: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({ agentName: 'Header Agent', action: 'Reasoning', reasoning: content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
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
