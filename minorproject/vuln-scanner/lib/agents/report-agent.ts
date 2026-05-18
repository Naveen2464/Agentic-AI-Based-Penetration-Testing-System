// lib/agents/report-agent.ts
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ScanStateType } from '../state';
import type { ScanReport, ReportSection, Finding, Severity, EmitFn } from '../types';
import { createKey3Model } from './llm';
import { messageContentToText } from './utils';

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

Return ONLY a raw JSON object (no markdown fences, no tool calls, no explanations):
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
- Keep executiveSummary non-technical enough for a project supervisor to understand
DO NOT attempt to call any functions or tools.`;

export async function runReportAgent(
  state: ScanStateType,
  emit: EmitFn
): Promise<Partial<ScanStateType>> {
  console.log('[Agent Active] Report Agent was active');

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

  const model = createKey3Model();

  const findingsText = findings
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.vulnType}\n   Location: ${f.location}\n   Evidence: ${f.evidence}\n   Recommendation: ${f.recommendation}`)
    .join('\n\n');

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Target: ${state.targetUrl}\n\nFindings:\n${findingsText}`
    ),
  ]);

  const raw = messageContentToText(response.content);

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
