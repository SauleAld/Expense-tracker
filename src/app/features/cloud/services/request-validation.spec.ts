import type { Connection, DestinationId } from '../model/cloud-types';
import { defaultOptions } from '../model/destinations';
import { blockedReason, validateOptions } from './request-validation';

const req = (destination: DestinationId, patch: Partial<ReturnType<typeof defaultOptions>> = {}) => ({
  destination,
  options: { ...defaultOptions('Report'), ...patch },
});
const conn = (status: Connection['status'] = 'connected'): Connection => ({
  provider: 'dropbox',
  status,
  account: 'a',
  connectedAt: '2026-01-01T00:00:00.000Z',
  lastSyncAt: null,
});

describe('validateOptions', () => {
  it('requires a recipient and subject for email', () => {
    expect(validateOptions(req('email'))).toMatch(/recipient/);
    const to = ['a@b.co'];
    expect(validateOptions(req('email', { email: { to, subject: '  ', message: '' } }))).toMatch(/subject/);
    expect(validateOptions(req('email', { email: { to, subject: 'Hi', message: '' } }))).toBeNull();
  });

  it('requires a sheet tab name of at most 50 characters', () => {
    expect(validateOptions(req('sheets', { sheets: { spreadsheet: 'new', tab: ' ', mode: 'create' } }))).toMatch(/Name the sheet tab/);
    expect(validateOptions(req('sheets', { sheets: { spreadsheet: 'new', tab: 'x'.repeat(51), mode: 'create' } }))).toMatch(/50/);
    expect(validateOptions(req('sheets'))).toBeNull();
  });

  it('has no requirements for download, link or storage', () => {
    expect(validateOptions(req('download'))).toBeNull();
    expect(validateOptions(req('link'))).toBeNull();
    expect(validateOptions(req('dropbox'))).toBeNull();
  });
});

describe('blockedReason', () => {
  it('asks to connect a provider that is not connected', () => {
    expect(blockedReason(req('dropbox'), [])).toBe('Connect Dropbox to continue.');
  });
  it('asks to reconnect a provider whose sign-in expired', () => {
    expect(blockedReason(req('dropbox'), [conn('error')])).toBe('Dropbox needs to be reconnected.');
  });
  it('is clear when connected and valid, and does not require connections for non-providers', () => {
    expect(blockedReason(req('dropbox'), [conn()])).toBeNull();
    expect(blockedReason(req('download'), [])).toBeNull();
  });
});
