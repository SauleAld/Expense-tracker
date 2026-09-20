import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; run: () => void };
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = signal<Toast[]>([]);

  show(message: string, options: Partial<Pick<Toast, 'kind' | 'action'>> = {}): void {
    const toast: Toast = { id: this.nextId++, kind: options.kind ?? 'success', message, action: options.action };
    // Keep the stack short: newest three.
    this.toasts.update((list) => [...list, toast].slice(-3));
    // Toasts with an action stay a little longer so the action is reachable.
    this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), toast.action ? 7000 : 4000));
  }

  error(message: string): void {
    this.show(message, { kind: 'error' });
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
