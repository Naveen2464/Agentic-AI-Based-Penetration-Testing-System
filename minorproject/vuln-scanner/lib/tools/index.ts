// lib/tools/index.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// ─── Tool 1: fetchHtml ──────────────────────────────────────────────────────
// Used by: XSS, SQLi, CSRF, IDOR, Header agents
// Purpose: Retrieve the full HTML of a page for DOM analysis

export const fetchHtmlTool = new DynamicStructuredTool({
  name: 'fetchHtml',
  description:
    'Fetch the raw HTML of a URL. Use to inspect DOM structure, forms, ' +
    'scripts, input fields, and meta tags. Returns status code and body.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'VulnScanner/1.0' },
    });
    const body = await res.text();
    return JSON.stringify({
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: body.slice(0, 8000), // truncate to save tokens
    });
  },
});

// ─── Tool 2: injectPayload ──────────────────────────────────────────────────
// Used by: XSS, SQLi, IDOR, Redirect agents
// Purpose: Submit a request with injected test values via GET or POST

export const injectPayloadTool = new DynamicStructuredTool({
  name: 'injectPayload',
  description:
    'Submit a GET or POST request with injected test parameters. ' +
    'Use for XSS payload injection, SQL injection, IDOR ID enumeration, ' +
    'and open redirect parameter testing. Provide params as key/value items. ' +
    'Returns status, location header, and response body.',
  schema: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST']),
    params: z
      .array(
        z.object({
          key: z.string().describe('Parameter or form field name'),
          value: z.string().describe('Injected value for this parameter'),
        })
      )
      .describe('Key-value pairs to inject as params or body fields'),
  }),
  func: async ({ url, method, params }) => {
    const payloadParams = Object.fromEntries(
      params.map(({ key, value }) => [key, value])
    );
    let res: Response;

    if (method === 'GET') {
      const qs = new URLSearchParams(payloadParams).toString();
      res = await fetch(`${url}?${qs}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'VulnScanner/1.0' },
      });
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VulnScanner/1.0',
        },
        body: new URLSearchParams(payloadParams).toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
    }

    const body = await res.text().catch(() => '');
    return JSON.stringify({
      status: res.status,
      location: res.headers.get('location'),
      body: body.slice(0, 4000),
    });
  },
});

// ─── Tool 3: checkHeaders ───────────────────────────────────────────────────
// Used by: Header agent (primary), CSRF agent (secondary)
// Purpose: Inspect HTTP response headers without downloading the full body

export const checkHeadersTool = new DynamicStructuredTool({
  name: 'checkHeaders',
  description:
    'Fetch only the HTTP response headers from a URL using a HEAD request. ' +
    'Use to check for security headers: Content-Security-Policy, ' +
    'Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, ' +
    'Referrer-Policy, Permissions-Policy. Also returns Set-Cookie attributes.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'VulnScanner/1.0' },
    });
    return JSON.stringify(Object.fromEntries(res.headers.entries()));
  },
});

// ─── Tool 4: followRedirect ─────────────────────────────────────────────────
// Used by: Redirect agent (primary)
// Purpose: Trace the full redirect chain to detect open redirect destinations

export const followRedirectTool = new DynamicStructuredTool({
  name: 'followRedirect',
  description:
    'Follow a URL and return the complete redirect chain (up to 5 hops). ' +
    'Use to detect open redirects — if the final destination is on a different ' +
    'domain than the original, it is potentially an open redirect vulnerability.',
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    const chain: string[] = [url];
    let current = url;

    for (let i = 0; i < 5; i++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'VulnScanner/1.0' },
      });
      const loc = res.headers.get('location');
      if (!loc) break;
      chain.push(loc);
      current = loc.startsWith('http') ? loc : new URL(loc, current).href;
    }

    const originalHost = new URL(url).hostname;
    const finalHost = new URL(current).hostname;

    return JSON.stringify({
      chain,
      final: current,
      crossOrigin: originalHost !== finalHost,
      originalHost,
      finalHost,
    });
  },
});
