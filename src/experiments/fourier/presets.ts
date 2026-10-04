import { Point2D } from '../../math/dft';

export interface FourierPreset {
  name: string;
  generate: () => Point2D[];
  description: string;
}

export const FOURIER_PRESETS: FourierPreset[] = [
  {
    name: '5-Pointed Star',
    description: 'Classical pentagram constructed from alternating outer and inner vertices.',
    generate: () => {
      const points: Point2D[] = [];
      const outerR = 180;
      const innerR = 75;
      const totalPoints = 120;
      for (let i = 0; i <= totalPoints; i++) {
        const t = (i / totalPoints) * 2 * Math.PI;
        // 5 star points: alternating radius
        const angle5 = t * 5;
        const r = innerR + (outerR - innerR) * 0.5 * (1 + Math.cos(angle5));
        // Rotate so it stands upright
        const angle = t - Math.PI / 2;
        points.push({
          x: r * Math.cos(angle),
          y: r * Math.sin(angle),
        });
      }
      return points;
    },
  },
  {
    name: 'Cardioid Heart',
    description: 'Parametric heart curve demonstrating low-frequency harmonic dominance.',
    generate: () => {
      const points: Point2D[] = [];
      const count = 150;
      for (let i = 0; i <= count; i++) {
        const t = (i / count) * 2 * Math.PI;
        // Classical heart formula: x = 16 sin^3(t), y = -(13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t))
        const x = 11 * Math.pow(Math.sin(t), 3) * 12;
        const y =
          -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 10;
        points.push({ x, y: y + 20 });
      }
      return points;
    },
  },
  {
    name: 'Greek Pi (π)',
    description: 'The mathematical constant symbol digitized into a closed Fourier loop.',
    generate: () => {
      // Outline of the Greek letter Pi
      const rawPoints: Point2D[] = [
        // Top bar
        { x: -160, y: -100 },
        { x: 160, y: -100 },
        { x: 160, y: -70 },
        { x: 60, y: -70 },
        // Right leg
        { x: 60, y: 80 },
        { x: 80, y: 110 },
        { x: 110, y: 100 },
        { x: 110, y: 80 },
        { x: 85, y: 80 },
        { x: 30, y: 60 },
        { x: 30, y: -70 },
        // Left leg
        { x: -30, y: -70 },
        { x: -30, y: 110 },
        { x: -60, y: 110 },
        { x: -60, y: -70 },
        { x: -160, y: -70 },
        { x: -160, y: -100 },
      ];
      // Interpolate to get smooth contour
      const smooth: Point2D[] = [];
      for (let i = 0; i < rawPoints.length - 1; i++) {
        const p1 = rawPoints[i];
        const p2 = rawPoints[i + 1];
        const steps = 12;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          smooth.push({
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          });
        }
      }
      smooth.push(rawPoints[rawPoints.length - 1]);
      return smooth;
    },
  },
  {
    name: 'Trefoil Knot / Clover',
    description: 'A 3-lobed mathematical rosette with non-trivial curvature and symmetry.',
    generate: () => {
      const points: Point2D[] = [];
      const count = 160;
      for (let i = 0; i <= count; i++) {
        const t = (i / count) * 2 * Math.PI;
        // Rhodonea curve r = cos(3 theta)
        const r = (80 + 100 * Math.cos(3 * t));
        points.push({
          x: r * Math.cos(t),
          y: r * Math.sin(t),
        });
      }
      return points;
    },
  },
  {
    name: 'Eighth Note (Musical)',
    description: 'A flowing musical eighth note with stem and flag curve.',
    generate: () => {
      const raw: Point2D[] = [
        { x: -70, y: 90 },
        { x: -50, y: 120 },
        { x: -10, y: 110 },
        { x: 10, y: 70 },
        { x: 10, y: -90 },
        { x: 50, y: -80 },
        { x: 80, y: -50 },
        { x: 90, y: -10 },
        { x: 80, y: 10 },
        { x: 75, y: -20 },
        { x: 60, y: -50 },
        { x: 30, y: -60 },
        { x: 30, y: 70 },
        { x: 0, y: 125 },
        { x: -50, y: 135 },
        { x: -80, y: 110 },
        { x: -70, y: 90 },
      ];
      const smooth: Point2D[] = [];
      for (let i = 0; i < raw.length - 1; i++) {
        const p1 = raw[i];
        const p2 = raw[i + 1];
        const steps = 10;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          smooth.push({
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          });
        }
      }
      return smooth;
    },
  },
  {
    name: 'Infinity Loop (Lemniscate)',
    description: 'Bernoulli lemniscate with a figure-8 self-crossing geometry.',
    generate: () => {
      const points: Point2D[] = [];
      const count = 160;
      const a = 180;
      for (let i = 0; i <= count; i++) {
        const t = (i / count) * 2 * Math.PI;
        const denom = 1 + Math.sin(t) * Math.sin(t);
        const x = (a * Math.cos(t)) / denom;
        const y = (a * Math.sin(t) * Math.cos(t)) / denom;
        points.push({ x, y });
      }
      return points;
    },
  },
];
