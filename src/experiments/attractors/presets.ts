export interface AttractorSystem {
  id: string;
  name: string;
  badge: string;
  description: string;
  defaultScale: number;
  centerOffset: [number, number, number];
  defaultParams: Record<string, number>;
  paramRanges: Record<string, { min: number; max: number; step: number; label: string }>;
  initialPoint: [number, number, number];
  dt: number;
  evaluate(x: number, y: number, z: number, p: Record<string, number>): [number, number, number];
  latexFormula: string;
}

export const ATTRACTOR_SYSTEMS: Record<string, AttractorSystem> = {
  lorenz: {
    id: 'lorenz',
    name: 'Lorenz Attractor (Butterfly)',
    badge: 'Atmospheric Convection',
    description: 'Discovered in 1963 by Edward Lorenz while modeling atmospheric convection rolls. The two lobes form the iconic butterfly wings of chaos theory.',
    defaultScale: 7.2,
    centerOffset: [0, 0, -25],
    defaultParams: { sigma: 10, rho: 28, beta: 2.6667 },
    paramRanges: {
      sigma: { min: 1, max: 25, step: 0.5, label: 'Prandtl Number (σ)' },
      rho: { min: 5, max: 60, step: 1, label: 'Rayleigh Number (ρ)' },
      beta: { min: 0.5, max: 6, step: 0.1, label: 'Geometric Factor (β)' },
    },
    initialPoint: [1.0, 1.0, 20.0],
    dt: 0.008,
    evaluate: (x, y, z, p) => [
      p.sigma * (y - x),
      x * (p.rho - z) - y,
      x * y - p.beta * z,
    ],
    latexFormula: `\\begin{cases} \\dot{x} = \\sigma(y - x) \\\\ \\dot{y} = x(\\rho - z) - y \\\\ \\dot{z} = xy - \\beta z \\end{cases}`,
  },

  aizawa: {
    id: 'aizawa',
    name: 'Aizawa Toroidal Attractor',
    badge: 'Spherical Vortex',
    description: 'A 6-parameter system forming a stunning hollow sphere with an interior rotating vortex and an erupting geyser along its vertical axis.',
    defaultScale: 110,
    centerOffset: [0, 0, -0.6],
    defaultParams: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 },
    paramRanges: {
      a: { min: 0.5, max: 1.5, step: 0.05, label: 'Parameter a' },
      b: { min: 0.3, max: 1.2, step: 0.05, label: 'Parameter b' },
      c: { min: 0.2, max: 1.0, step: 0.05, label: 'Parameter c' },
      d: { min: 1.0, max: 5.0, step: 0.1, label: 'Rotation d' },
    },
    initialPoint: [0.1, 1.0, 0.5],
    dt: 0.015,
    evaluate: (x, y, z, p) => [
      (z - p.b) * x - p.d * y,
      p.d * x + (z - p.b) * y,
      p.c + p.a * z - (z * z * z) / 3.0 - (x * x + y * y) * (1.0 + p.e * z) + p.f * z * (x * x * x),
    ],
    latexFormula: `\\begin{cases} \\dot{x} = (z - b)x - dy \\\\ \\dot{y} = dx + (z - b)y \\\\ \\dot{z} = c + az - \\frac{z^3}{3} - (x^2 + y^2)(1 + ez) + fzx^3 \\end{cases}`,
  },

  halvorsen: {
    id: 'halvorsen',
    name: 'Halvorsen 3-Lobe Attractor',
    badge: 'Cyclic $\\mathbb{Z}_3$ Symmetry',
    description: 'Features remarkable threefold rotational cyclic symmetry. The trajectory loops smoothly through three identical curved arms in space.',
    defaultScale: 14.5,
    centerOffset: [1.5, 1.5, 1.5],
    defaultParams: { a: 1.89 },
    paramRanges: {
      a: { min: 1.0, max: 3.0, step: 0.01, label: 'Dissipation (a)' },
    },
    initialPoint: [-1.48, -1.51, 2.04],
    dt: 0.009,
    evaluate: (x, y, z, p) => [
      -p.a * x - 4.0 * y - 4.0 * z - y * y,
      -p.a * y - 4.0 * z - 4.0 * x - z * z,
      -p.a * z - 4.0 * x - 4.0 * y - x * x,
    ],
    latexFormula: `\\begin{cases} \\dot{x} = -ax - 4y - 4z - y^2 \\\\ \\dot{y} = -ay - 4z - 4x - z^2 \\\\ \\dot{z} = -az - 4x - 4y - x^2 \\end{cases}`,
  },

  thomas: {
    id: 'thomas',
    name: 'Thomas Cyclically Symmetric',
    badge: 'Trigonometric Chaos',
    description: 'A labyrinthine chaotic attractor governed entirely by coupled sine functions and linear friction damping.',
    defaultScale: 50.0,
    centerOffset: [0, 0, 0],
    defaultParams: { b: 0.208186 },
    paramRanges: {
      b: { min: 0.15, max: 0.28, step: 0.005, label: 'Damping (b)' },
    },
    initialPoint: [1.1, 1.1, 1.1],
    dt: 0.035,
    evaluate: (x, y, z, p) => [
      Math.sin(y) - p.b * x,
      Math.sin(z) - p.b * y,
      Math.sin(x) - p.b * z,
    ],
    latexFormula: `\\begin{cases} \\dot{x} = \\sin(y) - bx \\\\ \\dot{y} = \\sin(z) - by \\\\ \\dot{z} = \\sin(x) - bz \\end{cases}`,
  },

  rossler: {
    id: 'rossler',
    name: 'Rössler Ribbon Attractor',
    badge: 'Phase Space Folding',
    description: 'Otto Rössler designed this system to model chemical equilibrium chaos with a simple single-band folding mechanism reminiscent of a Möbius strip.',
    defaultScale: 13.0,
    centerOffset: [0, 0, -8.0],
    defaultParams: { a: 0.2, b: 0.2, c: 5.7 },
    paramRanges: {
      a: { min: 0.1, max: 0.4, step: 0.02, label: 'Parameter a' },
      b: { min: 0.1, max: 0.4, step: 0.02, label: 'Parameter b' },
      c: { min: 2.0, max: 9.0, step: 0.2, label: 'Escape z-plane (c)' },
    },
    initialPoint: [-9.0, 0.0, 0.0],
    dt: 0.02,
    evaluate: (x, y, z, p) => [
      -y - z,
      x + p.a * y,
      p.b + z * (x - p.c),
    ],
    latexFormula: `\\begin{cases} \\dot{x} = -y - z \\\\ \\dot{y} = x + ay \\\\ \\dot{z} = b + z(x - c) \\end{cases}`,
  },

  dadras: {
    id: 'dadras',
    name: 'Dadras Dual-Helix Attractor',
    badge: 'Non-linear Gyroscopic',
    description: 'A modern 5-parameter autonomous system exhibiting an intricate interlocking double helix with multi-scroll chaotic dynamics.',
    defaultScale: 16.0,
    centerOffset: [0, 0, 0],
    defaultParams: { a: 3.0, b: 2.7, c: 1.7, d: 2.0, h: 9.0 },
    paramRanges: {
      a: { min: 1.0, max: 5.0, step: 0.2, label: 'Linear dissipation (a)' },
      b: { min: 1.0, max: 4.0, step: 0.2, label: 'Cross-coupling (b)' },
      c: { min: 0.5, max: 3.0, step: 0.1, label: 'Feedback (c)' },
      h: { min: 5.0, max: 14.0, step: 0.5, label: 'Vertical decay (h)' },
    },
    initialPoint: [1.1, 2.1, -2.0],
    dt: 0.008,
    evaluate: (x, y, z, p) => [
      y - p.a * x + p.b * y * z,
      p.c * y - x * z + z,
      p.d * x * y - p.h * z,
    ],
    latexFormula: `\\begin{cases} \\dot{x} = y - ax + byz \\\\ \\dot{y} = cy - xz + z \\\\ \\dot{z} = dxy - hz \\end{cases}`,
  },
};
