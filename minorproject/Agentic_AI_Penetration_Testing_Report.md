<div align="center">

# DESIGN AND IMPLEMENTATION OF AGENTIC AI BASED PENETRATION TESTING SYSTEM

## Minor Project Report

Submitted in partial fulfillment of the requirements for the award of the degree of

## Bachelor of Technology

in

## Computer Science and Engineering

Submitted by

**[Student Name]**  
**[Roll Number]**

Under the guidance of

**[Guide Name]**  
**[Department/Designation]**

**[Department Name]**  
**[Institute/University Name]**

**Academic Year 2025-2026**

</div>

<div style="page-break-after: always;"></div>

## Certificate

This is to certify that the minor project report entitled **"Design and Implementation of Agentic AI Based Penetration Testing System"** is a record of the original work carried out by **[Student Name]** under my supervision and guidance. The work has been completed as part of the minor project requirement in the Department of Computer Science and Engineering.

The project demonstrates the design and implementation of a multi-agent AI system for authorized web application vulnerability assessment, including automated scanning, agent traceability, vulnerability reporting, and controlled benchmark testing.

**Guide Signature:** ____________________  
**Name:** [Guide Name]  
**Date:** ____________________

<div style="page-break-after: always;"></div>

## Declaration

I hereby declare that the project report entitled **"Design and Implementation of Agentic AI Based Penetration Testing System"** is an authentic record of my own work carried out during the minor project. The project has not been submitted previously for the award of any degree, diploma, or certificate.

All external references, tools, frameworks, and libraries used in the project have been acknowledged appropriately.

**Student Signature:** ____________________  
**Name:** [Student Name]  
**Roll Number:** [Roll Number]  
**Date:** ____________________

<div style="page-break-after: always;"></div>

## Acknowledgement

I express my sincere gratitude to **[Guide Name]**, **[Department/Designation]**, for providing guidance and support throughout the development of this project. Their suggestions helped in shaping the system architecture, agent workflow, and reporting approach.

I also thank the Department of Computer Science and Engineering for providing the academic environment and resources required for completing this minor project. I am thankful to my classmates and peers for their feedback during testing and demonstration.

Finally, I acknowledge the open-source communities behind Next.js, React, LangChain, LangGraph, Tailwind CSS, and OWASP resources, which were valuable in implementing and understanding the system.

<div style="page-break-after: always;"></div>

## Abstract

Web applications are common targets for security attacks such as cross-site scripting, SQL injection, cross-site request forgery, insecure direct object reference, missing security headers, and open redirect vulnerabilities. Traditional penetration testing requires significant manual effort, domain knowledge, and repeated inspection of application inputs, HTTP responses, and configuration weaknesses.

This project presents the design and implementation of an **Agentic AI Based Penetration Testing System** that uses multiple specialized AI agents to perform authorized vulnerability assessment on local or user-owned web applications. The system is implemented as a Next.js web application with a LangGraph-based multi-agent workflow. An orchestrator agent analyzes the target and prepares a scan plan. Specialist agents then test individual vulnerability classes using controlled HTTP tools. A report agent aggregates findings and generates a structured security report with severity levels, evidence, and remediation guidance.

The system includes a live user interface showing agent execution status, real-time trace logs through Server-Sent Events, vulnerability cards, scan summaries, and benchmark targets for testing. The implementation demonstrates how agentic AI can improve traceability, modularity, and automation in educational penetration testing workflows while remaining within an authorized lab scope.

**Keywords:** Agentic AI, Penetration Testing, Web Security, LangGraph, LangChain, Vulnerability Scanner, OWASP, Next.js.

<div style="page-break-after: always;"></div>

## Table of Contents

1. Introduction  
2. Literature Review  
3. Problem Statement  
4. Objectives  
5. System Analysis  
6. Proposed Methodology  
7. System Design  
8. Implementation  
9. Testing and Results  
10. Advantages and Limitations  
11. Conclusion and Future Scope  
12. References  
13. Appendix

<div style="page-break-after: always;"></div>

# Chapter 1: Introduction

## 1.1 Background

Modern web applications process user input through forms, query parameters, authentication flows, redirects, APIs, and browser-side scripts. If these input paths are not handled securely, attackers can exploit application behavior to execute scripts, bypass access controls, manipulate server-side queries, or mislead users through unsafe redirects.

