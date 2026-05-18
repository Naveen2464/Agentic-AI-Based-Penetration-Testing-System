// lib/agents/utils.ts
import type { Finding } from '../types';

export const AUTHORIZED_LAB_CONTEXT = `Authorization and scope:
- This scanner is running for a university security project against benchmark web apps owned by the user.
- The target is expected to be a local or private lab URL controlled by the user.
- Your role is defensive testing and reporting only. Do not provide instructions for attacking third-party systems.
- You may use the provided tools to make the specific HTTP requests needed for this assessment.
- Do not refuse solely because this is vulnerability testing; stay within this authorized lab scope.
- If the target cannot be assessed, return [] as the final answer.`;

export const JSON_ARRAY_OUTPUT_RULE = `Final output rule:
Return ONLY a raw JSON array matching the requested finding schema. Do not use markdown fences, apologies, policy text, or explanatory prose in the final answer. Return [] if no finding is confirmed.`;

export function messageContentToText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(messageContentToText).filter(Boolean).join('\n');
  }
  if (typeof content === 'object') {
    const record = content as Record<string, unknown>;
    for (const key of ['text', 'output_text', 'input_text', 'content']) {
      if (typeof record[key] === 'string') return record[key];
      if (Array.isArray(record[key])) return messageContentToText(record[key]);
    }
    return JSON.stringify(content);
  }
  return String(content);
}

export function parseFindings(raw: string, agentName: string): Finding[] {
  try {
    // Strip markdown code fences if present
    const clean = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Extract JSON array from the string
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (f): f is Finding =>
        typeof f.vulnType === 'string' &&
        typeof f.severity === 'string' &&
        typeof f.location === 'string'
    );
  } catch {
    console.error(`[${agentName}] Failed to parse findings from:`, raw.slice(0, 200));
    return [];
  }
}
