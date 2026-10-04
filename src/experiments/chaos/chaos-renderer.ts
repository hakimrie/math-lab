import { Experiment } from '../experiment';
import {
  PendulumParams,
  PendulumState,
  rk4Step,
  getCartesianPositions,
  computeTotalEnergy,
} from '../../math/rk4';
import { CHAOS_PRESETS } from './presets';

export class ChaosRenderer implements Experiment {
  id = 'chaos';
  name = 'Chaos & Double Pendulum';
  badge = 'Deterministic Chaos';
  category = 'Lagrangian Dynamics';
  accentColor = '#fbbf24';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Physics parameters
  private params: PendulumParams = {
    l1: 150,
    l2: 130,
    m1: 2.0,
    m2: 1.5,
    g: 9.81,
    damping: 0.0002,
  };

  // Simulation Mode: 'twin' | 'ensemble'
  private simMode: 'twin' | 'ensemble' = 'twin';

  // State of Pendulum A (Primary)
  private stateA: PendulumState = {
    theta1: (120 * Math.PI) / 180,
    theta2: (120 * Math.PI) / 180,
    omega1: 0,
    omega2: 0,
  };

  // State of Pendulum B (Twin for sensitivity test)
  private stateB: PendulumState = {
    theta1: (120.001 * Math.PI) / 180,
    theta2: (120.001 * Math.PI) / 180,
    omega1: 0,
    omega2: 0,
  };

  serializeState(): Record<string, string | number | boolean> {
    return {
      mode: this.simMode,
      th1: Number(((this.launchTheta1 * 180) / Math.PI).toFixed(2)),
      th2: Number(((this.launchTheta2 * 180) / Math.PI).toFixed(2)),
      l1: this.params.l1,
      l2: this.params.l2,
      m1: this.params.m1,
      m2: this.params.m2,
      g: this.params.g,
      ensCount: this.ensembleCount,
      ensDelta: Number((this.ensembleDeltaRad * 1e5).toFixed(2)),
      speed: Number(this.simSpeed.toFixed(2)),
      trail: this.showTrail,
    };
  }

  deserializeState(state: Record<string, string>): void {
    if (state.mode && (state.mode === 'twin' || state.mode === 'ensemble')) {
      this.simMode = state.mode;
    }
    if (state.th1 !== undefined) {
      this.launchTheta1 = (parseFloat(state.th1) * Math.PI) / 180;
    }
    if (state.th2 !== undefined) {
      this.launchTheta2 = (parseFloat(state.th2) * Math.PI) / 180;
    }
    if (state.l1 !== undefined) this.params.l1 = parseFloat(state.l1);
    if (state.l2 !== undefined) this.params.l2 = parseFloat(state.l2);
    if (state.m1 !== undefined) this.params.m1 = parseFloat(state.m1);
    if (state.m2 !== undefined) this.params.m2 = parseFloat(state.m2);
    if (state.g !== undefined) this.params.g = parseFloat(state.g);
    if (state.ensCount !== undefined) this.ensembleCount = parseInt(state.ensCount, 10);
    if (state.ensDelta !== undefined) this.ensembleDeltaRad = parseFloat(state.ensDelta) * 1e-5;
    if (state.speed !== undefined) this.simSpeed = parseFloat(state.speed);
    if (state.trail !== undefined) this.showTrail = state.trail === 'true';

    this.relaunchSimulation();
    this.updateControlsUI();
  }

  // Multi-Pendulum Ensemble (Silk Ribbon)
  private ensembleCount = 75;
  private ensembleDeltaRad = 0.00001; // 10^-5 rad (~0.00057 deg)
  private ensembleStates: PendulumState[] = [];
  private ensembleTrails: { x: number; y: number }[][] = [];

  // Initial delta angle between twins (in degrees)
  private initialDeltaDeg = 0.001;
  private sensitivityMode = true;

  // Simulation controls
  private isSimPlaying = true;
  private simSpeed = 1.0;
  private simTime = 0;
  private trailLength = 500;
  private showTrail = true;
  private showGraph = true;
  private showPhasePortrait = true;

  // Trajectory history for trails
  private trailA: { x: number; y: number }[] = [];
  private trailB: { x: number; y: number }[] = [];

  // Divergence graph history: { t: number, dist: number }
  private divergenceHistory: { t: number; dist: number }[] = [];
  private maxGraphPoints = 300;

  // Dual Phase Space History: (theta1, omega1) and (theta2, omega2)
  private phaseHistory1: { theta: number; omega: number }[] = [];
  private phaseHistory2: { theta: number; omega: number }[] = [];
  private maxPhasePoints = 600;

  // Poincaré Section Points on crossing theta1 = 0
  private poincarePoints: { theta: number; omega: number }[] = [];
  private maxPoincarePoints = 1200;
  private prevTheta1 = 0;

  // Initial Total Energy for conservation drift tracking
  private initialEnergy = 0;

  // Dragging interaction
  private isDragging = false;
  private draggedBob: 1 | 2 | null = null;

  // Pan & Zoom
  private zoomLevel = 1.0;
  private panX = 0;
  private panY = -30; // slightly offset pivot upward

  private containerEl: HTMLElement | null = null;

