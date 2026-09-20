import { toISODate } from '../../utils/dates';

export const MAX_FILENAME_LENGTH = 100;

// Characters that are illegal in file names on Windows/macOS/Linux, plus control characters.
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/;
const KNOWN_EXTENSION = /\.(csv|json|pdf)$/i;

export function defaultBaseName(now: Date = new Date()): string {
  return `spendwise-expenses-${toISODate(now)}`;
}

/** Returns an error message, or null when the name (without extension) is usable. */
export function validateFilename(base: string): string | null {
  const name = base.trim();
  if (!name) return 'Enter a file name.';
  if (ILLEGAL.test(name)) return 'File names can’t contain \\ / : * ? " < > |';
  if (name.length > MAX_FILENAME_LENGTH) return `Keep it under ${MAX_FILENAME_LENGTH} characters.`;
  if (name.endsWith('.')) return 'File names can’t end with a dot.';
  return null;
}

/** Appends the format's extension, without doubling it if the user already typed one. */
export function fullFilename(base: string, extension: string): string {
  return `${base.trim().replace(KNOWN_EXTENSION, '')}.${extension}`;
}
