export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

/** Signed power: keeps sign of x. */
export const spow = (x: number, p: number) => Math.sign(x) * Math.pow(Math.abs(x), p);

/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a: number) => {
  let x = (a + Math.PI) % TAU;
  if (x <= 0) x += TAU;
  return x - Math.PI;
};

/** Evenly spaced samples including both ends. */
export const linspace = (a: number, b: number, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
};

/** Hermite interpolation of scalar samples with Catmull-Rom style tangents on a non-uniform grid. */
export function hermite(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const x0 = xs[i];
  const x1 = xs[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const m = (k: number) => {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    return (ys[b] - ys[a]) / (xs[b] - xs[a] || 1e-9);
  };
  const m0 = m(i) * h;
  const m1 = m(i + 1) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1;
}

let idCounter = 0;
export function newId(prefix = 'c'): string {
  idCounter++;
  const rnd = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rnd}`;
}
