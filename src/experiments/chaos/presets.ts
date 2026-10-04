export interface ChaosPreset {
  name: string;
  theta1Deg: number;
  theta2Deg: number;
  l1: number;
  l2: number;
  m1: number;
  m2: number;
  g: number;
  damping: number;
  description: string;
}

export const CHAOS_PRESETS: ChaosPreset[] = [
  {
    name: 'Hypnotic Silk Ribbon Cascade',
    theta1Deg: 135,
    theta2Deg: 135,
    l1: 150,
    l2: 130,
    m1: 2.0,
    m2: 1.5,
    g: 9.81,
    damping: 0.0,
    description: 'High energy release producing smooth twisting silk ribbons that progressively shear into chaotic folds.',
  },
  {
    name: 'Tsar Inverted Flip (Saddle Edge)',
    theta1Deg: 178.5,
    theta2Deg: 178.5,
    l1: 140,
    l2: 130,
    m1: 2.0,
    m2: 2.0,
    g: 9.81,
    damping: 0.0001,
    description: 'Balanced precariously at the hyperbolic saddle equilibrium; microscopic perturbations instantly explode.',
  },
  {
    name: 'Chaotic Loop-de-Loop',
    theta1Deg: 120,
    theta2Deg: 120,
    l1: 150,
    l2: 130,
    m1: 2.0,
    m2: 1.5,
    g: 9.81,
    damping: 0.0005,
    description: 'High energy state producing continuous full revolutions and unpredictable direction flips.',
  },
  {
    name: 'Harmonic Quasi-Periodic Waves',
    theta1Deg: 22,
    theta2Deg: 22,
    l1: 150,
    l2: 130,
    m1: 1.5,
    m2: 1.5,
    g: 9.81,
    damping: 0.0008,
    description: 'Small amplitude oscillations where non-linear coupling is weak; motion stays quasi-periodic with tight phase loops.',
  },
  {
    name: 'Heavy Base Whip',
    theta1Deg: 135,
    theta2Deg: -45,
    l1: 120,
    l2: 160,
    m1: 4.5,
    m2: 0.8,
    g: 9.81,
    damping: 0.0003,
    description: 'Heavy inner bob acts as a massive driver, violently snapping the light outer whip.',
  },
  {
    name: 'Resonant Double Horseshoe',
    theta1Deg: 90,
    theta2Deg: -90,
    l1: 140,
    l2: 140,
    m1: 1.5,
    m2: 1.5,
    g: 9.81,
    damping: 0.0,
    description: 'Perpendicular initial geometry creating a rich braid pattern in phase space and crisp Poincaré crossings.',
  },
];
