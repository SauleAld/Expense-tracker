import { Injectable, signal } from '@angular/core';

/** Lets any page open the export dialog that lives in the app shell. */
@Injectable({ providedIn: 'root' })
export class ExportDialogController {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
