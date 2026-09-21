import type { LinkExpiry, ShareLink } from '../model/cloud-types';

const HOUR = 3_600_000;
const EXPIRY_MS: Record<Exclude<LinkExpiry, 'never'>, number> = {
  '1h': HOUR,
  '24h': 24 * HOUR,
  '7d': 7 * 24 * HOUR,
  '30d': 30 * 24 * HOUR,
};

export const EXPIRY_LABEL: Record<LinkExpiry, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  never: 'Never',
};

export function expiryDate(expiresIn: LinkExpiry, now: Date): string | null {
  return expiresIn === 'never' ? null : new Date(now.getTime() + EXPIRY_MS[expiresIn]).toISOString();
}

export type ShareStatus = 'active' | 'expired' | 'revoked';

export function shareStatus(link: Pick<ShareLink, 'revoked' | 'expiresAt'>, now: Date): ShareStatus {
  if (link.revoked) return 'revoked';
  if (link.expiresAt && new Date(link.expiresAt) <= now) return 'expired';
  return 'active';
}

/** 12 random base-36 characters (~62 bits). Not a secret store; it just makes links hard to guess. */
export function newShareToken(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

export const shareUrl = (id: string, origin: string = location.origin): string => `${origin}/shared/${id}`;
