// lib/store.ts
import { EventEmitter } from 'events';
import type { ScanJob } from './types';

// Global store to persist across API routes
// In a real app, this would be Redis or a database
const globalForStore = global as unknown as {
  jobs: Map<string, ScanJob> | undefined;
  emitters: Map<string, EventEmitter> | undefined;
};

export const jobs = globalForStore.jobs ?? new Map<string, ScanJob>();
export const emitters = globalForStore.emitters ?? new Map<string, EventEmitter>();

if (process.env.NODE_ENV !== 'production') {
  globalForStore.jobs = jobs;
  globalForStore.emitters = emitters;
}
