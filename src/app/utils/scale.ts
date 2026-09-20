export interface NiceScale {
  max: number;
  ticks: number[];
}

/** Rounds an axis maximum up to a "nice" number and returns evenly spaced ticks from 0. */
export function niceScale(maxValue: number, tickTarget = 4): NiceScale {
  if (!(maxValue > 0)) return { max: 100, ticks: [0, 25, 50, 75, 100] };

  const rawStep = maxValue / tickTarget;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const max = Math.ceil(maxValue / step - 1e-9) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return { max: ticks[ticks.length - 1]!, ticks };
}

/** Bar with a rounded data-end (top) and a square baseline end. */
export function roundedTopBar(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}
