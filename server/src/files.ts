import fs from 'node:fs';
import path from 'node:path';

/** Reads JSON, returning `fallback` when the file is missing or unreadable. */
export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Writes atomically (temp file, then rename) so a crash mid-write can't leave a half-written state file,
 * and privately: the folder is 0700 and the file 0600, because it holds the bank access token.
 */
export function writeJsonPrivate(file: string, data: unknown): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
