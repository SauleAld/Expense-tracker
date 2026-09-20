import { DestroyRef, Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/** Exposes an element's rendered width as a signal so SVG charts can draw at true pixel size. */
@Directive({ selector: '[appMeasure]', exportAs: 'appMeasure' })
export class Measure {
  readonly width = signal(0);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // A hidden element (e.g. the inactive Chart/Table tab) reports 0; keep the last real width.
      const update = (w: number) => w > 0 && this.width.set(Math.floor(w));
      update(el.clientWidth);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => entry && update(entry.contentRect.width));
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
