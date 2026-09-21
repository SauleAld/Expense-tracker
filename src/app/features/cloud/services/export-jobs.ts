import { Injectable, computed, inject, signal } from '@angular/core';
import { ExpenseStore } from '../../../core/expense-store';
import { downloadBlob } from '../../../utils/download';
import { shareUrl, expiryDate, newShareToken } from './sharing';
import type { DestinationId, ExportRequest, HistoryEntry } from '../model/cloud-types';
import { DEMO_SPREADSHEETS, destinationMeta } from '../model/destinations';
import { templateMeta } from '../model/templates';
import { buildReport } from '../reports/report-builders';
import { FORMAT_EXTENSION, ReportLoadError, renderReport, reportToCsv } from '../reports/report-render';
import { CloudStore } from './cloud-store';
import { validateOptions } from './request-validation';

export interface Job {
  id: string;
  title: string;
  destination: DestinationId;
  state: 'running' | 'done' | 'failed';
  stage: string;
  /** 0–1. */
  progress: number;
  detail?: string;
  error?: string;
}

type StageKey = 'prepare' | 'render' | 'connect' | 'send' | 'finish';
interface Stage {
  key: StageKey;
  label: string;
  ms: number;
}

/** A failure with a message that is safe and useful to show to the user. */
export class JobError extends Error {}

function stagesFor(destination: DestinationId): Stage[] {
  const meta = destinationMeta(destination);
  const prepare: Stage = { key: 'prepare', label: 'Preparing report', ms: 350 };
  const render: Stage = { key: 'render', label: 'Generating file', ms: 500 };
  switch (meta.kind) {
    case 'local':
      return [prepare, render, { key: 'finish', label: 'Saving file', ms: 300 }];
    case 'link':
      return [{ ...prepare, label: 'Preparing snapshot' }, { key: 'finish', label: 'Creating link', ms: 600 }];
    case 'email':
      return [
        prepare,
        { ...render, label: 'Creating attachment' },
        { key: 'connect', label: 'Connecting to mail service', ms: 450 },
        { key: 'send', label: 'Sending email', ms: 800 },
        { key: 'finish', label: 'Confirming delivery', ms: 400 },
      ];
    case 'sheets':
      return [
        prepare,
        { key: 'connect', label: `Connecting to ${meta.name}`, ms: 550 },
        { key: 'send', label: 'Writing rows', ms: 900 },
        { key: 'finish', label: 'Syncing formatting', ms: 400 },
      ];
    case 'storage':
      return [
        prepare,
        render,
        { key: 'connect', label: `Connecting to ${meta.name}`, ms: 550 },
        { key: 'send', label: 'Uploading', ms: 900 },
        { key: 'finish', label: 'Verifying upload', ms: 400 },
      ];
  }
}

const TICK_MS = 50;
const DONE_LINGER_MS = 6000;

/**
 * Runs exports in the background. The work that can really happen (building the report, generating the
 * file, downloading it, creating a share link) is real. Talking to email or cloud providers is simulated
 * with staged progress. Jobs live in a root service, so navigating away never interrupts them.
 */
@Injectable({ providedIn: 'root' })
export class ExportJobs {
  private readonly expenses = inject(ExpenseStore);
  private readonly store = inject(CloudStore);

  readonly jobs = signal<Job[]>([]);
  readonly runningCount = computed(() => this.jobs().filter((j) => j.state === 'running').length);

  start(request: ExportRequest): string {
    const id = this.store.newId();
    const title = `${templateMeta(request.template).name} → ${destinationMeta(request.destination).name}`;
    this.jobs.update((list) => [
      ...list,
      { id, title, destination: request.destination, state: 'running', stage: 'Queued', progress: 0 },
    ]);
    void this.run(id, request);
    return id;
  }

  dismiss(id: string): void {
    this.jobs.update((list) => list.filter((j) => j.id !== id));
  }