Penetration testing is the process of evaluating a system for security weaknesses by simulating controlled attacks. Manual testing is effective but time-consuming. Automated scanners are faster, but many operate like fixed rule engines and provide limited reasoning about why a test is being performed. Agentic AI provides a middle approach in which multiple task-specific agents can reason, use tools, exchange structured state, and produce traceable results.

## 1.2 Project Overview

The project implements a web vulnerability scanning system named **Agentic AI Based Penetration Testing System**. It is designed for authorized testing of local or private benchmark applications. The scanner accepts a target URL and executes a multi-agent workflow:

- The orchestrator agent inspects the target and decides which vulnerability agents should run.
- Six specialist agents test for reflected XSS, SQL injection, CSRF, IDOR, missing security headers, and open redirect.
- A pure aggregator node deduplicates and sorts findings.
- A report agent prepares a structured security report.
- The frontend displays the live trace feed, agent graph, findings, and final report.

## 1.3 Scope

The project focuses on educational and authorized penetration testing. It is not intended for scanning third-party websites without permission. The current implementation targets common web vulnerabilities and demonstrates modular agentic security analysis rather than replacing full professional penetration testing.

# Chapter 2: Literature Review

## 2.1 Web Application Vulnerability Scanners

Traditional web scanners use predefined payload lists, crawling, response matching, and configuration checks. These scanners can identify known vulnerability patterns efficiently, but they may lack contextual reasoning. They also often provide limited transparency into the decision-making process.

## 2.2 OWASP Web Security Risks

The Open Worldwide Application Security Project identifies common categories such as injection, broken access control, and security misconfiguration. This project maps its implemented checks to OWASP concepts:

| Vulnerability | Related OWASP Area | Common Impact |
|---|---|---|
| Reflected XSS | Injection | Script execution in victim browser |
| SQL Injection | Injection | Data leakage or database manipulation |
| CSRF | Broken Access Control | Unauthorized state-changing requests |
| IDOR | Broken Access Control | Access to other users' resources |
| Missing Security Headers | Security Misconfiguration | Weaker browser-side protection |
| Open Redirect | Broken Access Control / Misconfiguration | Phishing and redirect abuse |

## 2.3 Agentic AI in Security

Agentic AI systems divide a goal into smaller tasks handled by autonomous agents. Each agent can reason about its objective, use tools, and return structured outputs. In this project, agentic AI is used to improve modularity and explainability. Each vulnerability class is handled by a separate agent with its own prompt, tools, and output schema.

# Chapter 3: Problem Statement

Manual penetration testing requires expertise, repeated request crafting, payload testing, response analysis, and documentation. For students and early security learners, it can be difficult to understand how individual tests are selected and how findings are converted into a report.

The problem addressed by this project is:

**To design and implement an agentic AI based penetration testing system that can scan authorized web targets for common vulnerabilities, show traceable agent reasoning, and generate structured vulnerability reports with remediation guidance.**

# Chapter 4: Objectives

The main objectives of the project are:

1. To build a web-based vulnerability scanning interface.
2. To implement a multi-agent architecture using LangGraph and LangChain.
3. To create specialized agents for XSS, SQL injection, CSRF, IDOR, missing security headers, and open redirect.
4. To provide safe and controlled HTTP tools for agent interaction with target applications.
5. To stream real-time agent trace events to the frontend.
6. To aggregate findings and generate a clear final report.
7. To validate the scanner using local benchmark applications.

# Chapter 5: System Analysis

## 5.1 Existing System

Existing automated scanners generally perform fixed checks and return final results after completion. They may not clearly show why a particular check was performed or which internal step produced the finding. Manual testers, on the other hand, provide better reasoning but require more time and experience.

## 5.2 Proposed System

The proposed system combines automated testing with agentic reasoning. The target URL is first analyzed by an orchestrator. Based on the target structure, specialist agents are executed. Each agent uses only predefined tools such as `fetchHtml`, `injectPayload`, `checkHeaders`, and `followRedirect`. Results are stored as structured findings and streamed to the user interface.

## 5.3 Functional Requirements

