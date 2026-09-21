import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** A "now" signal that ticks every 30s so relative times ("5 min ago", "in 2 h") stay fresh. */
@Injectable({ providedIn: 'root' })
export class Clock {
  readonly now = signal(new Date());

  constructor() {
    const id = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
