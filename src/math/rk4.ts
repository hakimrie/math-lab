export interface PendulumParams {
  l1: number;      // Length 1 (meters or scaled units)
  l2: number;      // Length 2
  m1: number;      // Mass 1 (kg)
  m2: number;      // Mass 2
  g: number;       // Gravitational acceleration (m/s^2)
  damping: number; // Viscous damping coefficient
}

export interface PendulumState {
  theta1: number;  // Angle of arm 1 (rad)
  theta2: number;  // Angle of arm 2 (rad)
  omega1: number;  // Angular velocity 1 (rad/s)
  omega2: number;  // Angular velocity 2 (rad/s)
}

export interface PendulumPositions {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Computes derivatives [dTheta1/dt, dTheta2/dt, dOmega1/dt, dOmega2/dt]
 */
function getDerivatives(
  state: PendulumState,
  params: PendulumParams
): [number, number, number, number] {
  const { theta1, theta2, omega1, omega2 } = state;
  const { l1, l2, m1, m2, g, damping } = params;

  const delta = theta1 - theta2;
  const cosDelta = Math.cos(delta);
  const sinDelta = Math.sin(delta);
  const twoDelta = 2 * delta;
  const denomCommon = 2 * m1 + m2 - m2 * Math.cos(twoDelta);

  // Angular acceleration 1 (alpha1)
  const num1 =
    -g * (2 * m1 + m2) * Math.sin(theta1) -
    m2 * g * Math.sin(theta1 - 2 * theta2) -
    2 * sinDelta * m2 * (omega2 * omega2 * l2 + omega1 * omega1 * l1 * cosDelta);
  const alpha1 = num1 / (l1 * denomCommon) - damping * omega1;

  // Angular acceleration 2 (alpha2)
  const num2 =
    2 *
    sinDelta *
    (omega1 * omega1 * l1 * (m1 + m2) +
      g * (m1 + m2) * Math.cos(theta1) +
      omega2 * omega2 * l2 * m2 * cosDelta);
  const alpha2 = num2 / (l2 * denomCommon) - damping * omega2;

  return [omega1, omega2, alpha1, alpha2];
}

/**
 * 4th-Order Runge-Kutta numerical integration step
 */
export function rk4Step(
  state: PendulumState,
  params: PendulumParams,
  dt: number
): PendulumState {
  // k1
  const [dTh1_1, dTh2_1, dOm1_1, dOm2_1] = getDerivatives(state, params);

  // k2
  const s2: PendulumState = {
    theta1: state.theta1 + 0.5 * dt * dTh1_1,
    theta2: state.theta2 + 0.5 * dt * dTh2_1,
    omega1: state.omega1 + 0.5 * dt * dOm1_1,
    omega2: state.omega2 + 0.5 * dt * dOm2_1,
  };
  const [dTh1_2, dTh2_2, dOm1_2, dOm2_2] = getDerivatives(s2, params);

  // k3
  const s3: PendulumState = {
    theta1: state.theta1 + 0.5 * dt * dTh1_2,
    theta2: state.theta2 + 0.5 * dt * dTh2_2,
    omega1: state.omega1 + 0.5 * dt * dOm1_2,
    omega2: state.omega2 + 0.5 * dt * dOm2_2,
  };
  const [dTh1_3, dTh2_3, dOm1_3, dOm2_3] = getDerivatives(s3, params);

  // k4
  const s4: PendulumState = {
    theta1: state.theta1 + dt * dTh1_3,
    theta2: state.theta2 + dt * dTh2_3,
    omega1: state.omega1 + dt * dOm1_3,
    omega2: state.omega2 + dt * dOm2_3,
  };
  const [dTh1_4, dTh2_4, dOm1_4, dOm2_4] = getDerivatives(s4, params);

  // Combine weighted slopes
  const newTheta1 = state.theta1 + (dt / 6) * (dTh1_1 + 2 * dTh1_2 + 2 * dTh1_3 + dTh1_4);
  const newTheta2 = state.theta2 + (dt / 6) * (dTh2_1 + 2 * dTh2_2 + 2 * dTh2_3 + dTh2_4);
  const newOmega1 = state.omega1 + (dt / 6) * (dOm1_1 + 2 * dOm1_2 + 2 * dOm1_3 + dOm1_4);
  const newOmega2 = state.omega2 + (dt / 6) * (dOm2_1 + 2 * dOm2_2 + 2 * dOm2_3 + dOm2_4);

  return {
    theta1: normalizeAngle(newTheta1),
    theta2: normalizeAngle(newTheta2),
    omega1: newOmega1,
    omega2: newOmega2,
  };
}

/**
 * Normalizes angle to [-PI, PI] for numerical stability
 */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Computes Cartesian positions of both bobs
 */
export function getCartesianPositions(
  state: PendulumState,
  params: PendulumParams,
  pivotX: number = 0,
  pivotY: number = 0
): PendulumPositions {
  const x1 = pivotX + params.l1 * Math.sin(state.theta1);
  const y1 = pivotY + params.l1 * Math.cos(state.theta1);

  const x2 = x1 + params.l2 * Math.sin(state.theta2);
  const y2 = y1 + params.l2 * Math.cos(state.theta2);

  return { x1, y1, x2, y2 };
}

/**
 * Computes Total Energy (Kinetic + Potential)
 */
export function computeTotalEnergy(
  state: PendulumState,
  params: PendulumParams
): { kinetic: number; potential: number; total: number } {
  const { theta1, theta2, omega1, omega2 } = state;
  const { l1, l2, m1, m2, g } = params;

  // Potential energy (reference zero at pivot, downwards is negative potential)
  const y1 = -l1 * Math.cos(theta1);
  const y2 = y1 - l2 * Math.cos(theta2);
  const potential = m1 * g * y1 + m2 * g * y2;

  // Kinetic energy
  const v1sq = (l1 * omega1) ** 2;
  const v2sq = (l1 * omega1) ** 2 + (l2 * omega2) ** 2 + 2 * l1 * l2 * omega1 * omega2 * Math.cos(theta1 - theta2);
  const kinetic = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq;

  return {
    kinetic,
    potential,
    total: kinetic + potential,
  };
}