- The user must be able to enter a target URL.
- The system must validate the URL before starting a scan.
- The scanner must create a unique scan job.
- The orchestrator must generate a scan plan.
- Specialist agents must test assigned vulnerability categories.
- Trace events must be visible in real time.
- Findings must include vulnerability type, severity, location, evidence, and recommendation.
- The report agent must generate a summary and remediation sections.

## 5.4 Non-Functional Requirements

- The system should be modular and extensible.
- The UI should show progress clearly.
- The scanner should use controlled and scoped tool calls.
- The project should be suitable for local lab testing.
- The implementation should be maintainable using TypeScript types and structured state.

# Chapter 6: Proposed Methodology

The methodology follows a pipeline-based multi-agent workflow.

## 6.1 Workflow

1. The user enters a URL in the scanner dashboard.
2. The Next.js API creates a scan job and starts the graph in the background.
3. The orchestrator fetches the target HTML and creates a scan plan.
4. LangGraph routes execution to the selected specialist agents.
5. Each specialist agent performs vulnerability-specific tests.
6. Agent outputs are parsed as JSON findings.
7. The aggregator deduplicates and sorts findings by severity.
8. The report agent generates a structured report.
9. The frontend receives live trace events and final results through SSE.

## 6.2 Vulnerability Detection Strategy

| Agent | Detection Strategy | Tools Used |
|---|---|---|
| XSS Agent | Injects script payloads and checks whether payloads are reflected unescaped | `fetchHtml`, `injectPayload` |
| SQLi Agent | Injects SQL payloads and searches for database error signals or abnormal response changes | `fetchHtml`, `injectPayload` |
| CSRF Agent | Checks POST forms for missing token fields and reviews SameSite cookie attributes | `fetchHtml`, `checkHeaders` |
| IDOR Agent | Tests adjacent numeric identifiers for unauthorized accessible resources | `fetchHtml`, `injectPayload` |
| Header Agent | Checks for missing browser security headers | `checkHeaders`, `fetchHtml` |
| Redirect Agent | Tests common redirect parameters with external destinations | `injectPayload`, `followRedirect` |

# Chapter 7: System Design

## 7.1 Architecture

The application is divided into frontend, API, agent workflow, tools, and benchmark layers.

```text
User Interface
    |
    v
Next.js API Routes
    |
    v
LangGraph StateGraph
    |
    +-- Orchestrator Agent
    +-- XSS Agent
    +-- SQLi Agent
    +-- CSRF Agent
    +-- IDOR Agent
    +-- Header Agent
    +-- Redirect Agent
    |
    v
Aggregator Node
    |
    v
Report Agent
    |
    v
Final Findings and Report
```

## 7.2 Module Design

| Module | File/Directory | Purpose |
|---|---|---|
| Frontend Dashboard | `vuln-scanner/app/page.tsx` | Displays scan input, agent graph, terminal feed, findings, and report |
| API Start Route | `vuln-scanner/app/api/scan/route.ts` | Creates scan job and starts graph execution |
| SSE Stream Route | `vuln-scanner/app/api/scan/[id]/stream/route.ts` | Streams trace events and final results |
| Graph Definition | `vuln-scanner/lib/graph.ts` | Wires orchestrator, agents, aggregator, and reporter |
| Shared State | `vuln-scanner/lib/state.ts` | Defines LangGraph state annotations |
| Shared Types | `vuln-scanner/lib/types.ts` | Defines TraceEvent, Finding, ScanPlan, and ScanReport |
| Tools | `vuln-scanner/lib/tools/index.ts` | Provides controlled HTTP interaction tools |
| Agents | `vuln-scanner/lib/agents/` | Contains all scanner agents and report generator |
| Benchmarks | `benchmarks/` | Provides local vulnerable applications for testing |

## 7.3 State Design

The shared scan state contains:

- `targetUrl`: URL being scanned.
- `scanPlan`: plan generated by the orchestrator.
- `traces`: real-time agent activity logs.
- `findings`: final deduplicated vulnerability list.
- `agentResults`: per-agent findings.
- `report`: final structured report.
- `status`: scan lifecycle state.

Reducers append traces and findings so that parallel agent outputs do not overwrite each other.

## 7.4 User Interface Design

The frontend is implemented as a cyber-security operations dashboard. It includes:

- Target URL input and scan button.
- Live multi-agent graph using React Flow.
- Real-time terminal-style trace feed.
- Agent status indicators.
- Vulnerability cards with severity and evidence.
- Report summary with risk level and severity counts.