  private patch(id: string, patch: Partial<Job>): void {
    this.jobs.update((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  private animate(id: string, from: number, to: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const t = Math.min((Date.now() - startedAt) / ms, 1);
        this.patch(id, { progress: from + (to - from) * t });
        if (t >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, TICK_MS);
    });
  }

  private validate(request: ExportRequest): void {
    const problem = validateOptions(request);
    if (problem) throw new JobError(problem);
  }

  private assertConnected(destination: DestinationId): void {
    const meta = destinationMeta(destination);
    if (!meta.provider) return;
    const connection = this.store.connection(meta.provider);
    if (!connection) throw new JobError(`${meta.name} isn’t connected. Connect it under Integrations.`);
    if (connection.status === 'error') {
      throw new JobError(`${meta.name} needs to be reconnected. Sign in again under Integrations.`);
    }
  }

  private async run(id: string, request: ExportRequest): Promise<void> {
    const meta = destinationMeta(request.destination);
    const startedAt = new Date();
    const report = buildReport(request.template, this.expenses.expenses(), request.params, startedAt);
    const filename = `${report.stem}.${FORMAT_EXTENSION[request.format]}`;
    const rowCount = report.rows.filter((r) => r.kind === 'data').length;

    let blob: Blob | null = null;
    let bytes = 0;
    let detail = '';

    try {
      this.validate(request);
      const stages = stagesFor(request.destination);

      for (const [i, stage] of stages.entries()) {
        this.patch(id, { stage: stage.label });
        const work = async (): Promise<void> => {
          if (stage.key === 'connect') this.assertConnected(request.destination);
          if (stage.key === 'render') blob = await renderReport(request.format, report, startedAt);
          if (stage.key === 'finish') {
            const result = this.finish(request, meta.kind, report, blob, filename, rowCount);
            detail = result.detail;
            bytes = result.bytes;
          }
        };
        await Promise.all([this.animate(id, i / stages.length, (i + 1) / stages.length, stage.ms), work()]);
      }

      this.record(request, {
        status: 'completed',
        records: report.recordCount,
        bytes,
        filename,
        detail,
      });
      this.patch(id, { state: 'done', progress: 1, stage: 'Done', detail });
      setTimeout(() => this.dismiss(id), DONE_LINGER_MS);
    } catch (error) {
      const message =
        error instanceof JobError
          ? error.message
          : error instanceof ReportLoadError
            ? 'Couldn’t load the PDF generator. Check your connection, then reload the page.'
            : 'Something went wrong while exporting. Please try again.';
      if (!(error instanceof JobError)) console.error('Export failed', error);
      this.record(request, { status: 'failed', records: 0, bytes: 0, filename, detail: '', error: message });
      this.patch(id, { state: 'failed', error: message, stage: 'Failed' });
    }
  }

  /** The last step: the part with a lasting effect. */
  private finish(
    request: ExportRequest,
    kind: ReturnType<typeof destinationMeta>['kind'],
    report: ReturnType<typeof buildReport>,
    blob: Blob | null,
    filename: string,
    rowCount: number,
  ): { detail: string; bytes: number } {
    const { options } = request;
    switch (kind) {
      case 'local':
        downloadBlob(filename, blob!);
        return { detail: `Downloaded ${filename}`, bytes: blob!.size };
      case 'email':
        return { detail: `Sent to ${options.email.to.join(', ')}`, bytes: blob!.size };
      case 'storage':
        return {
          detail: `${destinationMeta(request.destination).name}: ${options.storage.folder}/${filename}`,
          bytes: blob!.size,
        };
      case 'sheets': {
        const name =
          DEMO_SPREADSHEETS.find((s) => s.id === options.sheets.spreadsheet)?.name.replace(/^New spreadsheet: "(.*)"$/, '$1') ??
          'Spreadsheet';
        return {
          detail: `${name} › ${options.sheets.tab} · ${rowCount} rows (${options.sheets.mode})`,
          bytes: new Blob([reportToCsv(report)]).size,
        };
      }
      case 'link': {
        const now = new Date();
        const id = newShareToken();
        this.store.addShare({
          id,
          template: request.template,
          createdAt: now.toISOString(),
          expiresAt: expiryDate(options.link.expiresIn, now),
          allowDownload: options.link.allowDownload,
          views: 0,
          revoked: false,
          snapshot: report,
        });
        return { detail: shareUrl(id), bytes: new Blob([JSON.stringify(report)]).size };
      }
    }
  }

  private record(
    request: ExportRequest,
    outcome: Pick<HistoryEntry, 'status' | 'records' | 'bytes' | 'filename' | 'detail' | 'error'>,
  ): void {
    const meta = destinationMeta(request.destination);
    this.store.addHistory({
      id: this.store.newId(),
      at: new Date().toISOString(),
      template: request.template,
      format: request.format,
      destination: request.destination,
      trigger: request.trigger,
      catchUp: request.catchUp,
      scheduleId: request.scheduleId,
      request: {
        template: request.template,
        params: request.params,
        format: request.format,
        destination: request.destination,
        options: request.options,
      },
      ...outcome,
    });
    if (meta.provider && outcome.status === 'completed') {
      this.store.patchConnection(meta.provider, { lastSyncAt: new Date().toISOString() });
    }
    if (request.scheduleId) {
      // Covers "Run now" as well as timed runs, so "Last run" always matches the result shown beside it.
      this.store.patchSchedule(request.scheduleId, { lastStatus: outcome.status, lastRunAt: new Date().toISOString() });
    }
  }
}
