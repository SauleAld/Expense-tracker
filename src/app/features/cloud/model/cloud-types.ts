import type { Report } from '../reports/report-types';

export type TemplateId = 'tax' | 'monthly' | 'category' | 'ledger';
export type FormatId = 'csv' | 'json' | 'pdf';
export type ProviderId = 'sheets' | 'gdrive' | 'dropbox' | 'onedrive';
export type DestinationId = 'download' | 'email' | 'link' | ProviderId;
/** Destinations that can run unattended (a download needs someone at the keyboard). */
export type ScheduledDestinationId = 'email' | ProviderId;

export interface TemplateParams {
  /** Tax Report. */
  year: number;
  /** Monthly Summary. */
  months: 3 | 6 | 12;
  /** Category Analysis. */
  period: 'all' | 'year' | '90d';
}

export interface EmailOptions {
  to: string[];
  subject: string;
  message: string;
}
export interface SheetsOptions {
  /** `new` or the id of an existing (demo) spreadsheet. */
  spreadsheet: string;
  tab: string;
  mode: 'create' | 'append' | 'replace';
}
export interface StorageOptions {
  folder: string;
}
export type LinkExpiry = '1h' | '24h' | '7d' | '30d' | 'never';
export interface LinkOptions {
  expiresIn: LinkExpiry;
  allowDownload: boolean;
}

/** Every destination's settings live side by side so switching destinations never loses input. */
export interface DestinationOptions {
  email: EmailOptions;
  sheets: SheetsOptions;
  storage: StorageOptions;
  link: LinkOptions;
}

export type Trigger = 'manual' | 'scheduled';

export interface ExportRequest {
  template: TemplateId;
  params: TemplateParams;
  format: FormatId;
  destination: DestinationId;
  options: DestinationOptions;
  trigger: Trigger;
  scheduleId?: string;
  /** True when a scheduled run was due while the app was closed and ran on open. */
  catchUp?: boolean;
}

// ---- Persisted records ----

export interface Connection {
  provider: ProviderId;
  /** `error` = the (simulated) login expired and needs reconnecting. */
  status: 'connected' | 'error';
  account: string;
  connectedAt: string;
  lastSyncAt: string | null;
}

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface Schedule {
  id: string;
  name: string;
  template: TemplateId;
  params: TemplateParams;
  format: FormatId;
  destination: ScheduledDestinationId;
  options: DestinationOptions;
  frequency: Frequency;
  /** 0 = Sunday … 6 = Saturday. Used when weekly. */
  weekday: number;
  /** 1–28. Used when monthly. */
  dayOfMonth: number;
  /** Local time, `HH:MM`. */
  time: string;
  enabled: boolean;
  createdAt: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'completed' | 'failed' | null;
}

export interface HistoryEntry {
  id: string;
  at: string;
  template: TemplateId;
  format: FormatId;
  destination: DestinationId;
  records: number;
  bytes: number;
  status: 'completed' | 'failed';
  error?: string;
  trigger: Trigger;
  catchUp?: boolean;
  scheduleId?: string;
  filename: string;
  /** Human-readable outcome, e.g. the folder written to or the recipients. */
  detail: string;
  /** Kept so "Run again" repeats exactly what ran. */
  request: Pick<ExportRequest, 'template' | 'params' | 'format' | 'destination' | 'options'>;
}

export interface ShareLink {
  /** Random token used in the URL. */
  id: string;
  template: TemplateId;
  createdAt: string;
  expiresAt: string | null;
  allowDownload: boolean;
  views: number;
  revoked: boolean;
  /** The data as it was when the link was created. */
  snapshot: Report;
}
