// app/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bot,
  BrainCircuit,
  ChevronDown,
  CircleDot,
  FileSearch,
  Fingerprint,
  Globe2,
  Network,
  Radar,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  type LucideIcon,
  Zap,
} from 'lucide-react';
import type { Finding, ScanPlan, ScanReport, Severity, TraceEvent } from '@/lib/types';

const AGENTS = [
  { key: 'orchestrator', label: 'Orchestrator', trace: 'Orchestrator', icon: BrainCircuit },
  { key: 'xss', label: 'XSS Agent', trace: 'XSS Agent', icon: ShieldAlert },
  { key: 'sqli', label: 'SQLi Agent', trace: 'SQLi Agent', icon: FileSearch },
  { key: 'csrf', label: 'CSRF Agent', trace: 'CSRF Agent', icon: Fingerprint },
  { key: 'idor', label: 'IDOR Agent', trace: 'IDOR Agent', icon: Network },
  { key: 'headers', label: 'Header Agent', trace: 'Header Agent', icon: ShieldCheck },
  { key: 'redirect', label: 'Redirect Agent', trace: 'Redirect Agent', icon: Globe2 },
  { key: 'report', label: 'Report Agent', trace: 'Report Agent', icon: Sparkles },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF4D6D',
  high: '#FB923C',
  medium: '#FACC15',
  low: '#38BDF8',
  info: '#00F5FF',
  informational: '#00F5FF',
};

const AGENT_FINDING_HINTS: Record<string, string> = {
  xss: 'XSS Agent',
  sqli: 'SQLi Agent',
  sql: 'SQLi Agent',
  csrf: 'CSRF Agent',
  idor: 'IDOR Agent',
  header: 'Header Agent',
  redirect: 'Redirect Agent',
};

type AgentStatus = 'idle' | 'running' | 'success' | 'vulnerable' | 'warning';

type AgentStateView = { status: AgentStatus; logs: TraceEvent[] };

type AgentNodeData = {
  agent: (typeof AGENTS)[number];
  state: AgentStateView;
  icon: LucideIcon;
};

type AgentGraphNode = Node<AgentNodeData, 'agent'>;

const AGENT_NODE_TYPES = { agent: GraphAgentNode };

