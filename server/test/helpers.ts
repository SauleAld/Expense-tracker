import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../src/config.ts';

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spendwise-server-test-'));
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: tempDir(),
    allowedOrigins: ['http://localhost:4200'],
    maxRequestsPerDay: 50,
    initialDays: 90,
    autoSync: true,
    checkEveryMs: 60_000,
    syncEveryMs: 24 * 3_600_000,
    minManualIntervalMs: 60_000,
    ...overrides,
  };
}

/** A controllable clock. */
export function clock(start = Date.parse('2026-09-20T15:00:00Z')) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), set: (v: number) => void (t = v) };
}
