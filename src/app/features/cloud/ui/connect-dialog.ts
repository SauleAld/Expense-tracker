import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ToastService } from '../../../core/toast';
import { Icon } from '../../../shared/icon';
import { Spinner } from '../../../shared/spinner';
import { DEMO_ACCOUNT, destinationMeta } from '../model/destinations';
import { CloudStore } from '../services/cloud-store';
import { ConnectFlow } from '../services/connect-flow';
import { DestTile } from './dest-tile';

/**
 * A simulated "sign in and allow access" screen. It deliberately has no email or password
 * fields: nothing is contacted and nothing is collected.
 */
@Component({
  selector: 'app-connect-dialog',
  imports: [Icon, Spinner, DestTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connect-dialog.html',
})
export class ConnectDialog {
  private readonly flow = inject(ConnectFlow);
  private readonly store = inject(CloudStore);
  private readonly toast = inject(ToastService);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  private attempt = 0;

  protected readonly demoAccount = DEMO_ACCOUNT;
  protected readonly authorizing = signal(false);
  protected readonly meta = computed(() => {
    const provider = this.flow.provider();
    return provider ? destinationMeta(provider) : null;
  });
  protected readonly reconnecting = computed(() => {
    const provider = this.flow.provider();
    return !!provider && this.store.connection(provider)?.status === 'error';
  });

  constructor() {
    effect(() => {
      const open = this.flow.provider() !== null;
      const el = this.dialogEl()?.nativeElement;
      if (!el) return;
      if (open) {
        untracked(() => {
          if (el.open) return;
          this.attempt++;
          this.authorizing.set(false);
          el.showModal();
        });
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected close(): void {
    this.attempt++;
    this.flow.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl()?.nativeElement && !this.authorizing()) this.close();
  }

  protected allow(): void {
    const provider = this.flow.provider();
    const meta = this.meta();
    if (!provider || !meta) return;
    const attempt = ++this.attempt;
    this.authorizing.set(true);
    // Stands in for the redirect to the provider and back.
    setTimeout(() => {
      if (attempt !== this.attempt) return;
      this.store.connect(provider);
      this.toast.show(`${meta.name} connected (demo)`);
      this.flow.close();
    }, 1200);
  }
}