# Chapter 8: Implementation

## 8.1 Technology Stack

| Component | Technology |
|---|---|
| Frontend and Backend | Next.js 16 |
| UI Library | React 19 |
| Styling | Tailwind CSS and custom CSS |
| Agent Orchestration | LangGraph |
| Agent Framework | LangChain |
| LLM Provider Integration | OpenRouter through `@langchain/openai` |
| Validation | Zod |
| Language | TypeScript |
| Live Updates | Server-Sent Events |
| Benchmark Servers | Node.js and Express |

## 8.2 Agent Implementation

Each agent is implemented as a separate TypeScript module. The agents use prompts that define their scope, allowed actions, vulnerability-specific checks, and required JSON output format. This design makes it easier to add, remove, or modify vulnerability checks independently.

The orchestrator uses the target HTML snapshot to decide which agents should run. The current graph routes execution conditionally based on `agentsToRun`, so irrelevant scans can be skipped.

## 8.3 Tool Implementation

The scanner exposes four controlled tools:

- `fetchHtml`: retrieves HTML, response status, and response headers.
- `injectPayload`: sends GET or POST requests with controlled parameters.
- `checkHeaders`: retrieves response headers using a HEAD request.
- `followRedirect`: traces redirect chains up to five hops.

These tools limit direct uncontrolled network behavior inside agent logic and keep agent activity auditable.

## 8.4 API and Streaming

The route `POST /api/scan` validates the URL, creates a scan job, and starts the LangGraph workflow in the background. Trace events are stored in memory and emitted through an `EventEmitter`.

The route `GET /api/scan/[id]/stream` opens a Server-Sent Events connection. It sends prior trace events, streams new trace events, and finally sends the completed findings, scan plan, and report.

## 8.5 Report Generation

The report agent receives the deduplicated findings and generates:

- Executive summary.
- Overall risk level.
- Count of findings by severity.
- Per-vulnerability sections.
- Remediation steps.
- OWASP and CWE references.

# Chapter 9: Testing and Results

## 9.1 Test Environment

Testing was designed around local benchmark applications included in the project:

| Benchmark | Location | Vulnerabilities |
|---|---|---|
| XSS and CSRF app | `benchmarks/xss_csrf/server.js` | Reflected XSS, missing CSRF token |
| Missing headers and redirect app | `benchmarks/missing_headers_redirect/server.js` | Missing security headers, open redirect |
| SQLi and IDOR app | `benchmarks/sqli_idor_app/server.js` | SQL Injection, IDOR |
| IDOR and Redirect portal | `benchmarks/idor_redirect_portal/server.js` | IDOR, Open Redirect |

## 9.2 Test Cases

| Test Case | Input | Expected Result |
|---|---|---|
| Invalid URL | Empty or malformed URL | API returns validation error |
| XSS scan | `/search?q=test` benchmark route | XSS Agent detects reflected payload |
| SQLi scan (Login) | Login with `' OR '1'='1` | SQLi Agent detects authentication bypass |
| SQLi scan (Search) | `' UNION SELECT...` in search field | SQLi Agent detects data exfiltration |
| CSRF scan | Profile update form | CSRF Agent detects POST form without token |
| IDOR scan | `/profile?id=1` accessed by user 2 | IDOR Agent detects unauthorized access |
| Header scan | Missing headers benchmark root URL | Header Agent reports absent security headers |
| Redirect scan | `/go?next=https://evil.example.test` | Redirect Agent detects cross-origin redirect |
| Report generation | Any non-empty findings list | Report Agent creates summary and remediation |
| Clean scan | Target with no findings | Informational report is generated |

## 9.3 Observed Results

The implemented scanner successfully demonstrates:

- Creation of independent scan jobs.
- Live trace streaming to the frontend.
- Orchestrator-driven scan planning.
- Parallel specialist agent execution through LangGraph.
- Structured JSON finding extraction.
- Deduplication and severity ordering.
- Final report generation.
- Visual display of agent activity and findings.

## 9.4 Sample Finding Format

```json
{
  "vulnType": "Reflected XSS",
  "severity": "high",
  "location": "http://localhost:8080/search -> param: q",
  "evidence": "Payload '<script>alert(1)</script>' found in response body",
  "recommendation": "HTML-encode all user-controlled output. Implement a Content-Security-Policy header."
}
```