  // Configured initial launch angles
  private launchTheta1 = (135 * Math.PI) / 180;
  private launchTheta2 = (135 * Math.PI) / 180;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.relaunchSimulation();
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
  }

  relaunchSimulation(): void {
    const deltaRad = (this.initialDeltaDeg * Math.PI) / 180;
    this.stateA = {
      theta1: this.launchTheta1,
      theta2: this.launchTheta2,
      omega1: 0,
      omega2: 0,
    };
    this.stateB = {
      theta1: this.launchTheta1 + deltaRad,
      theta2: this.launchTheta2 + deltaRad,
      omega1: 0,
      omega2: 0,
    };

    // Initialize Silk Ribbon Ensemble with 10^-5 rad microscopic dispersion
    this.ensembleStates = [];
    this.ensembleTrails = [];
    for (let i = 0; i < this.ensembleCount; i++) {
      const offset = (i - (this.ensembleCount - 1) / 2) * this.ensembleDeltaRad;
      this.ensembleStates.push({
        theta1: this.launchTheta1 + offset,
        theta2: this.launchTheta2 + offset,
        omega1: 0,
        omega2: 0,
      });
      this.ensembleTrails.push([]);
    }

    this.simTime = 0;
    this.prevTheta1 = this.launchTheta1;
    this.trailA = [];
    this.trailB = [];
    this.divergenceHistory = [];
    this.phaseHistory1 = [];
    this.phaseHistory2 = [];
    this.poincarePoints = [];
    this.isSimPlaying = true;
    this.initialEnergy = computeTotalEnergy(this.stateA, this.params).total;
    this.updateControlsUI();
  }

  resetSimulation(): void {
    this.relaunchSimulation();
  }

  update(dt: number, _time: number): void {
    if (!this.isSimPlaying || this.isDragging) return;

    // Safeguard against numerical instability
    if (!Number.isFinite(this.stateA.theta1) || !Number.isFinite(this.stateA.omega1)) {
      this.relaunchSimulation();
      return;
    }

    // Sub-stepping for extreme RK4 energy conservation
    const subSteps = 16;
    const scaledDt = (Math.min(dt, 0.05) * this.simSpeed) / subSteps;

    if (this.simMode === 'ensemble') {
      for (let step = 0; step < subSteps; step++) {
        for (let i = 0; i < this.ensembleStates.length; i++) {
          this.ensembleStates[i] = rk4Step(this.ensembleStates[i], this.params, scaledDt);
        }
      }
      // Record center state for HUD & audio
      this.stateA = this.ensembleStates[Math.floor(this.ensembleStates.length / 2)] || this.stateA;

      // Record ensemble trails
      for (let i = 0; i < this.ensembleStates.length; i++) {
        const pos = getCartesianPositions(this.ensembleStates[i], this.params, 0, 0);
        this.ensembleTrails[i].push({ x: pos.x2, y: pos.y2 });
        if (this.ensembleTrails[i].length > Math.min(this.trailLength, 120)) {
          this.ensembleTrails[i].shift();
        }
      }
    } else {
      // Twin mode
      for (let step = 0; step < subSteps; step++) {
        this.stateA = rk4Step(this.stateA, this.params, scaledDt);
        if (this.sensitivityMode) {
          this.stateB = rk4Step(this.stateB, this.params, scaledDt);
        }
      }

      const posA = getCartesianPositions(this.stateA, this.params, 0, 0);
      this.trailA.push({ x: posA.x2, y: posA.y2 });
      if (this.trailA.length > this.trailLength) this.trailA.shift();

      if (this.sensitivityMode) {
        const posB = getCartesianPositions(this.stateB, this.params, 0, 0);
        this.trailB.push({ x: posB.x2, y: posB.y2 });
        if (this.trailB.length > this.trailLength) this.trailB.shift();

        const dist = Math.hypot(posB.x2 - posA.x2, posB.y2 - posA.y2);
        this.divergenceHistory.push({ t: this.simTime, dist });
        if (this.divergenceHistory.length > this.maxGraphPoints) {
          this.divergenceHistory.shift();
        }
      }
    }

    // Record Poincaré section crossings on theta1 = 0 downward with positive omega1
    if (Math.sin(this.prevTheta1) < 0 && Math.sin(this.stateA.theta1) >= 0 && this.stateA.omega1 > 0) {
      let th2 = ((this.stateA.theta2 + Math.PI) % (2 * Math.PI)) - Math.PI;
      if (th2 < -Math.PI) th2 += 2 * Math.PI;
      this.poincarePoints.push({ theta: th2, omega: this.stateA.omega2 });
      if (this.poincarePoints.length > this.maxPoincarePoints) {
        this.poincarePoints.shift();
      }
    }

    this.simTime += dt * this.simSpeed;
    this.prevTheta1 = this.stateA.theta1;

    // Record normalized phase space points for both arms
    let wrappedTheta1 = ((this.stateA.theta1 + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (wrappedTheta1 < -Math.PI) wrappedTheta1 += 2 * Math.PI;
    this.phaseHistory1.push({ theta: wrappedTheta1, omega: this.stateA.omega1 });
    if (this.phaseHistory1.length > this.maxPhasePoints) {
      this.phaseHistory1.shift();
    }

    let wrappedTheta2 = ((this.stateA.theta2 + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (wrappedTheta2 < -Math.PI) wrappedTheta2 += 2 * Math.PI;
    this.phaseHistory2.push({ theta: wrappedTheta2, omega: this.stateA.omega2 });
    if (this.phaseHistory2.length > this.maxPhasePoints) {
      this.phaseHistory2.shift();
    }
  }

  render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep space background
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    // Subtle radial glow from pivot
    const pivotScreenX = width / 2 + this.panX;
    const pivotScreenY = height / 2.6 + this.panY;

    const bgGlow = ctx.createRadialGradient(
      pivotScreenX,
      pivotScreenY,
      10,
      pivotScreenX,
      pivotScreenY,
      Math.max(width, height) * 0.7
    );
    bgGlow.addColorStop(0, 'rgba(14, 165, 233, 0.05)');
    bgGlow.addColorStop(0.5, 'rgba(15, 23, 42, 0.02)');
    bgGlow.addColorStop(1, 'rgba(5, 7, 13, 0.85)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    // Draw Pendulums in World Space
    ctx.save();
    ctx.translate(pivotScreenX, pivotScreenY);
    ctx.scale(this.zoomLevel, this.zoomLevel);

    if (this.simMode === 'ensemble') {
      this.renderEnsemble(ctx);
    } else {
      this.renderTwins(ctx);
    }

    // Central Pivot Pin
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#07090e';
    ctx.fill();

    ctx.restore();

    // HUD Overlays
    if (this.simMode === 'twin' && this.sensitivityMode && this.showGraph) {
      this.drawDivergenceHUD(ctx, width, height);
    }

    if (this.showPhasePortrait) {
      this.drawDualPhaseAndPoincareHUD(ctx, width, height);
    }

    ctx.restore();
  }

  private renderTwins(ctx: CanvasRenderingContext2D): void {
    // Trails
    if (this.showTrail) {
      if (this.sensitivityMode && this.trailB.length > 1) {
        this.drawTrail(ctx, this.trailB, 'rgba(244, 63, 94, ', '#f43f5e'); // Twin B: Magenta/Rose
      }
      if (this.trailA.length > 1) {
        this.drawTrail(ctx, this.trailA, 'rgba(14, 165, 233, ', '#0ea5e9'); // Main A: Cyan
      }
    }

    // Pendulum B (Twin)
    if (this.sensitivityMode) {
      const posB = getCartesianPositions(this.stateB, this.params, 0, 0);
      this.drawPendulumBody(ctx, posB, 'rgba(244, 63, 94, 0.65)', '#f43f5e', '#fb7185', false);
    }

    // Pendulum A (Main)
    const posA = getCartesianPositions(this.stateA, this.params, 0, 0);
    this.drawPendulumBody(ctx, posA, 'rgba(56, 189, 248, 0.95)', '#0ea5e9', '#38bdf8', true);
  }

  private renderEnsemble(ctx: CanvasRenderingContext2D): void {
    const N = this.ensembleStates.length;
    if (N === 0) return;

    // Collect cartesian geometry for both joints across the full ensemble
    const elbows: { x: number; y: number }[] = [];
    const tips: { x: number; y: number }[] = [];

    for (let i = 0; i < N; i++) {
      const pos = getCartesianPositions(this.ensembleStates[i], this.params, 0, 0);
      elbows.push({ x: pos.x1, y: pos.y1 });
      tips.push({ x: pos.x2, y: pos.y2 });
    }

    // 1. Trails for sampled pendulums
    if (this.showTrail) {
      ctx.save();
      ctx.lineWidth = 1.2 / this.zoomLevel;
      const trailStep = Math.max(1, Math.floor(N / 24));
      for (let i = 0; i < N; i += trailStep) {
        const trail = this.ensembleTrails[i];
        if (!trail || trail.length < 2) continue;
        const hue = 180 + (i / (N - 1 || 1)) * 160;
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let k = 1; k < trail.length; k++) {
          ctx.lineTo(trail[k].x, trail[k].y);
        }
        ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.18)`;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Continuous "Silk Ribbon" Quad Strip Mesh (Screen blend)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < N - 1; i++) {
      const frac = i / (N - 1);
      const hue = 180 + frac * 165; // Cyan (180) -> Violet (270) -> Rose (345)

      // Quad polygon: elbow[i] -> tip[i] -> tip[i+1] -> elbow[i+1]
      ctx.beginPath();
      ctx.moveTo(elbows[i].x, elbows[i].y);
      ctx.lineTo(tips[i].x, tips[i].y);
      ctx.lineTo(tips[i + 1].x, tips[i + 1].y);
      ctx.lineTo(elbows[i + 1].x, elbows[i + 1].y);
      ctx.closePath();

      ctx.fillStyle = `hsla(${hue}, 88%, 62%, 0.18)`;
      ctx.fill();
    }
    ctx.restore();

    // 3. Sampled Physical Rods (every N/12 pendulums + boundaries)
    const rodStep = Math.max(1, Math.floor(N / 12));
    ctx.save();
    for (let i = 0; i < N; i++) {
      if (i % rodStep !== 0 && i !== N - 1) continue;
      const hue = 180 + (i / (N - 1 || 1)) * 160;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(elbows[i].x, elbows[i].y);
      ctx.lineTo(tips[i].x, tips[i].y);
      ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.35)`;
      ctx.lineWidth = 1.0 / this.zoomLevel;
      ctx.stroke();
    }
    ctx.restore();

    // 4. Inner Elbow Wave Spine (Violet glow)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(elbows[0].x, elbows[0].y);
    for (let i = 1; i < N; i++) {
      ctx.lineTo(elbows[i].x, elbows[i].y);
    }
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
    ctx.lineWidth = 1.8 / this.zoomLevel;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // 5. Outer Tip Silk Ribbon Spine (Luminous undulating wave with Cyan/White glow)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tips[0].x, tips[0].y);
    for (let i = 1; i < N; i++) {
      ctx.lineTo(tips[i].x, tips[i].y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.4 / this.zoomLevel;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Tip beads for sampled pendulums
    for (let i = 0; i < N; i++) {
      if (i % 2 !== 0 && i !== N - 1) continue;
      const hue = 180 + (i / (N - 1 || 1)) * 160;
      ctx.beginPath();
      ctx.arc(tips[i].x, tips[i].y, 2.5 / this.zoomLevel, 0, 2 * Math.PI);
      ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
      ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTrail(
    ctx: CanvasRenderingContext2D,
    trail: { x: number; y: number }[],
    colorPrefix: string,
    glowColor: string
  ): void {
    ctx.save();
    ctx.lineWidth = 2 / this.zoomLevel;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6;

    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.85;
      ctx.strokeStyle = `${colorPrefix}${alpha})`;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPendulumBody(
    ctx: CanvasRenderingContext2D,
    pos: { x1: number; y1: number; x2: number; y2: number },
    rodColor: string,
    bob1Color: string,
    bob2Color: string,
    hasGlow: boolean
  ): void {
    ctx.save();
    if (hasGlow) {
      ctx.shadowColor = bob2Color;
      ctx.shadowBlur = 8;
    }

    // Rod 1 (Pivot to Bob 1)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(pos.x1, pos.y1);
    ctx.strokeStyle = rodColor;
    ctx.lineWidth = 3 / this.zoomLevel;
    ctx.stroke();

    // Rod 2 (Bob 1 to Bob 2)
    ctx.beginPath();
    ctx.moveTo(pos.x1, pos.y1);
    ctx.lineTo(pos.x2, pos.y2);
    ctx.strokeStyle = rodColor;
    ctx.lineWidth = 2.5 / this.zoomLevel;
    ctx.stroke();

    // Bob 1
    const r1 = Math.max(7, Math.min(18, Math.sqrt(this.params.m1) * 8)) / this.zoomLevel;
    ctx.beginPath();
    ctx.arc(pos.x1, pos.y1, r1, 0, 2 * Math.PI);
    ctx.fillStyle = bob1Color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / this.zoomLevel;
    ctx.stroke();

    // Bob 2
    const r2 = Math.max(7, Math.min(18, Math.sqrt(this.params.m2) * 8)) / this.zoomLevel;
    ctx.beginPath();
    ctx.arc(pos.x2, pos.y2, r2, 0, 2 * Math.PI);
    ctx.fillStyle = bob2Color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / this.zoomLevel;
    ctx.stroke();

    ctx.restore();
  }

  private drawDivergenceHUD(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const graphW = Math.min(320, width * 0.4);
    const graphH = 110;
    const pad = 16;
    const x0 = pad;
    const y0 = height - graphH - pad;

    ctx.save();

    // Background card
    ctx.fillStyle = 'rgba(12, 16, 23, 0.85)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, graphW, graphH, 10);
    ctx.fill();
    ctx.stroke();

    // Header label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('TRAJECTORY DIVERGENCE: ||r_B - r_A||', x0 + 10, y0 + 16);

    // Current separation readout
    const currentDist =
      this.divergenceHistory.length > 0
        ? this.divergenceHistory[this.divergenceHistory.length - 1].dist
        : 0;
    ctx.fillStyle = currentDist > 50 ? '#f43f5e' : '#38bdf8';
    ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`Δr: ${currentDist.toFixed(1)} px`, x0 + graphW - 90, y0 + 16);

    // Graph plotting area
    const plotX = x0 + 10;
    const plotY = y0 + 26;
    const plotW = graphW - 20;
    const plotH = graphH - 36;

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // Y max scale
    const maxVal = Math.max(
      100,
      ...this.divergenceHistory.map((d) => d.dist),
      (this.params.l1 + this.params.l2) * 2
    );

    // Plot line
    if (this.divergenceHistory.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.divergenceHistory.length; i++) {
        const d = this.divergenceHistory[i];
        const px = plotX + (i / (this.maxGraphPoints - 1)) * plotW;
        const py = plotY + plotH - (d.dist / maxVal) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawDualPhaseAndPoincareHUD(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
    const graphW = Math.min(350, width - 32);
    const graphH = 160;
    const pad = 16;
    const x0 = width - graphW - pad;
    const y0 = pad + 40;

    ctx.save();

    // Background card with glassmorphism
    ctx.fillStyle = 'rgba(12, 16, 23, 0.90)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, graphW, graphH, 10);
    ctx.fill();
    ctx.stroke();

    // Header label
    ctx.fillStyle = '#c084fc';
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('DUAL PHASE SPACE & POINCARÉ CUT', x0 + 10, y0 + 16);

    // Poincaré count badge
    if (this.poincarePoints.length > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9.5px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(`Poincaré: ${this.poincarePoints.length} pts`, x0 + graphW - 110, y0 + 16);
    }

    const subW = (graphW - 30) / 2;
    const subH = graphH - 42;
    const plotY = y0 + 28;
    const maxOmega = 20;

    // --- Sub-plot 1: Upper Arm Phase Space (theta1, omega1) ---
    const p1X = x0 + 10;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(p1X, plotY, subW, subH);

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(p1X, plotY + subH / 2);
    ctx.lineTo(p1X + subW, plotY + subH / 2);
    ctx.moveTo(p1X + subW / 2, plotY);
    ctx.lineTo(p1X + subW / 2, plotY + subH);
    ctx.stroke();

    // Sub-plot 1 label
    ctx.fillStyle = '#38bdf8';
    ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('(θ₁, ω₁) Upper', p1X + 4, plotY + 10);

    // Trace 1
    if (this.phaseHistory1.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.phaseHistory1.length; i++) {
        const pt = this.phaseHistory1[i];
        const nx = (pt.theta + Math.PI) / (2 * Math.PI);
        const ny = 0.5 - pt.omega / (2 * maxOmega);
        const px = p1X + Math.max(0, Math.min(subW, nx * subW));
        const py = plotY + Math.max(0, Math.min(subH, ny * subH));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    // In ensemble mode: render live instantaneous phase filament loop
    if (this.simMode === 'ensemble' && this.ensembleStates.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.ensembleStates.length; i++) {
        const s = this.ensembleStates[i];
        let th = ((s.theta1 + Math.PI) % (2 * Math.PI)) - Math.PI;
        if (th < -Math.PI) th += 2 * Math.PI;
        const nx = (th + Math.PI) / (2 * Math.PI);
        const ny = 0.5 - s.omega1 / (2 * maxOmega);
        const px = p1X + Math.max(0, Math.min(subW, nx * subW));
        const py = plotY + Math.max(0, Math.min(subH, ny * subH));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // --- Sub-plot 2: Lower Arm Phase Space (theta2, omega2) + Poincaré ---
    const p2X = x0 + 10 + subW + 10;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(p2X, plotY, subW, subH);

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(p2X, plotY + subH / 2);
    ctx.lineTo(p2X + subW, plotY + subH / 2);
    ctx.moveTo(p2X + subW / 2, plotY);
    ctx.lineTo(p2X + subW / 2, plotY + subH);
    ctx.stroke();

    // Sub-plot 2 label
    ctx.fillStyle = '#fbbf24';
    ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText('(θ₂, ω₂) & Cut', p2X + 4, plotY + 10);

    // Trace 2
    if (this.phaseHistory2.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.phaseHistory2.length; i++) {
        const pt = this.phaseHistory2[i];
        const nx = (pt.theta + Math.PI) / (2 * Math.PI);
        const ny = 0.5 - pt.omega / (2 * maxOmega);
        const px = p2X + Math.max(0, Math.min(subW, nx * subW));
        const py = plotY + Math.max(0, Math.min(subH, ny * subH));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    // In ensemble mode: render live instantaneous phase filament for Arm 2
    if (this.simMode === 'ensemble' && this.ensembleStates.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.ensembleStates.length; i++) {
        const s = this.ensembleStates[i];
        let th = ((s.theta2 + Math.PI) % (2 * Math.PI)) - Math.PI;
        if (th < -Math.PI) th += 2 * Math.PI;
        const nx = (th + Math.PI) / (2 * Math.PI);
        const ny = 0.5 - s.omega2 / (2 * maxOmega);
        const px = p2X + Math.max(0, Math.min(subW, nx * subW));
        const py = plotY + Math.max(0, Math.min(subH, ny * subH));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // Render Gold Poincaré Surface of Section Points: (theta2, omega2) when theta1 = 0
    if (this.poincarePoints.length > 0) {
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < this.poincarePoints.length; i++) {
        const pt = this.poincarePoints[i];
        const nx = (pt.theta + Math.PI) / (2 * Math.PI);
        const ny = 0.5 - pt.omega / (2 * maxOmega);
        const px = p2X + Math.max(0, Math.min(subW, nx * subW));
        const py = plotY + Math.max(0, Math.min(subH, ny * subH));
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    ctx.restore();
  }

  play(): void {
    this.isSimPlaying = true;
    this.updateControlsUI();
  }

  pause(): void {
    this.isSimPlaying = false;
    this.updateControlsUI();
  }

  isPlaying(): boolean {
    return this.isSimPlaying;
  }

  togglePlay(): boolean {
    this.isSimPlaying = !this.isSimPlaying;
    this.updateControlsUI();
    return this.isSimPlaying;
  }

  reset(): void {
    this.relaunchSimulation();
    this.updateControlsUI();
  }

  zoom(factor: number): void {
    this.zoomLevel = Math.max(0.3, Math.min(4.0, this.zoomLevel * factor));
  }

  destroy(): void {
    this.trailA = [];
    this.trailB = [];
    this.divergenceHistory = [];
    this.phaseHistory1 = [];
    this.phaseHistory2 = [];
    this.poincarePoints = [];
    this.ensembleStates = [];
    this.ensembleTrails = [];
  }

  onPointerDown(e: PointerEvent): void {
    if (this.simMode === 'ensemble') return; // Direct dragging disabled in ensemble mode for stability
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect || !this.canvas) return;

    const pivotX = this.canvas.width / (2 * dpr) + this.panX;
    const pivotY = this.canvas.height / (2.6 * dpr) + this.panY;
    const mouseX = (e.clientX - rect.left - pivotX) / this.zoomLevel;
    const mouseY = (e.clientY - rect.top - pivotY) / this.zoomLevel;

    const pos = getCartesianPositions(this.stateA, this.params, 0, 0);
    const d1 = Math.hypot(mouseX - pos.x1, mouseY - pos.y1);
    const d2 = Math.hypot(mouseX - pos.x2, mouseY - pos.y2);

    if (d2 < 30 / this.zoomLevel) {
      this.isDragging = true;
      this.draggedBob = 2;
    } else if (d1 < 30 / this.zoomLevel) {
      this.isDragging = true;
      this.draggedBob = 1;
    }
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging || !this.draggedBob || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const pivotX = this.canvas.width / (2 * dpr) + this.panX;
    const pivotY = this.canvas.height / (2.6 * dpr) + this.panY;

    const mouseX = (e.clientX - rect.left - pivotX) / this.zoomLevel;
    const mouseY = (e.clientY - rect.top - pivotY) / this.zoomLevel;

    if (this.draggedBob === 1) {
      this.stateA.theta1 = Math.atan2(mouseX, mouseY);
      this.stateA.omega1 = 0;
      this.stateA.omega2 = 0;
    } else if (this.draggedBob === 2) {
      const x1 = this.params.l1 * Math.sin(this.stateA.theta1);
      const y1 = this.params.l1 * Math.cos(this.stateA.theta1);
      this.stateA.theta2 = Math.atan2(mouseX - x1, mouseY - y1);
      this.stateA.omega1 = 0;
      this.stateA.omega2 = 0;
    }
  }

  onPointerUp(_e: PointerEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedBob = null;
      this.launchTheta1 = this.stateA.theta1;
      this.launchTheta2 = this.stateA.theta2;
      this.relaunchSimulation();
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomLevel *= factor;
  }

  getHudInfo(): { badge: string; coords: string } {
    const energy = computeTotalEnergy(this.stateA, this.params);
    const drift = Math.abs(energy.total - this.initialEnergy);
    const th1Deg = ((this.stateA.theta1 * 180) / Math.PI).toFixed(1);
    const th2Deg = ((this.stateA.theta2 * 180) / Math.PI).toFixed(1);
    const status = this.isSimPlaying ? 'RUNNING' : 'STOPPED';

    const modeStr =
      this.simMode === 'ensemble'
        ? `Ensemble (${this.ensembleCount} bobs)`
        : 'Twin Butterfly';

    const poincareStr = this.poincarePoints.length > 0 ? ` • Cut: ${this.poincarePoints.length} pts` : '';

    return {
      badge: `[${status}] ${modeStr} • t: ${this.simTime.toFixed(1)}s • E: ${energy.total.toFixed(1)} J (ΔE: ${drift.toFixed(3)} J)${poincareStr}`,
      coords: `θ₁: ${th1Deg}°, θ₂: ${th2Deg}° | Perturbation: ${this.simMode === 'ensemble' ? `${(this.ensembleDeltaRad * 1e5).toFixed(1)}×10⁻⁵ rad` : `${this.initialDeltaDeg}°`}`,
    };
  }

  getControlsHTML(): string {
    const th1Deg = Math.round((this.launchTheta1 * 180) / Math.PI);
    const th2Deg = Math.round((this.launchTheta2 * 180) / Math.PI);

    return `
      <!-- Master Control: Stop / Run / Reset -->
      <div class="control-group !border-amber-500/40 bg-gradient-to-b from-[#131926] to-[#0a0e16]">
        <div class="control-header">
          <span class="control-title text-amber-300">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Simulation Control
          </span>
          <span id="chaos-status-badge" class="px-2 py-0.5 rounded text-[10px] font-mono ${this.isSimPlaying ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'}">
            ${this.isSimPlaying ? '● RUNNING' : '❚❚ STOPPED'}
          </span>
        </div>
        <div class="flex space-x-2">
          <button id="btn-chaos-playpause" class="btn-primary flex-1 ${this.isSimPlaying ? '!bg-rose-600 hover:!bg-rose-500' : '!bg-emerald-600 hover:!bg-emerald-500'}">
            <span id="chaos-btn-play-text">${this.isSimPlaying ? '❚❚ Stop' : '▶ Run'}</span>
          </button>
          <button id="btn-relaunch" class="btn-secondary flex-1 border-amber-600/50 hover:border-amber-500 text-amber-200">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>Relaunch</span>
          </button>
        </div>
      </div>

      <!-- Mode Selector: Twin vs Silk Ribbon Ensemble -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            Experiment Mode
          </span>
        </div>
        <div class="space-y-3">
          <div class="segmented-control">
            <button id="mode-twin-btn" class="segmented-btn ${this.simMode === 'twin' ? 'active active-amber' : ''}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              <span>Twin Butterfly</span>
            </button>
            <button id="mode-ensemble-btn" class="segmented-btn ${this.simMode === 'ensemble' ? 'active active-amber' : ''}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              <span>Silk Ribbon</span>
            </button>
          </div>

          <!-- Ensemble settings -->
          <div id="ensemble-settings" class="${this.simMode === 'ensemble' ? '' : 'hidden'} space-y-3">
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Ensemble Size (Ribbon Strands)</span>
                <span id="val-ensemble-count" class="slider-val">${this.ensembleCount} bobs</span>
              </div>
              <input type="range" id="slider-ensemble-count" min="20" max="120" step="5" value="${this.ensembleCount}">
            </div>
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Micro-Perturbation (Δθ₀)</span>
                <span id="val-ensemble-delta" class="slider-val">${(this.ensembleDeltaRad * 1e5).toFixed(1)} × 10⁻⁵ rad</span>
              </div>
              <input type="range" id="slider-ensemble-delta" min="0.1" max="10.0" step="0.1" value="${(this.ensembleDeltaRad * 1e5).toFixed(1)}">
            </div>
          </div>

          <!-- Twin Settings -->
          <div id="twin-settings" class="${this.simMode === 'twin' ? '' : 'hidden'} space-y-3">
            <label class="toggle-switch">
              <span>Sensitivity Twin Test (Butterfly Effect)</span>
              <input type="checkbox" id="toggle-sensitivity" class="switch-input" ${this.sensitivityMode ? 'checked' : ''}>
            </label>
            <div class="slider-container" id="box-delta-theta">
              <div class="slider-label-row">
                <span>Initial Angular Difference (Δθ₀)</span>
                <span id="val-delta-theta" class="slider-val">${this.initialDeltaDeg}°</span>
              </div>
              <input type="range" id="slider-delta-theta" min="0.0001" max="0.05" step="0.0005" value="${this.initialDeltaDeg}">
            </div>
          </div>

          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Dynamic State Presets</label>
            <select id="chaos-preset-select">
              <option value="" disabled selected>Select a Physics Scenario...</option>
              ${CHAOS_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Initial Angles & Direct Manipulation -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Initial Angles (or Drag Bobs on Canvas!)
          </span>
        </div>
        <div class="space-y-3">
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Upper Angle θ₁</span>
              <span id="val-theta1" class="slider-val">${th1Deg}°</span>
            </div>
            <input type="range" id="slider-theta1" min="-180" max="180" step="1" value="${th1Deg}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Lower Angle θ₂</span>
              <span id="val-theta2" class="slider-val">${th2Deg}°</span>
            </div>
            <input type="range" id="slider-theta2" min="-180" max="180" step="1" value="${th2Deg}">
          </div>
        </div>
      </div>

      <!-- Physical System Properties -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
            Physical Parameters
          </span>
        </div>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Arm Length L₁</span>
                <span id="val-l1" class="slider-val">${this.params.l1}</span>
              </div>
              <input type="range" id="slider-l1" min="60" max="220" step="5" value="${this.params.l1}">
            </div>
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Arm Length L₂</span>
                <span id="val-l2" class="slider-val">${this.params.l2}</span>
              </div>
              <input type="range" id="slider-l2" min="60" max="220" step="5" value="${this.params.l2}">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Mass m₁</span>
                <span id="val-m1" class="slider-val">${this.params.m1.toFixed(1)} kg</span>
              </div>
              <input type="range" id="slider-m1" min="0.5" max="5.0" step="0.1" value="${this.params.m1}">
            </div>
            <div class="slider-container">
              <div class="slider-label-row">
                <span>Mass m₂</span>
                <span id="val-m2" class="slider-val">${this.params.m2.toFixed(1)} kg</span>
              </div>
              <input type="range" id="slider-m2" min="0.5" max="5.0" step="0.1" value="${this.params.m2}">
            </div>
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Gravity g</span>
              <span id="val-gravity" class="slider-val">${this.params.g.toFixed(1)} m/s²</span>
            </div>
            <input type="range" id="slider-gravity" min="0.0" max="25.0" step="0.5" value="${this.params.g}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Viscous Damping</span>
              <span id="val-damping" class="slider-val">${(this.params.damping * 1000).toFixed(1)}e-3</span>
            </div>
            <input type="range" id="slider-damping" min="0" max="0.005" step="0.0001" value="${this.params.damping}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Simulation Speed</span>
              <span id="val-sim-speed" class="slider-val">${this.simSpeed.toFixed(1)}x</span>
            </div>
            <input type="range" id="slider-sim-speed" min="0.1" max="2.5" step="0.1" value="${this.simSpeed}">
          </div>
        </div>
      </div>

      <!-- Visualization Options -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            Display & Overlays
          </span>
          <div class="flex items-center space-x-1.5">
            <button id="btn-clear-poincare" class="btn-secondary !py-0.5 !px-2 text-[11px] text-amber-300 border-amber-600/50 hover:border-amber-400" title="Clear Poincaré surface of section points">Clear Cut</button>
            <button id="btn-clear-trail" class="btn-secondary !py-0.5 !px-2 text-[11px]">Clear Trail</button>
          </div>
        </div>
        <div class="space-y-3">
          <label class="toggle-switch">
            <span>Show Trajectory Trails</span>
            <input type="checkbox" id="toggle-trail" class="switch-input" ${this.showTrail ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Divergence HUD Graph</span>
            <input type="checkbox" id="toggle-graph" class="switch-input" ${this.showGraph ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Dual Phase Space & Poincaré Cut</span>
            <input type="checkbox" id="toggle-phase" class="switch-input" ${this.showPhasePortrait ? 'checked' : ''}>
          </label>
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Trail History Length</span>
              <span id="val-trail-len" class="slider-val">${this.trailLength} pts</span>
            </div>
            <input type="range" id="slider-trail-len" min="50" max="1500" step="50" value="${this.trailLength}">
          </div>
        </div>
      </div>
    `;
  }

  bindControls(container: HTMLElement): void {
    this.containerEl = container;

    // Play/Pause
    const playPauseBtn = container.querySelector('#btn-chaos-playpause');
    playPauseBtn?.addEventListener('click', () => this.togglePlay());

    // Relaunch
    const relaunchBtn = container.querySelector('#btn-relaunch');
    relaunchBtn?.addEventListener('click', () => this.relaunchSimulation());

    // Mode switching
    const modeTwinBtn = container.querySelector('#mode-twin-btn');
    const modeEnsembleBtn = container.querySelector('#mode-ensemble-btn');
    const twinSettings = container.querySelector('#twin-settings');
    const ensembleSettings = container.querySelector('#ensemble-settings');

    modeTwinBtn?.addEventListener('click', () => {
      this.simMode = 'twin';
      modeTwinBtn.className = 'segmented-btn active active-amber';
      if (modeEnsembleBtn) modeEnsembleBtn.className = 'segmented-btn';
      twinSettings?.classList.remove('hidden');
      ensembleSettings?.classList.add('hidden');
      this.relaunchSimulation();
    });

    modeEnsembleBtn?.addEventListener('click', () => {
      this.simMode = 'ensemble';
      modeEnsembleBtn.className = 'segmented-btn active active-amber';
      if (modeTwinBtn) modeTwinBtn.className = 'segmented-btn';
      ensembleSettings?.classList.remove('hidden');
      twinSettings?.classList.add('hidden');
      this.relaunchSimulation();
    });

    // Ensemble slider listeners
    const ensCountSlider = container.querySelector('#slider-ensemble-count') as HTMLInputElement | null;
    const ensCountVal = container.querySelector('#val-ensemble-count');
    ensCountSlider?.addEventListener('input', () => {
      this.ensembleCount = parseInt(ensCountSlider.value, 10);
      if (ensCountVal) ensCountVal.textContent = `${this.ensembleCount} bobs`;
      this.relaunchSimulation();
    });

    const ensDeltaSlider = container.querySelector('#slider-ensemble-delta') as HTMLInputElement | null;
    const ensDeltaVal = container.querySelector('#val-ensemble-delta');
    ensDeltaSlider?.addEventListener('input', () => {
      const val = parseFloat(ensDeltaSlider.value);
      this.ensembleDeltaRad = val * 1e-5;
      if (ensDeltaVal) ensDeltaVal.textContent = `${val.toFixed(1)} × 10⁻⁵ rad`;
      this.relaunchSimulation();
    });

    // Preset selector
    const presetSelect = container.querySelector('#chaos-preset-select') as HTMLSelectElement | null;
    presetSelect?.addEventListener('change', () => {
      const idx = parseInt(presetSelect.value, 10);
      const p = CHAOS_PRESETS[idx];
      if (p) {
        this.launchTheta1 = (p.theta1Deg * Math.PI) / 180;
        this.launchTheta2 = (p.theta2Deg * Math.PI) / 180;
        this.params.l1 = p.l1;
        this.params.l2 = p.l2;
        this.params.m1 = p.m1;
        this.params.m2 = p.m2;
        this.params.g = p.g;
        this.params.damping = p.damping;
        this.relaunchSimulation();
        this.updateControlsUI();
      }
    });

    // Sensitivity toggle
    const sensToggle = container.querySelector('#toggle-sensitivity') as HTMLInputElement | null;
    const deltaBox = container.querySelector('#box-delta-theta');
    sensToggle?.addEventListener('change', () => {
      this.sensitivityMode = sensToggle.checked;
      if (this.sensitivityMode) deltaBox?.classList.remove('hidden');
      else deltaBox?.classList.add('hidden');
      this.relaunchSimulation();
    });

    // Delta Theta slider
    const deltaSlider = container.querySelector('#slider-delta-theta') as HTMLInputElement | null;
    const deltaVal = container.querySelector('#val-delta-theta');
    deltaSlider?.addEventListener('input', () => {
      this.initialDeltaDeg = parseFloat(deltaSlider.value);
      if (deltaVal) deltaVal.textContent = `${this.initialDeltaDeg}°`;
      this.relaunchSimulation();
    });

    // Angle sliders
    const th1Slider = container.querySelector('#slider-theta1') as HTMLInputElement | null;
    const th1Val = container.querySelector('#val-theta1');
    th1Slider?.addEventListener('input', () => {
      const deg = parseFloat(th1Slider.value);
      this.launchTheta1 = (deg * Math.PI) / 180;
      if (th1Val) th1Val.textContent = `${deg}°`;
      this.relaunchSimulation();
    });

    const th2Slider = container.querySelector('#slider-theta2') as HTMLInputElement | null;
    const th2Val = container.querySelector('#val-theta2');
    th2Slider?.addEventListener('input', () => {
      const deg = parseFloat(th2Slider.value);
      this.launchTheta2 = (deg * Math.PI) / 180;
      if (th2Val) th2Val.textContent = `${deg}°`;
      this.relaunchSimulation();
    });

    // Length and Mass Sliders
    const l1Slider = container.querySelector('#slider-l1') as HTMLInputElement | null;
    const l1Val = container.querySelector('#val-l1');
    l1Slider?.addEventListener('input', () => {
      this.params.l1 = parseFloat(l1Slider.value);
      if (l1Val) l1Val.textContent = String(this.params.l1);
    });

    const l2Slider = container.querySelector('#slider-l2') as HTMLInputElement | null;
    const l2Val = container.querySelector('#val-l2');
    l2Slider?.addEventListener('input', () => {
      this.params.l2 = parseFloat(l2Slider.value);
      if (l2Val) l2Val.textContent = String(this.params.l2);
    });

    const m1Slider = container.querySelector('#slider-m1') as HTMLInputElement | null;
    const m1Val = container.querySelector('#val-m1');
    m1Slider?.addEventListener('input', () => {
      this.params.m1 = parseFloat(m1Slider.value);
      if (m1Val) m1Val.textContent = `${this.params.m1.toFixed(1)} kg`;
    });

    const m2Slider = container.querySelector('#slider-m2') as HTMLInputElement | null;
    const m2Val = container.querySelector('#val-m2');
    m2Slider?.addEventListener('input', () => {
      this.params.m2 = parseFloat(m2Slider.value);
      if (m2Val) m2Val.textContent = `${this.params.m2.toFixed(1)} kg`;
    });

    const gSlider = container.querySelector('#slider-gravity') as HTMLInputElement | null;
    const gVal = container.querySelector('#val-gravity');
    gSlider?.addEventListener('input', () => {
      this.params.g = parseFloat(gSlider.value);
      if (gVal) gVal.textContent = `${this.params.g.toFixed(1)} m/s²`;
    });

    const dampSlider = container.querySelector('#slider-damping') as HTMLInputElement | null;
    const dampVal = container.querySelector('#val-damping');
    dampSlider?.addEventListener('input', () => {
      this.params.damping = parseFloat(dampSlider.value);
      if (dampVal) dampVal.textContent = `${(this.params.damping * 1000).toFixed(1)}e-3`;
    });

    const simSpeedSlider = container.querySelector('#slider-sim-speed') as HTMLInputElement | null;
    const simSpeedVal = container.querySelector('#val-sim-speed');
    simSpeedSlider?.addEventListener('input', () => {
      this.simSpeed = parseFloat(simSpeedSlider.value);
      if (simSpeedVal) simSpeedVal.textContent = `${this.simSpeed.toFixed(1)}x`;
    });

    // Trail and HUD toggles
    const trailToggle = container.querySelector('#toggle-trail') as HTMLInputElement | null;
    trailToggle?.addEventListener('change', () => {
      this.showTrail = trailToggle.checked;
    });

    const graphToggle = container.querySelector('#toggle-graph') as HTMLInputElement | null;
    graphToggle?.addEventListener('change', () => {
      this.showGraph = graphToggle.checked;
    });

    const phaseToggle = container.querySelector('#toggle-phase') as HTMLInputElement | null;
    phaseToggle?.addEventListener('change', () => {
      this.showPhasePortrait = phaseToggle.checked;
    });

    const trailLenSlider = container.querySelector('#slider-trail-len') as HTMLInputElement | null;
    const trailLenVal = container.querySelector('#val-trail-len');
    trailLenSlider?.addEventListener('input', () => {
      this.trailLength = parseInt(trailLenSlider.value, 10);
      if (trailLenVal) trailLenVal.textContent = `${this.trailLength} pts`;
    });

    const clearPoincareBtn = container.querySelector('#btn-clear-poincare');
    clearPoincareBtn?.addEventListener('click', () => {
      this.poincarePoints = [];
    });

    const clearTrailBtn = container.querySelector('#btn-clear-trail');
    clearTrailBtn?.addEventListener('click', () => {
      this.trailA = [];
      this.trailB = [];
      this.divergenceHistory = [];
      this.phaseHistory1 = [];
      this.phaseHistory2 = [];
      this.poincarePoints = [];
      this.ensembleTrails = this.ensembleStates.map(() => []);
    });

    this.updateControlsUI();
  }

  private updateControlsUI(): void {
    if (!this.containerEl) return;

    const badge = this.containerEl.querySelector('#chaos-status-badge');
    const playBtn = this.containerEl.querySelector('#btn-chaos-playpause');
    const playText = this.containerEl.querySelector('#chaos-btn-play-text');

    if (badge) {
      if (this.isSimPlaying) {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/60';
        badge.textContent = '● RUNNING';
      } else {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-300 border border-rose-800/60';
        badge.textContent = '❚❚ STOPPED';
      }
    }

    if (playBtn && playText) {
      if (this.isSimPlaying) {
        playBtn.className = 'btn-primary flex-1 !bg-rose-600 hover:!bg-rose-500';
        playText.textContent = '❚❚ Stop';
      } else {
        playBtn.className = 'btn-primary flex-1 !bg-emerald-600 hover:!bg-emerald-500';
        playText.textContent = '▶ Run';
      }
    }
  }

  getTheoryHTML(): string {
    return `
      <!-- Theory 1 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Deterministic Chaos & The Silk Ribbon</span>
          <span class="text-xs text-amber-400 font-mono">01</span>
        </div>
        <div class="theory-content">
          <p>
            The double pendulum is <strong>100% deterministic</strong>: no random number generators exist in this simulation.
          </p>
          <p>
            In <strong>Silk Ribbon Ensemble Mode</strong>, an ensemble of 75 pendulums is released simultaneously with an imperceptible microscopic angular perturbation of $\\Delta\\theta_0 = 10^{-5}\\text{ rad}$ ($0.00057^\\circ$).
          </p>
          <p>
            Initially, the pendulums oscillate in unison as an undulating, silky ribbon of light. Because the maximal Lyapunov exponent $\\lambda > 0$, the phase space volume shears, stretches, and folds, disintegrating the coherent fabric into deterministic chaos.
          </p>
        </div>
      </div>

      <!-- Theory 2 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>The Lagrangian Equations of Motion</span>
          <span class="text-xs text-cyan-400 font-mono">02</span>
        </div>
        <div class="theory-content">
          <p>
            For angles $\\theta_1, \\theta_2$ relative to downward vertical, kinetic energy $T$ and potential energy $V$ define the Lagrangian $\\mathcal{L} = T - V$:
          </p>
          <div class="math-block">
            $$\\frac{d}{dt}\\left(\\frac{\\partial \\mathcal{L}}{\\partial \\dot{\\theta}_i}\\right) - \\frac{\\partial \\mathcal{L}}{\\partial \\theta_i} = 0$$
          </div>
          <p>
            Centrifugal acceleration $\\dot{\\theta}^2$ and trigonometric coupling $\\sin(\\theta_1 - \\theta_2)$ introduce explosive non-linear feedback whenever the bobs flip over the horizontal plane.
          </p>
        </div>
      </div>

      <!-- Theory 3 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Dual Phase Space & Poincaré Surface of Section</span>
          <span class="text-xs text-purple-400 font-mono">03</span>
        </div>
        <div class="theory-content">
          <p>
            The upper-right HUD charts generalized coordinates $(\\theta_1, \\omega_1)$ and $(\\theta_2, \\omega_2)$. In ensemble mode, Liouville's theorem preserves the symplectic 2-form $d\\theta \\wedge d\\omega = \\text{const}$, deforming the initial line into a fractal filament.
          </p>
          <p>
            The golden dots in the right pane represent the <strong>Poincaré Surface of Section</strong>: points sampled whenever the upper arm crosses vertical $(\\theta_1 = 0)$ with $\\omega_1 > 0$. Over time, these stroboscopic punctures uncover the Cantor-like fractal cross-section of the chaotic attractor.
          </p>
        </div>
      </div>

      <!-- Theory 4 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Energy Conservation via RK4</span>
          <span class="text-xs text-emerald-400 font-mono">04</span>
        </div>
        <div class="theory-content">
          <p>
            Total mechanical energy $E = T + V$ is tracked in real-time. Notice the $\\Delta E$ readout in the HUD: 16 sub-steps of 4th-order Runge-Kutta numerical integration ensure minimal numerical energy drift even through violent loops.
          </p>
        </div>
      </div>
    `;
  }
}
