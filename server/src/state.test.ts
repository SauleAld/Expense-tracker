import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../test/helpers.ts';
import { StateStore } from './state.ts';

describe('StateStore', () => {
  it('creates a random API token once and keeps it across restarts', () => {
    const dir = tempDir();
    const first = new StateStore(dir).get().apiToken;
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(new StateStore(dir).get().apiToken).toBe(first);
    expect(new StateStore(tempDir()).get().apiToken).not.toBe(first);
  });

  it('persists changes', () => {
    const dir = tempDir();
    new StateStore(dir).update((s) => {
      s.accessUrl = 'https://u:p@x.example/s';
      s.nextSeq = 42;
    });
    const again = new StateStore(dir).get();
    expect(again.accessUrl).toBe('https://u:p@x.example/s');
    expect(again.nextSeq).toBe(42);
  });

  it.skipIf(process.platform === 'win32')('keeps the folder and file private (it holds the access URL)', () => {
    const dir = path.join(tempDir(), 'data');
    new StateStore(dir);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'state.json')).mode & 0o777).toBe(0o600);
  });

  it('starts fresh, without crashing, when the file is corrupt', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'state.json'), '{oops');
    const state = new StateStore(dir).get();
    expect(state.accessUrl).toBeNull();
    expect(state.apiToken).toHaveLength(48);
  });

  it('repairs wrongly typed fields', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ apiToken: 5, accessUrl: 7, transactions: 'x', requestLog: ['a', 3], nextSeq: -4 }));
    const state = new StateStore(dir).get();
    expect(state.apiToken).toHaveLength(48);
    expect(state.accessUrl).toBeNull();
    expect(state.transactions).toEqual([]);
    expect(state.requestLog).toEqual([3]);
    expect(state.nextSeq).toBe(1);
  });

  it('leaves no temp files behind after writing', () => {
    const dir = tempDir();
    const store = new StateStore(dir);
    store.update((s) => void (s.nextSeq = 2));
    expect(fs.readdirSync(dir)).toEqual(['state.json']);
  });
});
