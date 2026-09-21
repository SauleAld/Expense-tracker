import path from 'node:path';

export interface Config {
  port: number;
  /** Always the loopback address unless overridden: this server holds your bank access token. */
  host: string;
  dataDir: string;
  /** Browser origins allowed to call the API. */
  allowedOrigins: string[];
  /** Hard cap on requests to SimpleFIN in any rolling 24 hours (they ask for 24 or fewer). */
  maxRequestsPerDay: number;
  /** How far back the very first sync reaches. */
  initialDays: number;
  autoSync: boolean;
  /** How often to look at whether an automatic sync is due. */
  checkEveryMs: number;
  /** Time between automatic syncs. */
  syncEveryMs: number;
  /** Shortest gap between two manual "Sync now" requests. */
  minManualIntervalMs: number;
}

const HOUR = 3_600_000;

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: positiveInt(env['SPENDWISE_PORT'], 3111),
    host: env['SPENDWISE_HOST'] || '127.0.0.1',
    dataDir: env['SPENDWISE_DATA_DIR'] || path.resolve(import.meta.dirname, '..', 'data'),
    allowedOrigins: (env['SPENDWISE_ALLOWED_ORIGINS'] || 'http://localhost:4200,http://127.0.0.1:4200')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    maxRequestsPerDay: positiveInt(env['SPENDWISE_MAX_REQUESTS_PER_DAY'], 4),
    initialDays: positiveInt(env['SPENDWISE_INITIAL_DAYS'], 90),
    autoSync: env['SPENDWISE_AUTO_SYNC'] !== 'off',
    checkEveryMs: positiveInt(env['SPENDWISE_CHECK_EVERY_MS'], 15 * 60_000),
    syncEveryMs: positiveInt(env['SPENDWISE_SYNC_EVERY_MS'], 24 * HOUR),
    minManualIntervalMs: positiveInt(env['SPENDWISE_MIN_MANUAL_INTERVAL_MS'], 60_000),
  };
}
