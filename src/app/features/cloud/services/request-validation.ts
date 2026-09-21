import type { Connection, ExportRequest } from '../model/cloud-types';
import { destinationMeta } from '../model/destinations';

/** Problems with the destination's own settings, independent of whether an account is connected. */
export function validateOptions(request: Pick<ExportRequest, 'destination' | 'options'>): string | null {
  const { options } = request;
  switch (destinationMeta(request.destination).kind) {
    case 'email':
      if (options.email.to.length === 0) return 'Add at least one recipient.';
      if (!options.email.subject.trim()) return 'Add a subject line.';
      return null;
    case 'sheets':
      if (!options.sheets.tab.trim()) return 'Name the sheet tab.';
      if (options.sheets.tab.length > 50) return 'Sheet tab names can be at most 50 characters.';
      return null;
    default:
      return null;
  }
}

/** Why a request can't run yet, or null when it can. */
export function blockedReason(
  request: Pick<ExportRequest, 'destination' | 'options'>,
  connections: readonly Connection[],
): string | null {
  const meta = destinationMeta(request.destination);
  if (meta.provider) {
    const connection = connections.find((c) => c.provider === meta.provider);
    if (!connection) return `Connect ${meta.name} to continue.`;
    if (connection.status === 'error') return `${meta.name} needs to be reconnected.`;
  }
  return validateOptions(request);
}
