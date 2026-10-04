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

  // Trajectory history for trails
  private trailA: { x: number; y: number }[] = [];
  private trailB: { x: number; y: number }[] = [];

  // Divergence graph history: { t: number, dist: number }
  private divergenceHistory: { t: number; dist: number }[] = [];
  private maxGraphPoints = 300;

  // Dragging interaction
  private isDragging = false;
  private draggedBob: 1 | 2 | null = null;

  // Pan & Zoom
  private zoomLevel = 1.0;
  private panX = 0;
  private panY = -30; // slightly offset pivot upward

  private containerEl: HTMLElement | null = null;

  // Configured initial launch angles
  private launchTheta1 = (120 * Math.PI) / 180;
  private launchTheta2 = (120 * Math.PI) / 180;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.relaunchTwins();
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
  }

  relaunchTwins(): void {
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

    this.simTime = 0;
    this.trailA = [];
    this.trailB = [];
    this.divergenceHistory = [];
    this.isSimPlaying = true;
    this.updateControlsUI();
  }

  resetSimulation(): void {
    this.relaunchTwins();
  }

  update(dt: number, _time: number): void {
    if (!this.isSimPlaying || this.isDragging) return;

    // Safeguard against numerical NaN or Infinity
    if (!Number.isFinite(this.stateA.theta1) || !Number.isFinite(this.stateA.omega1)) {
      this.relaunchTwins();
      return;
    }
    if (this.sensitivityMode && (!Number.isFinite(this.stateB.theta1) || !Number.isFinite(this.stateB.omega1))) {
      this.relaunchTwins();
      return;
    }

    // Sub-stepping for maximum RK4 stability & accuracy
    const subSteps = 15;
    const scaledDt = (Math.min(dt, 0.05) * this.simSpeed) / subSteps;

    for (let step = 0; step < subSteps; step++) {
      // Step Pendulum A
      this.stateA = rk4Step(this.stateA, this.params, scaledDt);

      // Step Pendulum B if sensitivity mode active
      if (this.sensitivityMode) {
        this.stateB = rk4Step(this.stateB, this.params, scaledDt);
      }
    }

    this.simTime += dt * this.simSpeed;

    // Calculate positions
    const posA = getCartesianPositions(this.stateA, this.params, 0, 0);
    this.trailA.push({ x: posA.x2, y: posA.y2 });
    if (this.trailA.length > this.trailLength) this.trailA.shift();

    if (this.sensitivityMode) {
      const posB = getCartesianPositions(this.stateB, this.params, 0, 0);
      this.trailB.push({ x: posB.x2, y: posB.y2 });
      if (this.trailB.length > this.trailLength) this.trailB.shift();

      // Record separation distance
      const dist = Math.hypot(posB.x2 - posA.x2, posB.y2 - posA.y2);
      this.divergenceHistory.push({ t: this.simTime, dist });
      if (this.divergenceHistory.length > this.maxGraphPoints) {
        this.divergenceHistory.shift();
      }
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
    bgGlow.addColorStop(1, 'rgba(5, 7, 13, 0.8)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    // Draw Pendulum Simulation View
    ctx.save();
    ctx.translate(pivotScreenX, pivotScreenY);
    ctx.scale(this.zoomLevel, this.zoomLevel);

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
      this.drawPendulumBody(
        ctx,
        posB,
        'rgba(244, 63, 94, 0.65)',
        '#f43f5e',
        '#fb7185',
        false
      );
    }

    // Pendulum A (Main)
    const posA = getCartesianPositions(this.stateA, this.params, 0, 0);
    this.drawPendulumBody(
      ctx,
      posA,
      'rgba(56, 189, 248, 0.95)',
      '#0ea5e9',
      '#38bdf8',
      true
    );

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

    // Real-time Divergence HUD Graph in bottom-left
    if (this.sensitivityMode && this.showGraph) {
      this.drawDivergenceHUD(ctx, width, height);
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

    const maxSep = (this.params.l1 + this.params.l2) * 2;
    const curDist = this.divergenceHistory.length > 0
      ? this.divergenceHistory[this.divergenceHistory.length - 1].dist
      : 0;

    ctx.fillStyle = curDist > 20 ? '#f43f5e' : '#38bdf8';
    ctx.fillText(`Δ: ${curDist.toFixed(1)} px`, x0 + graphW - 65, y0 + 16);

    // Plot area
    const plotX = x0 + 10;
    const plotY = y0 + 26;
    const plotW = graphW - 20;
    const plotH = graphH - 36;

    // Grid line
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(plotX, plotY + plotH / 2);
    ctx.lineTo(plotX + plotW, plotY + plotH / 2);
    ctx.stroke();

    // Plot curve
    if (this.divergenceHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;

      for (let i = 0; i < this.divergenceHistory.length; i++) {
        const item = this.divergenceHistory[i];
        const px = plotX + (i / (this.maxGraphPoints - 1)) * plotW;
        // Normalize distance to plot height
        const norm = Math.min(1, item.dist / maxSep);
        const py = plotY + plotH - norm * plotH;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  destroy(): void {
    this.trailA = [];
    this.trailB = [];
    this.divergenceHistory = [];
  }

  play(): void {
    this.isSimPlaying = true;
  }

  pause(): void {
    this.isSimPlaying = false;
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
    this.launchTheta1 = (120 * Math.PI) / 180;
    this.launchTheta2 = (120 * Math.PI) / 180;
    this.relaunchTwins();
  }

  zoom(factor: number): void {
    this.zoomLevel *= factor;
  }

  onPointerDown(e: PointerEvent): void {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const pivotX = this.canvas.width / (2 * dpr) + this.panX;
    const pivotY = this.canvas.height / (2.6 * dpr) + this.panY;

    const mouseX = ((e.clientX - rect.left) - pivotX) / this.zoomLevel;
    const mouseY = ((e.clientY - rect.top) - pivotY) / this.zoomLevel;

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

    const mouseX = ((e.clientX - rect.left) - pivotX) / this.zoomLevel;
    const mouseY = ((e.clientY - rect.top) - pivotY) / this.zoomLevel;

    if (this.draggedBob === 1) {
      // Direct angle to cursor
      this.stateA.theta1 = Math.atan2(mouseX, mouseY);
      this.stateA.omega1 = 0;
      this.stateA.omega2 = 0;
    } else if (this.draggedBob === 2) {
      // Inverse kinematics orientation for arm 2 from arm 1 position
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
      // Store released angles as new launch baseline
      this.launchTheta1 = this.stateA.theta1;
      this.launchTheta2 = this.stateA.theta2;
      this.relaunchTwins();
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomLevel *= factor;
  }

  getHudInfo(): { badge: string; coords: string } {
    const energy = computeTotalEnergy(this.stateA, this.params);
    const th1Deg = ((this.stateA.theta1 * 180) / Math.PI).toFixed(1);
    const th2Deg = ((this.stateA.theta2 * 180) / Math.PI).toFixed(1);
    const status = this.isSimPlaying ? 'RUNNING' : 'STOPPED';

    return {
      badge: `[${status}] t: ${this.simTime.toFixed(1)}s • Energy: ${energy.total.toFixed(1)} J`,
      coords: `θ₁: ${th1Deg}°, θ₂: ${th2Deg}° | Sensitivity Δθ₀: ${this.initialDeltaDeg}°`,
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
            <span>Relaunch Twins</span>
          </button>
        </div>
      </div>

      <!-- Presets & Sensitivity Experiment Mode -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Chaos Configuration
          </span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Dynamic State Presets</label>
            <select id="chaos-preset-select">
              <option value="" disabled selected>Select a Physics Scenario...</option>
              ${CHAOS_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
            </select>
          </div>

          <label class="toggle-switch">
            <span>Sensitivity Twin Test (The Butterfly Effect)</span>
            <input type="checkbox" id="toggle-sensitivity" class="switch-input" ${this.sensitivityMode ? 'checked' : ''}>
          </label>

          <div class="slider-container ${this.sensitivityMode ? '' : 'hidden'}" id="box-delta-theta">
            <div class="slider-label-row">
              <span>Initial Angular Difference (Δθ₀)</span>
              <span id="val-delta-theta" class="slider-val">${this.initialDeltaDeg}°</span>
            </div>
            <input type="range" id="slider-delta-theta" min="0.0001" max="0.1" step="0.0005" value="${this.initialDeltaDeg}">
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
            Display & Trails
          </span>
          <button id="btn-clear-trail" class="btn-secondary !py-0.5 !px-2 text-[11px]">Clear Trail</button>
        </div>
        <div class="space-y-3">
          <label class="toggle-switch">
            <span>Show Glowing Trajectory Trails</span>
            <input type="checkbox" id="toggle-trail" class="switch-input" ${this.showTrail ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Real-Time Divergence HUD Graph</span>
            <input type="checkbox" id="toggle-graph" class="switch-input" ${this.showGraph ? 'checked' : ''}>
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

    // Play/Pause button
    const playPauseBtn = container.querySelector('#btn-chaos-playpause');
    playPauseBtn?.addEventListener('click', () => {
      this.togglePlay();
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
        this.relaunchTwins();
        this.updateControlsUI();
      }
    });

    // Sensitivity toggle
    const sensToggle = container.querySelector('#toggle-sensitivity') as HTMLInputElement | null;
    const deltaBox = container.querySelector('#box-delta-theta');
    sensToggle?.addEventListener('change', () => {
      this.sensitivityMode = sensToggle.checked;
      if (this.sensitivityMode) {
        deltaBox?.classList.remove('hidden');
      } else {
        deltaBox?.classList.add('hidden');
      }
      this.relaunchTwins();
    });

    // Delta Theta slider
    const deltaSlider = container.querySelector('#slider-delta-theta') as HTMLInputElement | null;
    const deltaVal = container.querySelector('#val-delta-theta');
    deltaSlider?.addEventListener('input', () => {
      this.initialDeltaDeg = parseFloat(deltaSlider.value);
      if (deltaVal) deltaVal.textContent = `${this.initialDeltaDeg}°`;
      this.relaunchTwins();
    });

    // Angle sliders
    const th1Slider = container.querySelector('#slider-theta1') as HTMLInputElement | null;
    const th2Slider = container.querySelector('#slider-theta2') as HTMLInputElement | null;
    const th1Val = container.querySelector('#val-theta1');
    const th2Val = container.querySelector('#val-theta2');

    const updateAngles = () => {
      if (th1Slider && th2Slider) {
        this.launchTheta1 = (parseFloat(th1Slider.value) * Math.PI) / 180;
        this.launchTheta2 = (parseFloat(th2Slider.value) * Math.PI) / 180;
        if (th1Val) th1Val.textContent = `${th1Slider.value}°`;
        if (th2Val) th2Val.textContent = `${th2Slider.value}°`;
        this.relaunchTwins();
      }
    };
    th1Slider?.addEventListener('input', updateAngles);
    th2Slider?.addEventListener('input', updateAngles);

    // Physical parameter sliders
    const l1Slider = container.querySelector('#slider-l1') as HTMLInputElement | null;
    const l2Slider = container.querySelector('#slider-l2') as HTMLInputElement | null;
    const l1Val = container.querySelector('#val-l1');
    const l2Val = container.querySelector('#val-l2');
    l1Slider?.addEventListener('input', () => {
      this.params.l1 = parseFloat(l1Slider.value);
      if (l1Val) l1Val.textContent = String(this.params.l1);
      this.relaunchTwins();
    });
    l2Slider?.addEventListener('input', () => {
      this.params.l2 = parseFloat(l2Slider.value);
      if (l2Val) l2Val.textContent = String(this.params.l2);
      this.relaunchTwins();
    });

    const m1Slider = container.querySelector('#slider-m1') as HTMLInputElement | null;
    const m2Slider = container.querySelector('#slider-m2') as HTMLInputElement | null;
    const m1Val = container.querySelector('#val-m1');
    const m2Val = container.querySelector('#val-m2');
    m1Slider?.addEventListener('input', () => {
      this.params.m1 = parseFloat(m1Slider.value);
      if (m1Val) m1Val.textContent = `${this.params.m1.toFixed(1)} kg`;
    });
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

    // Trail options
    const trailToggle = container.querySelector('#toggle-trail') as HTMLInputElement | null;
    trailToggle?.addEventListener('change', () => {
      this.showTrail = trailToggle.checked;
    });

    const graphToggle = container.querySelector('#toggle-graph') as HTMLInputElement | null;
    graphToggle?.addEventListener('change', () => {
      this.showGraph = graphToggle.checked;
    });

    const trailLenSlider = container.querySelector('#slider-trail-len') as HTMLInputElement | null;
    const trailLenVal = container.querySelector('#val-trail-len');
    trailLenSlider?.addEventListener('input', () => {
      this.trailLength = parseInt(trailLenSlider.value, 10);
      if (trailLenVal) trailLenVal.textContent = `${this.trailLength} pts`;
    });

    const clearTrailBtn = container.querySelector('#btn-clear-trail');
    clearTrailBtn?.addEventListener('click', () => {
      this.trailA = [];
      this.trailB = [];
      this.divergenceHistory = [];
    });

    const relaunchBtn = container.querySelector('#btn-relaunch');
    relaunchBtn?.addEventListener('click', () => {
      this.relaunchTwins();
    });

    this.updateControlsUI();
  }

  private updateControlsUI(): void {
    if (!this.containerEl) return;

    // Update status badge & play/pause button
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

    // Update sliders
    const th1Slider = this.containerEl.querySelector('#slider-theta1') as HTMLInputElement | null;
    const th2Slider = this.containerEl.querySelector('#slider-theta2') as HTMLInputElement | null;
    const th1Val = this.containerEl.querySelector('#val-theta1');
    const th2Val = this.containerEl.querySelector('#val-theta2');

    const deg1 = Math.round((this.launchTheta1 * 180) / Math.PI);
    const deg2 = Math.round((this.launchTheta2 * 180) / Math.PI);
    if (th1Slider) th1Slider.value = String(deg1);
    if (th2Slider) th2Slider.value = String(deg2);
    if (th1Val) th1Val.textContent = `${deg1}°`;
    if (th2Val) th2Val.textContent = `${deg2}°`;
  }

  getTheoryHTML(): string {
    return `
      <!-- Theory 1 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Deterministic Chaos vs. Randomness</span>
          <span class="text-xs text-amber-400 font-mono">01</span>
        </div>
        <div class="theory-content">
          <p>
            A common misconception is that <em>chaos</em> means random, unpredictable dice rolls. In reality, the double pendulum is <strong>100% deterministic</strong>: its trajectory is governed strictly by Newton's and Euler-Lagrange's equations of motion without a single random number.
          </p>
          <p>
            What makes it chaotic is <strong>extreme sensitivity to initial conditions</strong>: two states that start infinitesimally close diverge at an exponential rate over time.
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
            For two connected pendulums with angles $\\theta_1$ and $\\theta_2$ relative to the downward vertical, the system's kinetic energy $T$ and potential energy $V$ define the Lagrangian $\\mathcal{L} = T - V$.
          </p>
          <p>
            Applying Euler-Lagrange equations produces coupled non-linear differential equations:
          </p>
          <div class="math-block">
            $$\\frac{d}{dt}\\left(\\frac{\\partial \\mathcal{L}}{\\partial \\dot{\\theta}_i}\\right) - \\frac{\\partial \\mathcal{L}}{\\partial \\theta_i} = 0$$
          </div>
          <p>
            The terms $\\sin(\\theta_1 - \\theta_2)$ and centrifugal coupling $\\dot{\\theta}^2$ introduce violent non-linear feedback whenever the system gains enough energy to loop over the top.
          </p>
        </div>
      </div>

      <!-- Theory 3 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Lyapunov Exponent & The Butterfly Effect</span>
          <span class="text-xs text-purple-400 font-mono">03</span>
        </div>
        <div class="theory-content">
          <p>
            If two trajectories start with an initial separation $\\delta(0)$, their future divergence grows exponentially:
          </p>
          <div class="math-block">
            $$\\|\\delta(t)\\| \\approx \\|\\delta(0)\\| e^{\\lambda t}$$
          </div>
          <p>
            where $\\lambda > 0$ is the <strong>maximal Lyapunov exponent</strong>. This sets an inescapable <em>predictability horizon</em>: even a microscopic uncertainty (like air thermal fluctuations or computer rounding at the 16th decimal place) doubles repeatedly until the long-term future becomes completely decoupled from predictions.
          </p>
        </div>
      </div>

      <!-- Theory 4 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Try This Experiment!</span>
          <span class="text-xs text-amber-400 font-mono">04</span>
        </div>
        <div class="theory-content">
          <p class="text-xs text-slate-300">
            1. Keep <strong>Sensitivity Twin Test</strong> active with $\\Delta\\theta_0 = 0.001^\\circ$.<br>
            2. Hit <strong>Relaunch Twins</strong> and watch the cyan and rose pendulums.<br>
            3. For the first few seconds, they look like a single blended arm.<br>
            4. Look at the <strong>Divergence Graph</strong> in the bottom-left corner: as soon as the first full loop occurs, the curve suddenly skyrockets exponentially, and the twins swing into completely opposite directions!
          </p>
        </div>
      </div>
    `;
  }
}
