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
    name: 'Unstable Top Razor Edge',
    theta1Deg: 179.5,
    theta2Deg: 179.5,
    l1: 140,
    l2: 130,
    m1: 2.0,
    m2: 2.0,
    g: 9.81,
    damping: 0.0002,
    description: 'Balanced almost vertically near the unstable saddle equilibrium; diverges instantly.',
  },
  {
    name: 'Harmonic Small-Angle Coupling',
    theta1Deg: 18,
    theta2Deg: 18,
    l1: 150,
    l2: 130,
    m1: 1.5,
    m2: 1.5,
    g: 9.81,
    damping: 0.001,
    description: 'Small amplitude oscillations where non-linear coupling is weak; motion is quasi-periodic.',
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
    name: 'Double Pendulum Knot',
    theta1Deg: 90,
    theta2Deg: -90,
    l1: 140,
    l2: 140,
    m1: 1.5,
    m2: 1.5,
    g: 9.81,
    damping: 0.0,
    description: 'Perpendicular initial geometry creating a rich braid pattern in phase space.',
  },
];