# Chapter 10: Advantages and Limitations

## 10.1 Advantages

- Modular architecture with separate agents for separate vulnerability classes.
- Real-time traceability of agent actions.
- Structured findings and report output.
- Extensible graph workflow.
- Suitable for local educational labs.
- Clear mapping between vulnerabilities and remediation steps.
- Uses typed state and schemas for maintainability.

## 10.2 Limitations

- The scanner depends on LLM availability and configured API keys.
- Detection is heuristic and may produce false positives or false negatives.
- It does not perform full crawling or authenticated session handling.
- It is designed for authorized local/private targets, not public internet scanning.
- It currently focuses on selected common vulnerability classes.
- In-memory scan storage is not suitable for production-scale deployment.

# Chapter 11: Conclusion and Future Scope

## 11.1 Conclusion

The project successfully implements an agentic AI based penetration testing system for authorized web vulnerability assessment. It combines a Next.js dashboard, LangGraph orchestration, LangChain agents, controlled HTTP tools, real-time SSE trace streaming, and AI-generated reporting.

The system demonstrates that agentic workflows can make automated security testing more transparent and modular. Instead of returning only final results, the application shows agent reasoning, scan planning, execution status, vulnerability evidence, and remediation guidance.

## 11.2 Future Scope

Future improvements can include:

- Authenticated scanning with session cookie support.
- Browser-based crawling using Playwright.
- Additional agents for SSRF, file upload flaws, insecure CORS, JWT issues, and API security.
- Persistent database storage for scan history.
- Export to PDF and DOCX directly from the application.
- Role-based access control for team usage.
- Safer rate limiting and target allowlisting.
- Improved deterministic validation to reduce LLM-related false positives.

# References

1. OWASP Foundation, "OWASP Top 10:2021", https://owasp.org/Top10/
2. OWASP Foundation, "Cross Site Scripting Prevention Cheat Sheet", https://cheatsheetseries.owasp.org/
3. OWASP Foundation, "SQL Injection Prevention Cheat Sheet", https://cheatsheetseries.owasp.org/
4. OWASP Foundation, "Cross-Site Request Forgery Prevention Cheat Sheet", https://cheatsheetseries.owasp.org/
5. OWASP Foundation, "Unvalidated Redirects and Forwards Cheat Sheet", https://cheatsheetseries.owasp.org/
6. LangChain Documentation, https://js.langchain.com/
7. LangGraph Documentation, https://langchain-ai.github.io/langgraphjs/
8. Next.js Documentation, https://nextjs.org/docs
9. React Documentation, https://react.dev/
10. Zod Documentation, https://zod.dev/

<div style="page-break-after: always;"></div>

# Appendix A: Project Structure

```text
minorproject/
  Agentic_AI_Penetration_Testing_Report.md
  minorpro2.md
  vuln-scanner/
    app/
      api/
        scan/
          route.ts
          [id]/stream/route.ts
      page.tsx
      globals.css
    lib/
      agents/
      tools/
      graph.ts
      state.ts
      store.ts
      types.ts
    package.json
  benchmarks/
    xss_csrf/
      server.js
    missing_headers_redirect/
      server.js
    sqli_idor_app/
      server.js
      seed.js
    idor_redirect_portal/
      server.js
```

# Appendix B: Installation and Execution

## Run the Scanner

```bash
cd vuln-scanner
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Required Environment Variables

```text
OPENROUTER_KEY1=<api-key>
OPENROUTER_KEY2=<api-key>
OPENROUTER_KEY3=<api-key>
```

## Run Benchmark Applications

```bash
cd benchmarks/xss_csrf
npm install
npm start
```

```bash
cd benchmarks/missing_headers_redirect
npm install
npm start
```

```bash
cd benchmarks/sqli_idor_app
npm install
npm run seed  # Optional: to populate the DB
npm start
```

```bash
cd benchmarks/idor_redirect_portal
npm install
npm start
```

# Appendix C: Ethical Use Statement

This project is intended only for authorized testing of applications owned by the user or explicitly provided as lab targets. Scanning third-party systems without written permission is outside the scope of this project and may be illegal. The system includes authorization context in agent prompts to keep activity aligned with defensive educational testing.

