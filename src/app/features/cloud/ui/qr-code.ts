import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { encode } from 'uqr';

/**
 * A real, scannable QR code. It is drawn as one SVG path from the encoded matrix, so no HTML is
 * injected. Always dark-on-white: scanners need that contrast even in dark mode.
 */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <svg
      class="block h-full w-full rounded-lg"
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="'0 0 ' + qr().size + ' ' + qr().size"
      shape-rendering="crispEdges"
    >
      <rect [attr.width]="qr().size" [attr.height]="qr().size" fill="#ffffff" />
      <path [attr.d]="qr().path" fill="#000000" />
    </svg>
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('QR code');

  protected readonly qr = computed(() => {
    // Quiet zone of 2 modules keeps it scannable on any background.
    const { data, size } = encode(this.value(), { ecc: 'M', border: 2 });
    let path = '';
    data.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x++;
        path += `M${start},${y}h${x - start}v1h-${x - start}z`;
      }
    });
    return { size, path };
  });
}
