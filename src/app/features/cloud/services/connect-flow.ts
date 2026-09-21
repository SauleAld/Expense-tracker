import { Injectable, signal } from '@angular/core';
import type { ProviderId } from '../model/cloud-types';

/** Which provider's (simulated) sign-in dialog is open. Lets any tab start a connection. */
@Injectable({ providedIn: 'root' })
export class ConnectFlow {
  readonly provider = signal<ProviderId | null>(null);

  open(provider: ProviderId): void {
    this.provider.set(provider);
  }

  close(): void {
    this.provider.set(null);
  }
}
