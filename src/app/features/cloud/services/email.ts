const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value: string): boolean => EMAIL.test(value.trim());

/** Splits pasted text on commas, semicolons, spaces and newlines. */
export function splitRecipients(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