export default function Home() {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [traces]);

  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [scanning]);

  const startScan = async () => {
    if (!url || scanning) return;
    setScanning(true);
    const scanStart = Date.now();
    setStartedAt(scanStart);
    setNow(scanStart);
    setEndedAt(null);
    setTraces([]);
    setFindings([]);
    setPlan(null);
    setReport(null);

    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const text = await res.text();
      setScanning(false);
      setEndedAt(Date.now());
      alert(`Scan failed: ${text || 'Server error'}`);
      return;
    }

    const { id } = await res.json();

    const es = new EventSource(`/api/scan/${id}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.done) {
        setFindings(data.findings ?? []);
        setPlan(data.plan ?? null);
        setReport(data.report ?? null);
        setScanning(false);
        setEndedAt(Date.now());
        es.close();
      } else {
        setTraces((prev) => [...prev, data as TraceEvent]);
      }
    };
  };

  const agentStates = useMemo(() => buildAgentStates(traces, findings, plan, scanning), [traces, findings, plan, scanning]);
  const scanProgress = useMemo(() => getScanProgress(agentStates, scanning, report), [agentStates, scanning, report]);
  const durationMs = startedAt ? (endedAt ?? now) - startedAt : 0;

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-slate-100">
      <CyberBackground />

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader scanning={scanning} />

        <ScanInputPanel
          url={url}
          setUrl={setUrl}
          scanning={scanning}
          progress={scanProgress}
          onStart={startScan}
        />

        <AgentOperationsPanel
          traces={traces}
          plan={plan}
          agentStates={agentStates}
          scanning={scanning}
          terminalEndRef={terminalEndRef}
        />

        <FindingsPanel
          findings={findings}
          report={report}
          scanning={scanning}
          traces={traces}
          durationMs={durationMs}
          completedAgents={Object.values(agentStates).filter((a) => a.status === 'success' || a.status === 'vulnerable').length}
        />
      </section>
    </main>
  );
}

function DashboardHeader({ scanning }: { scanning: boolean }) {
  return (
    <header className="glass-panel relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80"
          >
            <CircleDot className="h-4 w-4 text-[#00FF9C]" />
            AI Security Operations Center
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="cyber-title text-3xl font-black leading-tight sm:text-5xl lg:text-6xl"
          >
            AI-Powered Web Vulnerability Scanner
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base"
          >
            Autonomous Multi-Agent Security Analysis Engine
          </motion.p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {[
            ['8', 'AI Agents'],
            ['LIVE', scanning ? 'Scan Active' : 'SOC Ready'],
            ['SSE', 'Trace Stream'],
            ['OWASP', 'Report Map'],
          ].map(([value, label]) => (
            <div key={label} className="flex h-24 min-w-0 flex-col items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-center shadow-[0_0_24px_rgba(0,245,255,0.08)]">
              <div className="text-lg font-black text-cyan-100">{value}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

function ScanInputPanel({
  url,
  setUrl,
  scanning,
  progress,
  onStart,
}: {
  url: string;
  setUrl: (value: string) => void;
  scanning: boolean;
  progress: number;
  onStart: () => void;
}) {
  return (
    <section className="glass-panel relative overflow-hidden p-4 sm:p-5">
      <div className="scan-beam opacity-60" />
      <div className="relative grid items-stretch gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="group flex h-16 min-w-0 items-center gap-3 rounded-lg border border-cyan-300/20 bg-[#050816]/70 px-4 shadow-inner shadow-cyan-950/60 transition focus-within:border-cyan-300/70 focus-within:shadow-[0_0_30px_rgba(0,245,255,0.16)]">
          <Terminal className="h-5 w-5 shrink-0 text-[#00F5FF]" />
          <span className="hidden text-sm text-[#00FF9C] sm:inline">target://</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onStart();
            }}
            placeholder="http://localhost:8080/dvwa"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-cyan-50 outline-none placeholder:text-slate-500 sm:text-base"
          />
          <span className="h-5 w-2 animate-pulse bg-[#00F5FF]/80" />
        </label>

        <motion.button
          whileHover={{ scale: scanning ? 1 : 1.03 }}
          whileTap={{ scale: scanning ? 1 : 0.98 }}
          onClick={onStart}
          disabled={scanning || !url}
          className="scan-button relative h-16 overflow-hidden rounded-lg border border-cyan-200/40 px-5 font-bold uppercase tracking-[0.18em] text-cyan-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            {scanning ? <Radar className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
            {scanning ? `Scanning ${progress}%` : 'Start Scan'}
          </span>
          {scanning && <span className="radar-ring" />}
        </motion.button>
      </div>
    </section>
  );
}

function AgentOperationsPanel({
  traces,
  plan,
  agentStates,
  scanning,
  terminalEndRef,
}: {
  traces: TraceEvent[];
  plan: ScanPlan | null;
  agentStates: Record<string, { status: AgentStatus; logs: TraceEvent[] }>;
  scanning: boolean;
  terminalEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="glass-panel min-w-0 p-4 sm:p-5">
      <PanelTitle icon={Bot} eyebrow="Agentic orchestration" title="Live Multi-Agent Trace Feed" />

      {plan && <PlanCard plan={plan} />}

      <AgentTree agentStates={agentStates} scanning={scanning} />

      <TerminalFeed traces={traces} scanning={scanning} terminalEndRef={terminalEndRef} />
    </section>
  );
}

function AgentTree({
  agentStates,
  scanning,
}: {
  agentStates: Record<string, AgentStateView>;
  scanning: boolean;
}) {
  const { nodes, edges } = useMemo(() => buildAgentGraph(agentStates, scanning), [agentStates, scanning]);

  return (
    <div className="relative mt-5 h-[520px] overflow-hidden rounded-xl border border-cyan-300/15 bg-[#070B1A]/80 p-2 sm:p-3">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.18),transparent_42%)]" />
      <ReactFlow
        className="agent-flow relative z-10"
        nodes={nodes}
        edges={edges}
        nodeTypes={AGENT_NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.45}
        maxZoom={1.3}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      >
        <Background color="rgba(0,245,255,0.15)" gap={28} size={1} />
      </ReactFlow>
    </div>
  );
}

function GraphAgentNode({ data }: NodeProps<AgentGraphNode>) {
  const [open, setOpen] = useState(false);
  const { agent, state } = data;
  const Icon = data.icon;
  const statusClass = `agent-${state.status}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="relative z-20 w-[188px]"
    >
      <Handle type="target" position={Position.Top} className="agent-flow-handle" />
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`agent-node ${statusClass} group relative h-[88px] w-full rounded-xl border px-3 py-2 text-left transition`}
      >
        <span className="node-pulse" />
        <div className="relative z-10 flex h-full items-center justify-between gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Icon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <span className="inline-flex h-5 max-w-full items-center justify-center rounded border border-white/10 bg-white/[0.04] px-2 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-slate-400">
              {statusLabel(state.status)}
            </span>
            <span className="block max-w-full whitespace-nowrap text-xs font-bold leading-none text-slate-100">
              {agent.label}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      <Handle type="source" position={Position.Bottom} className="agent-flow-handle" />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute left-0 right-0 top-[96px] z-40 overflow-hidden"
          >
            <div className="rounded-lg border border-cyan-300/20 bg-[#030712]/95 p-3 text-[11px] leading-5 text-slate-300 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur">
              {state.logs.at(-1)?.reasoning ?? 'Awaiting orchestration command.'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TerminalFeed({
  traces,
  scanning,
  terminalEndRef,
}: {
  traces: TraceEvent[];
  scanning: boolean;
  terminalEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const entries = traces.length
    ? traces
    : [
        {
          id: 'placeholder',
          agentName: 'SOC Console',
          action: scanning ? 'Initializing scan...' : 'Trace events will appear here during the scan.',
          reasoning: 'Awaiting target URL and operator command.',
          timestamp: 0,
          status: 'running' as const,
        },
      ];

  return (
    <div className="mt-5 w-full overflow-hidden rounded-xl border border-[#00FF9C]/20 bg-black/70 shadow-[0_0_34px_rgba(0,255,156,0.08)]">
      <div className="flex items-center justify-between border-b border-[#00FF9C]/10 bg-[#00FF9C]/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#00FF9C]">
          <Terminal className="h-4 w-4" />
          Terminal Feed
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#00FF9C]" />
          Auto-scroll
        </div>
      </div>
      <div className="terminal-scroll max-h-64 space-y-3 overflow-y-auto p-4 font-mono text-xs leading-5">
        <AnimatePresence initial={false}>
          {entries.map((trace) => (
            <motion.div
              key={trace.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="terminal-line break-words"
            >
              <span className="text-cyan-300">[{formatTime(trace.timestamp)}]</span>{' '}
              <span className="text-[#00FF9C]">{trace.agentName}</span>{' '}
              <span className="break-words text-slate-200">{trace.action}</span>
              <div className="break-words pl-4 text-slate-500">{trace.reasoning}</div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}

function FindingsPanel({
  findings,
  report,
  scanning,
  traces,
  durationMs,
  completedAgents,
}: {
  findings: Finding[];
  report: ScanReport | null;
  scanning: boolean;
  traces: TraceEvent[];
  durationMs: number;
  completedAgents: number;
}) {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const durationText = durationMs > 0 ? `${Math.max(1, Math.round(durationMs / 1000))}s` : '0s';

  return (
    <section className="glass-panel min-w-0 p-4 sm:p-5">
      <PanelTitle icon={Activity} eyebrow="Intelligence report" title="Findings / Report Panel" />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard label="Total Vulnerabilities" value={findings.length} color="#00F5FF" />
        <StatCard label="Critical Findings" value={criticalCount} color="#FF4D6D" />
        <StatCard label="Agents Completed" value={completedAgents} color="#00FF9C" />
        <StatCard label="Scan Duration" value={durationText} color="#FACC15" />
      </div>

      {report && <ReportSummary report={report} />}

      <div className="mt-5 space-y-3">
        <AnimatePresence>
          {findings.map((finding, index) => (
            <VulnerabilityCard key={`${finding.vulnType}-${finding.location}-${index}`} finding={finding} index={index} />
          ))}
        </AnimatePresence>

        {!scanning && findings.length === 0 && traces.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-[#00FF9C]/25 bg-[#00FF9C]/5 p-5 text-sm text-[#00FF9C]">
            No vulnerabilities detected by the active agents.
          </motion.div>
        )}

        {findings.length === 0 && traces.length === 0 && (
          <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.03] p-5 text-sm text-slate-400">
            Findings and AI-generated report cards will appear after a scan completes.
          </div>
        )}
      </div>
    </section>
  );
}

function VulnerabilityCard({ finding, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const color = SEVERITY_COLORS[finding.severity] ?? '#00F5FF';
  const score = severityScore(finding.severity);
  const agent = detectionAgent(finding);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.07 }}
      className="holo-card overflow-hidden rounded-xl border bg-[#08101F]/80"
      style={{ borderColor: `${color}55`, boxShadow: `0 0 30px ${color}18` }}
    >
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full p-4 text-left">
        <div className="grid grid-cols-[12px_minmax(0,1fr)_20px] items-start gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 18px ${color}` }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">{finding.vulnType}</h3>
              <span className="inline-flex h-6 items-center rounded border px-2 text-[10px] font-black uppercase tracking-[0.16em]" style={{ borderColor: `${color}66`, color, backgroundColor: `${color}12` }}>
                {finding.severity}
              </span>
              <span className="inline-flex h-6 items-center rounded border border-white/10 bg-white/[0.04] px-2 text-[10px] text-slate-300">
                CVSS {score}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-slate-400">{finding.location}</p>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 justify-self-end text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-white/10 p-4 pt-3 text-sm leading-6 text-slate-300">
              <InfoRow label="Affected endpoint" value={finding.location} />
              <InfoRow label="Description" value={finding.evidence} />
              <InfoRow label="Remediation" value={finding.recommendation} />
              <InfoRow label="Detection agent" value={agent} />
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Number(score) * 10)}%` }}
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${color}, #00F5FF)` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function ReportSummary({ report }: { report: ScanReport }) {
  const color = SEVERITY_COLORS[report.overallRiskLevel] ?? '#00F5FF';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl border border-cyan-300/15 bg-[#070B1A]/75 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">AI Summary</span>
        <span className="rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color, borderColor: `${color}66`, backgroundColor: `${color}12` }}>
          {report.overallRiskLevel} risk
        </span>
      </div>
      <p className="typewriter-text text-sm leading-6 text-slate-300">{report.executiveSummary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(report.findingsBySeverity).map(([severity, count]) =>
          count > 0 ? (
            <span key={severity} className="rounded border px-2 py-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: SEVERITY_COLORS[severity], borderColor: `${SEVERITY_COLORS[severity]}55` }}>
              {count} {severity}
            </span>
          ) : null
        )}
      </div>
    </motion.div>
  );
}

function PlanCard({ plan }: { plan: ScanPlan }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-purple-400/20 bg-purple-500/[0.06] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-purple-200">
        <Zap className="h-4 w-4" />
        Orchestrator Scan Plan
      </div>
      <p className="text-sm leading-6 text-slate-300">{plan.targetSummary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{plan.reasoning}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {plan.agentsToRun.map((agent) => (
          <span key={agent} className="rounded border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
            {agent}
          </span>
        ))}
      </div>
      {plan.riskContext && <p className="mt-3 text-xs text-amber-200/80">Context: {plan.riskContext}</p>}
    </motion.div>
  );
}

function PanelTitle({ icon: Icon, eyebrow, title }: { icon: typeof Bot; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300/70">{eyebrow}</div>
        <h2 className="mt-1 text-lg font-black text-slate-100">{title}</h2>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex min-h-[92px] flex-col justify-center rounded-xl border border-white/10 bg-white/[0.04] p-3" style={{ boxShadow: `0 0 24px ${color}10` }}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-black" style={{ color }}>
        {value}
      </motion.div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="break-words text-slate-300">{value}</div>
    </div>
  );
}

function CyberBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="cyber-grid absolute inset-0" />
      <div className="scanlines absolute inset-0" />
      <div className="noise absolute inset-0" />
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className="particle" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${i * 0.45}s`, animationDuration: `${8 + (i % 5)}s` }} />
      ))}
    </div>
  );
}

function buildAgentStates(traces: TraceEvent[], findings: Finding[], plan: ScanPlan | null, scanning: boolean) {
  const states = Object.fromEntries(AGENTS.map((agent) => [agent.key, { status: 'idle' as AgentStatus, logs: [] as TraceEvent[] }]));
  const planned = new Set((plan?.agentsToRun ?? []).map((agent) => normalizeAgentKey(agent)));

  for (const trace of traces) {
    const agent = AGENTS.find((item) => item.trace === trace.agentName);
    if (!agent) continue;
    states[agent.key].logs.push(trace);
    states[agent.key].status = trace.status === 'running' ? 'running' : trace.status === 'error' ? 'warning' : 'success';
  }

  for (const finding of findings) {
    const agentName = detectionAgent(finding);
    const agent = AGENTS.find((item) => item.label === agentName);
    if (agent && finding.severity !== 'low' && finding.severity !== 'info') {
      states[agent.key].status = 'vulnerable';
    }
  }

  if (scanning && traces.length === 0) states.orchestrator.status = 'running';
  for (const key of planned) {
    if (states[key] && states[key].status === 'idle') states[key].status = scanning ? 'running' : 'idle';
  }

  return states;
}

function buildAgentGraph(agentStates: Record<string, AgentStateView>, scanning: boolean): { nodes: AgentGraphNode[]; edges: Edge[] } {
  const positions: Record<string, { x: number; y: number }> = {
    orchestrator: { x: 500, y: 20 },
    xss: { x: 0, y: 190 },
    sqli: { x: 200, y: 190 },
    csrf: { x: 400, y: 190 },
    idor: { x: 600, y: 190 },
    headers: { x: 800, y: 190 },
    redirect: { x: 1000, y: 190 },
    report: { x: 500, y: 360 },
  };

  const nodes: AgentGraphNode[] = AGENTS.map((agent) => ({
    id: agent.key,
    type: 'agent',
    position: positions[agent.key],
    data: {
      agent,
      state: agentStates[agent.key],
      icon: agent.icon,
    },
    draggable: false,
    selectable: false,
  }));

  const specialistKeys = AGENTS.slice(1, 7).map((agent) => agent.key);
  const edges: Edge[] = [
    ...specialistKeys.map((key) => graphEdge('orchestrator', key, agentStates[key], scanning)),
    ...specialistKeys.map((key) => graphEdge(key, 'report', agentStates[key], scanning || agentStates.report.status !== 'idle')),
  ];

  return { nodes, edges };
}

function graphEdge(source: string, target: string, targetState: AgentStateView, scanning: boolean): Edge {
  const active = scanning || targetState.status !== 'idle';
  const color = active ? agentStatusColor(targetState.status) : 'rgba(0,245,255,0.22)';

  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    animated: active,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color,
      width: 16,
      height: 16,
    },
    style: {
      stroke: color,
      strokeWidth: active ? 2.5 : 1.4,
      filter: active ? `drop-shadow(0 0 7px ${color})` : undefined,
    },
  };
}

function getScanProgress(agentStates: Record<string, { status: AgentStatus }>, scanning: boolean, report: ScanReport | null) {
  if (report) return 100;
  const active = Object.values(agentStates).filter((agent) => agent.status !== 'idle').length;
  const completed = Object.values(agentStates).filter((agent) => agent.status === 'success' || agent.status === 'vulnerable' || agent.status === 'warning').length;
  if (!scanning) return 0;
  return Math.min(96, Math.max(8, Math.round(((completed || active) / AGENTS.length) * 100)));
}

function detectionAgent(finding: Finding) {
  const text = `${finding.vulnType} ${finding.location} ${finding.evidence}`.toLowerCase();
  const hit = Object.entries(AGENT_FINDING_HINTS).find(([key]) => text.includes(key));
  return hit?.[1] ?? 'Report Agent';
}

function normalizeAgentKey(agent: string) {
  if (agent === 'headers') return 'headers';
  if (agent === 'reporter') return 'report';
  return agent.toLowerCase().replace(/\s+agent$/, '');
}

function severityScore(severity: Severity) {
  return ({ critical: '9.8', high: '8.1', medium: '5.7', low: '3.2', info: '0.0' } as Record<Severity, string>)[severity] ?? '0.0';
}

function statusLabel(status: AgentStatus) {
  return ({ idle: 'Idle', running: 'Run', success: 'Done', vulnerable: 'Risk', warning: 'Warn' } as Record<AgentStatus, string>)[status];
}

function agentStatusColor(status: AgentStatus) {
  return ({
    idle: '#00F5FF',
    running: '#7C3AED',
    success: '#00FF9C',
    vulnerable: '#FF4D6D',
    warning: '#FACC15',
  } as Record<AgentStatus, string>)[status];
}

function formatTime(timestamp: number) {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
