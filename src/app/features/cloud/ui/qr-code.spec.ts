import { TestBed } from '@angular/core/testing';
import { QrCode } from './qr-code';

function render(value: string): { svg: SVGElement; path: string; size: number } {
  const fixture = TestBed.createComponent(QrCode);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
  return {
    svg,
    path: svg.querySelector('path')!.getAttribute('d')!,
    size: Number(svg.getAttribute('viewBox')!.split(' ')[2]),
  };
}

describe('QrCode', () => {
  it('draws a square code with modules for a URL', () => {
    const { svg, path, size } = render('http://localhost:4200/shared/abc123def456');
    expect(svg.getAttribute('role')).toBe('img');
    expect(size).toBeGreaterThanOrEqual(25); // at least a version-2 symbol including the quiet zone
    expect(path.length).toBeGreaterThan(200);
    expect(path.startsWith('M')).toBe(true);
  });

  it('is deterministic and depends on the content', () => {
    expect(render('https://a.example/1').path).toBe(render('https://a.example/1').path);
    expect(render('https://a.example/1').path).not.toBe(render('https://a.example/2').path);
  });

  it('keeps a dark-on-white palette regardless of theme', () => {
    const { svg } = render('x');
    expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe('#000000');
  });
});
