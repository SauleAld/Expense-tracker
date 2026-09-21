import type { IconName } from '../../../shared/icon';
import type {
  DestinationId,
  DestinationOptions,
  ProviderId,
  ScheduledDestinationId,
  TemplateId,
} from './cloud-types';

export interface DestinationMeta {
  id: DestinationId;
  name: string;
  description: string;
  icon: IconName;
  /** Tile background. Generic glyphs are used on purpose: these are demo integrations, not real brands' assets. */
  color: string;
  kind: 'local' | 'email' | 'sheets' | 'storage' | 'link';
  provider?: ProviderId;
  /** Label of the primary button. */
  action: string;
  /** Whether a file format applies (Sheets writes rows; links show a snapshot). */
  needsFormat: boolean;
  /** Whether it can run unattended on a schedule. */
  scheduled: boolean;
  /** Simulated storage quota. */
  quotaBytes?: number;
  /** What the (simulated) consent screen lists. */
  permissions?: string[];
}

const GB = 1024 ** 3;

export const DESTINATIONS: readonly DestinationMeta[] = [
  {
    id: 'download',
    name: 'Download',
    description: 'Save a file to this device',
    icon: 'download',
    color: '#52514e',
    kind: 'local',
    action: 'Download file',
    needsFormat: true,
    scheduled: false,
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send the report as an attachment',
    icon: 'mail',
    color: '#7c5cd6',
    kind: 'email',
    action: 'Send email',
    needsFormat: true,
    scheduled: true,
  },
  {
    id: 'link',
    name: 'Share link',
    description: 'Link and QR code to a read-only snapshot',
    icon: 'link',
    color: '#0e8f8f',
    kind: 'link',
    action: 'Create share link',
    needsFormat: false,
    scheduled: false,
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Send rows straight into a spreadsheet',
    icon: 'table',
    color: '#188038',
    kind: 'sheets',
    provider: 'sheets',
    action: 'Sync to Google Sheets',
    needsFormat: false,
    scheduled: true,
    permissions: [
      'See and edit spreadsheets you choose with Spendwise',
      'Create a spreadsheet for Spendwise exports',
    ],
  },
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Save files to a Drive folder',
    icon: 'cloud',
    color: '#1a73e8',
    kind: 'storage',
    provider: 'gdrive',
    action: 'Upload to Google Drive',
    needsFormat: true,
    scheduled: true,
    quotaBytes: 15 * GB,
    permissions: ['Create and manage files that Spendwise creates', 'See the folders you pick for exports'],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Save files to a Dropbox folder',
    icon: 'folder',
    color: '#0061ff',
    kind: 'storage',
    provider: 'dropbox',
    action: 'Upload to Dropbox',
    needsFormat: true,
    scheduled: true,
    quotaBytes: 2 * GB,
    permissions: ['Create files in the Apps/Spendwise folder', 'Read the files Spendwise creates'],
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Save files to a OneDrive folder',
    icon: 'cloud',
    color: '#0f6cbd',
    kind: 'storage',
    provider: 'onedrive',
    action: 'Upload to OneDrive',
    needsFormat: true,
    scheduled: true,
    quotaBytes: 5 * GB,
    permissions: ['Create and update files in your OneDrive app folder', 'Read the files Spendwise creates'],
  },
];

export const destinationMeta = (id: DestinationId): DestinationMeta => DESTINATIONS.find((d) => d.id === id)!;
export const PROVIDERS: readonly DestinationMeta[] = DESTINATIONS.filter((d) => d.provider);
export const SCHEDULABLE: readonly DestinationMeta[] = DESTINATIONS.filter((d) => d.scheduled);
export const isScheduled = (id: DestinationId): id is ScheduledDestinationId => destinationMeta(id).scheduled;

// ---- Demo content for pickers ----

export const DEMO_SPREADSHEETS = [
  { id: 'new', name: 'New spreadsheet: "Spendwise Export"' },
  { id: 'budget', name: 'Household Budget 2026' },
  { id: 'tax-prep', name: 'Tax prep' },
] as const;

export const DEMO_FOLDERS = [
  '/Apps/Spendwise',
  '/Apps/Spendwise/Reports',
  '/Documents/Finance',
  '/Documents/Finance/Tax',
] as const;

export const DEMO_ACCOUNT = 'demo.user@example.com';

export function defaultOptions(templateTitle: string): DestinationOptions {
  return {
    email: {
      to: [],
      subject: `Your ${templateTitle} from Spendwise`,
      message: 'Hi,\n\nAttached is the latest report from Spendwise.',
    },
    sheets: { spreadsheet: 'new', tab: 'Spendwise', mode: 'create' },
    storage: { folder: '/Apps/Spendwise' },
    link: { expiresIn: '7d', allowDownload: true },
  };
}

export const templateTitle: Record<TemplateId, string> = {
  tax: 'Tax Report',
  monthly: 'Monthly Summary',
  category: 'Category Analysis',
  ledger: 'Full Ledger',
};
