import { Complex } from './complex';

export interface Point2D {
  x: number;
  y: number;
}

export interface FourierComponent {
  freq: number;
  amp: number;
  phase: number;
  re: number;
  im: number;
}

/**
 * Resamples a path of points to N equidistant points along the arc-length
 */
export function resamplePath(points: Point2D[], targetCount: number): Point2D[] {
  if (points.length < 2) return points;

  // Calculate cumulative arc-length distances
  const distances: number[] = [0];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.hypot(dx, dy);
    distances.push(totalLength);
  }

  if (totalLength === 0) {
    return Array.from({ length: targetCount }, () => ({ ...points[0] }));
  }

  const resampled: Point2D[] = [];
  const step = totalLength / targetCount;
  let curIndex = 0;

  for (let i = 0; i < targetCount; i++) {
    const targetDist = i * step;

    while (curIndex < distances.length - 1 && distances[curIndex + 1] < targetDist) {
      curIndex++;
    }

    if (curIndex >= distances.length - 1) {
      resampled.push({ ...points[points.length - 1] });
      continue;
    }

    const segStart = distances[curIndex];
    const segEnd = distances[curIndex + 1];
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (targetDist - segStart) / segLen : 0;

    const p0 = points[curIndex];
    const p1 = points[curIndex + 1];

    resampled.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    });
  }

  return resampled;
}

/**
 * Computes Discrete Fourier Transform (DFT) of 2D sampled points
 * centered around origin.
 */
export function computeDFT(points: Point2D[]): FourierComponent[] {
  const N = points.length;
  if (N === 0) return [];

  // Convert points to complex numbers
  const z: Complex[] = points.map(p => new Complex(p.x, p.y));
  const components: FourierComponent[] = [];

  // Evaluate frequencies k from -floor(N/2) to floor((N-1)/2)
  const minK = -Math.floor(N / 2);
  const maxK = Math.floor((N - 1) / 2);

  for (let k = minK; k <= maxK; k++) {
    let sum = new Complex(0, 0);

    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      // e^{-i phi} = cos(phi) - i sin(phi)
      const basis = new Complex(Math.cos(phi), -Math.sin(phi));
      sum = sum.add(z[n].mul(basis));
    }

    // Normalized coefficient c_k = sum / N
    const c = sum.scale(1 / N);
    const amp = c.abs();
    const phase = c.arg();

    components.push({
      freq: k,
      amp,
      phase,
      re: c.re,
      im: c.im,
    });
  }

  // Sort components by amplitude descending (largest epicycles first)
  components.sort((a, b) => b.amp - a.amp);

  return components;
}

/**
 * Evaluates the Fourier series at angle t (in radians 0 to 2pi)
 * using the top 'componentCount' harmonics.
 * Returns epicycle centers and final tip point.
 */
export function evaluateEpicycles(
  components: FourierComponent[],
  t: number,
  componentCount: number,
  originX: number = 0,
  originY: number = 0
): {
  circles: { cx: number; cy: number; radius: number; tipX: number; tipY: number; freq: number }[];
  tip: Point2D;
} {
  let cx = originX;
  let cy = originY;

  const count = Math.min(componentCount, components.length);
  const circles: { cx: number; cy: number; radius: number; tipX: number; tipY: number; freq: number }[] = [];

  for (let i = 0; i < count; i++) {
    const comp = components[i];
    const prevX = cx;
    const prevY = cy;

    // Angle of current harmonic: freq * t + phase
    const angle = comp.freq * t + comp.phase;
    const radius = comp.amp;

    cx += radius * Math.cos(angle);
    cy += radius * Math.sin(angle);

    circles.push({
      cx: prevX,
      cy: prevY,
      radius,
      tipX: cx,
      tipY: cy,
      freq: comp.freq,
    });
  }

  return {
    circles,
    tip: { x: cx, y: cy },
  };
}

/**
 * Calculates Root Mean Square Error (RMSE) between original resampled points
 * and reconstructed points using the chosen number of components.
 */
export function computeRMSE(
  originalPoints: Point2D[],
  components: FourierComponent[],
  componentCount: number
): number {
  const N = originalPoints.length;
  if (N === 0) return 0;

  let sumSqErr = 0;
  for (let n = 0; n < N; n++) {
    const t = (2 * Math.PI * n) / N;
    const { tip } = evaluateEpicycles(components, t, componentCount);
    const orig = originalPoints[n];
    const dx = tip.x - orig.x;
    const dy = tip.y - orig.y;
    sumSqErr += dx * dx + dy * dy;
  }

  return Math.sqrt(sumSqErr / N);
}
