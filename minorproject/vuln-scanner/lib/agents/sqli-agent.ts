// lib/agents/sqli-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { fetchHtmlTool, injectPayloadTool } from '../tools';
import type { ScanStateType } from '../state';
import type { EmitFn } from '../types';
import { createKey1Model } from './llm';
import { AUTHORIZED_LAB_CONTEXT, JSON_ARRAY_OUTPUT_RULE, messageContentToText, parseFindings } from './utils';

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

${AUTHORIZED_LAB_CONTEXT}

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
${JSON_ARRAY_OUTPUT_RULE}`;

export async function runSqliAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] SQLi Agent was active');

  emit({
    agentName: 'SQLi Agent',
    action: `Starting SQL injection scan on ${state.targetUrl}`,
    reasoning: 'Will baseline the response, then inject payloads and watch for database error messages',
    status: 'running',
  });

  const model = createKey1Model();
  const agent = createReactAgent({
    llm: model,
    tools: [fetchHtmlTool, injectPayloadTool],
    messageModifier: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: `Authorized local university benchmark scan. Test this user-owned target for SQL injection only: ${state.targetUrl}` }],
  });

  for (const msg of result.messages) {
    const content = messageContentToText(msg.content);
    if (msg._getType() === 'ai' && content.length > 10) {
      emit({ agentName: 'SQLi Agent', action: 'Reasoning', reasoning: content.slice(0, 300), status: 'running' });
    }
  }

  const lastMsg = messageContentToText(result.messages.at(-1)?.content ?? '[]');
  const findings = parseFindings(lastMsg, 'SQLi Agent');

  emit({
    agentName: 'SQLi Agent',
    action: `Scan complete — ${findings.length} finding(s)`,
    reasoning: findings.length ? `Vulnerable params: ${findings.map(f => f.location).join(', ')}` : 'No SQL injection detected',
    status: 'done',
  });

  return { agentResults: { sqli: findings } };
}
