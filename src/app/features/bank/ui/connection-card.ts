import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../../../shared/icon';
import { Spinner } from '../../../shared/spinner';
import { formatCurrency } from '../../../utils/format';
import { formatFuture, formatRelative } from '../../../utils/relative-time';
import { BankApi } from '../services/bank-api';
import { BankConnection } from '../services/bank-connection';

@Component({
  selector: 'app-connection-card',
  imports: [Icon, Spinner, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connection-card.html',
})
export class ConnectionCard {
  protected readonly conn = inject(BankConnection);
  protected readonly api = inject(BankApi);
  protected readonly formatCurrency = formatCurrency;

  protected readonly pairingToken = signal('');
  protected readonly setupToken = signal('');
  protected readonly confirmingDisconnect = signal(false);
  private disarm: ReturnType<typeof setTimeout> | undefined;

  protected readonly lastSync = computed(() => {
    const at = this.conn.status()?.lastSyncAt;
    return at ? formatRelative(new Date(at), this.conn.now()) : 'not yet';
  });
  protected readonly nextSync = computed(() => {
    const at = this.conn.status()?.nextSyncAt;
    return at ? formatFuture(new Date(at), this.conn.now()) : null;
  });

  protected async pair(): Promise<void> {
    const token = this.pairingToken();
    this.pairingToken.set('');
    await this.conn.pair(token);
  }

  protected async connect(): Promise<void> {
    const token = this.setupToken();
    await this.conn.connect(token);
    // A setup token works once, so there is nothing to keep once it has been used.
    if (this.conn.connected()) this.setupToken.set('');
  }

  /** Two clicks to disconnect; the prompt disarms itself after a few seconds. */
  protected disconnect(): void {
    if (!this.confirmingDisconnect()) {
      this.confirmingDisconnect.set(true);
      clearTimeout(this.disarm);
      this.disarm = setTimeout(() => this.confirmingDisconnect.set(false), 4000);
      return;
    }
    clearTimeout(this.disarm);
    this.confirmingDisconnect.set(false);
    void this.conn.disconnect();
  }
}
