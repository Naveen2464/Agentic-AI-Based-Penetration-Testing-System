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
