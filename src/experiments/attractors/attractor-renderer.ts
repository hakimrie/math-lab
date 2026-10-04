import { Experiment } from '../experiment';
import { ATTRACTOR_SYSTEMS, AttractorSystem } from './presets';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  life: number;
  maxLife: number;
  group?: number; // 0: primary (cyan), 1: twin (magenta)
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export class AttractorRenderer implements Experiment {
  id = 'attractors';
  name = '3D Strange Attractors';
  badge = 'Chaos in 3D';
  category = 'Dynamic Systems';
  accentColor = '#10b981';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Active System State
  private currentSystemKey = 'lorenz';
  private currentSystem: AttractorSystem = ATTRACTOR_SYSTEMS['lorenz'];
  private currentParams: Record<string, number> = { ...ATTRACTOR_SYSTEMS['lorenz'].defaultParams };

  // 3D Camera & Projection
  private cameraAzimuth = 0.8;
  private cameraElevation = 0.35;
  private cameraDistance = 180;
  private cameraFocalLength = 400;
  private autoRotate = true;
  private autoRotateSpeed = 0.4;
  private zoomLevel = 1.0;

  serializeState(): Record<string, string | number | boolean> {
    const s: Record<string, string | number | boolean> = {
      sys: this.currentSystemKey,
      mode: this.vizMode,
      pal: this.colorPalette,
      zoom: Number(this.zoomLevel.toFixed(3)),
      az: Number(this.cameraAzimuth.toFixed(3)),
      el: Number(this.cameraElevation.toFixed(3)),
    };
    for (const [k, v] of Object.entries(this.currentParams)) {
      s[k] = Number(v.toFixed(3));
    }
    return s;
  }

  deserializeState(state: Record<string, string>): void {
    if (state.sys && ATTRACTOR_SYSTEMS[state.sys]) {
      this.currentSystemKey = state.sys;
      this.currentSystem = ATTRACTOR_SYSTEMS[state.sys];
      this.currentParams = { ...this.currentSystem.defaultParams };
    }
    if (state.mode && (state.mode === 'particles' || state.mode === 'streamline' || state.mode === 'twin_lyapunov')) {
      this.vizMode = state.mode;
    }
    if (state.pal) {
      this.colorPalette = state.pal as any;
    }
    if (state.zoom !== undefined) this.zoomLevel = parseFloat(state.zoom);
    if (state.az !== undefined) this.cameraAzimuth = parseFloat(state.az);
    if (state.el !== undefined) this.cameraElevation = parseFloat(state.el);

    for (const [k, v] of Object.entries(state)) {
      if (this.currentParams[k] !== undefined) {
        this.currentParams[k] = parseFloat(v);
      }
    }

    this.resetSimulation();
    this.refreshModeButtons();
    this.updateControlsUI();
  }

  // Dragging & Interaction
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Visualization Modes: 'particles' | 'streamline' | 'twin_lyapunov'
  private vizMode: 'particles' | 'streamline' | 'twin_lyapunov' = 'particles';
  private particleCount = 3500;
  private particles: Particle[] = [];

  // Streamline trajectory state
  private streamlinePoints: Point3D[] = [];
  private maxStreamlinePoints = 4000;
  private streamlineHead: Point3D = { x: 0.1, y: 0, z: 0 };

  // Manifold Cache for true invariant attractor distribution
  private manifoldCache: Point3D[] = [];
  private twinSeparationDist = 0;
  private lyapunovDistHistory: number[] = [];

  // Color Palette
  private colorPalette: 'cyan' | 'solar' | 'neon' | 'emerald' | 'violet' = 'cyan';

  // Simulation State
  private isSimPlaying = true;
  private simSpeed = 1.0;
  private elapsedTime = 0;
  private containerEl: HTMLElement | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loadSystem(this.currentSystemKey);
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
  }

  loadSystem(key: string): void {
    if (!ATTRACTOR_SYSTEMS[key]) return;
    this.currentSystemKey = key;
    this.currentSystem = ATTRACTOR_SYSTEMS[key];
    this.currentParams = { ...this.currentSystem.defaultParams };
    this.resetSimulation();
  }

  resetSimulation(): void {
    this.elapsedTime = 0;
    this.particles = [];
    this.streamlinePoints = [];
    this.lyapunovDistHistory = [];
    this.twinSeparationDist = 0;

    this.buildManifoldCache();

    // Initialize streamline with pre-simulated points along the manifold
    if (this.manifoldCache.length >= 50) {
      this.streamlinePoints = [...this.manifoldCache.slice(0, 3000)];
      this.streamlineHead = { ...this.streamlinePoints[this.streamlinePoints.length - 1] };
    } else {
      const initPt = this.currentSystem.initialPoint;
      this.streamlineHead = { x: initPt[0], y: initPt[1], z: initPt[2] };
      let curr = { ...this.streamlineHead };
      const dt = this.currentSystem.dt;
      for (let i = 0; i < 2500; i++) {
        curr = this.rk4Step(curr.x, curr.y, curr.z, dt);
        this.streamlinePoints.push(curr);
      }
      this.streamlineHead = curr;
    }

    // Initialize particles
    if (this.vizMode === 'twin_lyapunov') {
      this.spawnTwinClouds();
    } else {
      this.spawnParticles();
    }
  }

  private buildManifoldCache(): void {
    this.manifoldCache = [];
    const init = this.currentSystem.initialPoint;
    const dt = this.currentSystem.dt;

    // Warm up along the trajectory to discard initial transients and settle onto the attractor
    let curr: Point3D = { x: init[0], y: init[1], z: init[2] };
    const warmupSteps = 1200;
    for (let i = 0; i < warmupSteps; i++) {
      curr = this.rk4Step(curr.x, curr.y, curr.z, dt);
      if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(curr.z)) {
        curr = { x: init[0], y: init[1], z: init[2] };
        break;
      }
    }

    // Integrate points along the true invariant manifold
    const sampleCount = 4500;
    for (let i = 0; i < sampleCount; i++) {
      curr = this.rk4Step(curr.x, curr.y, curr.z, dt);
      if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(curr.z)) {
        break;
      }
      this.manifoldCache.push(curr);
    }

    // Fallback if integration produced insufficient points
    if (this.manifoldCache.length < 50) {
      this.manifoldCache = [{ x: init[0], y: init[1], z: init[2] }];
    }
  }

  private spawnParticles(): void {
    this.particles = [];
    if (this.manifoldCache.length === 0) {
      this.buildManifoldCache();
    }

    const count = this.particleCount;
    const cacheLen = this.manifoldCache.length;

    for (let i = 0; i < count; i++) {
      // Uniformly sample from the invariant manifold cache
      const base = this.manifoldCache[Math.floor(Math.random() * cacheLen)];
      this.particles.push({
        x: base.x + (Math.random() - 0.5) * 0.05,
        y: base.y + (Math.random() - 0.5) * 0.05,
        z: base.z + (Math.random() - 0.5) * 0.05,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 1,
        life: Math.random() * 500,
        maxLife: 400 + Math.random() * 300,
        group: 0,
      });
    }
  }

  private spawnTwinClouds(): void {
    this.particles = [];
    this.lyapunovDistHistory = [];
    this.twinSeparationDist = 0;

    if (this.manifoldCache.length === 0) {
      this.buildManifoldCache();
    }

    const count = Math.min(this.particleCount, 2600);
    const half = Math.floor(count / 2);
    // Anchor the twin release at a verified attractor point
    const seed = this.manifoldCache[0] ?? {
      x: this.currentSystem.initialPoint[0],
      y: this.currentSystem.initialPoint[1],
      z: this.currentSystem.initialPoint[2],
    };

    // Cloud A (Cyan) - tight spherical cluster of radius 0.22
    for (let i = 0; i < half; i++) {
      const u = Math.random();
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.22 * Math.cbrt(u);

      const x = seed.x + r * Math.sin(phi) * Math.cos(theta);
      const y = seed.y + r * Math.sin(phi) * Math.sin(theta);
      const z = seed.z + r * Math.cos(phi);

      this.particles.push({
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 1,
        life: 0,
        maxLife: 999999,
        group: 0,
      });
    }

    // Cloud B (Magenta) - exact twin positions with microscopic perturbation ε = 0.0003
    const epsilon = 0.0003;
    for (let i = 0; i < half; i++) {
      const pA = this.particles[i];
      this.particles.push({
        x: pA.x + epsilon,
        y: pA.y + epsilon,
        z: pA.z + epsilon,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 1,
        life: 0,
        maxLife: 999999,
        group: 1,
      });
    }
  }

  private rk4Step(x: number, y: number, z: number, dt: number): Point3D {
    const f = this.currentSystem.evaluate;
    const p = this.currentParams;

    const [k1x, k1y, k1z] = f(x, y, z, p);
    const [k2x, k2y, k2z] = f(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y, z + 0.5 * dt * k1z, p);
    const [k3x, k3y, k3z] = f(x + 0.5 * dt * k2x, y + 0.5 * dt * k2y, z + 0.5 * dt * k2z, p);
    const [k4x, k4y, k4z] = f(x + dt * k3x, y + dt * k3y, z + dt * k3z, p);

    return {
      x: x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x),
      y: y + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y),
      z: z + (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z),
    };
  }

  update(dt: number, _time: number): void {
    if (!this.isSimPlaying) return;

    this.elapsedTime += dt;

    // Auto rotate camera
    if (this.autoRotate && !this.isDragging) {
      this.cameraAzimuth += this.autoRotateSpeed * dt;
    }

    const subSteps = 3;
    const stepDt = (this.currentSystem.dt * this.simSpeed) / subSteps;

    // Update Streamline
    if (this.vizMode === 'streamline') {
      for (let s = 0; s < subSteps * 2; s++) {
        this.streamlineHead = this.rk4Step(
          this.streamlineHead.x,
          this.streamlineHead.y,
          this.streamlineHead.z,
          stepDt
        );
        this.streamlinePoints.push({ ...this.streamlineHead });
        if (this.streamlinePoints.length > this.maxStreamlinePoints) {
          this.streamlinePoints.shift();
        }
      }
    }

    // Update Particles
    if (this.vizMode === 'particles' || this.vizMode === 'twin_lyapunov') {
      const cacheLen = this.manifoldCache.length;
      let countA = 0;
      let countB = 0;
      let sumAx = 0;
      let sumAy = 0;
      let sumAz = 0;
      let sumBx = 0;
      let sumBy = 0;
      let sumBz = 0;

      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];

        for (let s = 0; s < subSteps; s++) {
          const next = this.rk4Step(pt.x, pt.y, pt.z, stepDt);
          pt.vx = (next.x - pt.x) / stepDt;
          pt.vy = (next.y - pt.y) / stepDt;
          pt.vz = (next.z - pt.z) / stepDt;
          pt.speed = Math.hypot(pt.vx, pt.vy, pt.vz);
          pt.x = next.x;
          pt.y = next.y;
          pt.z = next.z;
        }

        pt.life++;

        // In Twin Cloud mode, track centroids of Cloud A and Cloud B
        if (this.vizMode === 'twin_lyapunov' && Number.isFinite(pt.x)) {
          if (pt.group === 0) {
            sumAx += pt.x;
            sumAy += pt.y;
            sumAz += pt.z;
            countA++;
          } else {
            sumBx += pt.x;
            sumBy += pt.y;
            sumBz += pt.z;
            countB++;
          }
        }

        // Respawn if escaped or life expired
        const isEscaped =
          !Number.isFinite(pt.x) ||
          Math.abs(pt.x) > 350 ||
          Math.abs(pt.y) > 350 ||
          Math.abs(pt.z) > 350;

        if (isEscaped || (this.vizMode === 'particles' && pt.life > pt.maxLife)) {
          if (cacheLen > 0) {
            const base = this.manifoldCache[Math.floor(Math.random() * cacheLen)];
            pt.x = base.x + (Math.random() - 0.5) * 0.05;
            pt.y = base.y + (Math.random() - 0.5) * 0.05;
            pt.z = base.z + (Math.random() - 0.5) * 0.05;
          } else {
            const init = this.currentSystem.initialPoint;
            pt.x = init[0] + (Math.random() - 0.5) * 3;
            pt.y = init[1] + (Math.random() - 0.5) * 3;
            pt.z = init[2] + (Math.random() - 0.5) * 3;
          }
          pt.life = 0;
        }
      }

      // Record Lyapunov divergence separation
      if (this.vizMode === 'twin_lyapunov' && countA > 0 && countB > 0) {
        const ax = sumAx / countA;
        const ay = sumAy / countA;
        const az = sumAz / countA;
        const bx = sumBx / countB;
        const by = sumBy / countB;
        const bz = sumBz / countB;
        const dist = Math.hypot(bx - ax, by - ay, bz - az);
        this.twinSeparationDist = dist;
        this.lyapunovDistHistory.push(dist);
        if (this.lyapunovDistHistory.length > 160) {
          this.lyapunovDistHistory.shift();
        }
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

    // Deep space backdrop
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, width, height);

    // Atmospheric center radial glow
    const cx = width / 2;
    const cy = height / 2;
    const bgGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.6);
    bgGlow.addColorStop(0, 'rgba(14, 165, 233, 0.06)');
    bgGlow.addColorStop(0.6, 'rgba(15, 23, 42, 0.02)');
    bgGlow.addColorStop(1, 'rgba(5, 7, 14, 0.85)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    // Precompute 3D Camera Rotation Matrix
    const cosAz = Math.cos(this.cameraAzimuth);
    const sinAz = Math.sin(this.cameraAzimuth);
    const cosEl = Math.cos(this.cameraElevation);
    const sinEl = Math.sin(this.cameraElevation);

    const scale = this.currentSystem.defaultScale * this.zoomLevel;
    const [ox, oy, oz] = this.currentSystem.centerOffset;

    const viewportDim = Math.min(width, height);
    // Responsive base multiplier so attractor occupies ~65-75% of viewport at zoomLevel = 1.0
    const baseProjectionMultiplier = (viewportDim / 600) * 0.55;

    // Helper for 3D -> 2D Perspective Projection
    const project = (x: number, y: number, z: number): { sx: number; sy: number; sz: number; visible: boolean } => {
      // 1. Center relative to attractor centroid
      const rx = x + ox;
      const ry = y + oy;
      const rz = z + oz;

      // 2. Rotate Azimuth (around Z axis)
      const x1 = rx * cosAz - ry * sinAz;
      const y1 = rx * sinAz + ry * cosAz;
      const z1 = rz;

      // 3. Rotate Elevation (around X axis)
      const x2 = x1;
      const y2 = y1 * cosEl - z1 * sinEl;
      const z2 = y1 * sinEl + z1 * cosEl;

      // 4. Perspective Projection
      const cameraZ = z2 + this.cameraDistance;
      if (cameraZ <= 10) return { sx: 0, sy: 0, sz: cameraZ, visible: false };

      const factor = (this.cameraFocalLength / cameraZ) * scale * baseProjectionMultiplier;
      const sx = cx + x2 * factor;
      const sy = cy - y2 * factor; // Canvas Y is inverted

      return { sx, sy, sz: cameraZ, visible: true };
    };

    // Render 3D Coordinate Grid / Reference Orbit Plane
    this.drawReferenceFloor(ctx, project);

    // Render Streamline Ribbon Mode
    if (this.vizMode === 'streamline' && this.streamlinePoints.length > 1) {
      this.drawStreamline(ctx, project);
    }

    // Render Particle Swarm
    if (this.vizMode === 'particles' || this.vizMode === 'twin_lyapunov') {
      this.drawParticles(ctx, project);
    }

    // Draw Attractor Mini Orientation Gizmo
    this.drawOrientationGizmo(ctx, width, height, cosAz, sinAz, cosEl, sinEl);

    // Draw 3D Lyapunov Separation HUD in Twin Cloud Mode
    if (this.vizMode === 'twin_lyapunov') {
      this.drawLyapunovHUD(ctx, width, height);
    }

    ctx.restore();
  }

  private drawReferenceFloor(
    ctx: CanvasRenderingContext2D,
    project: (x: number, y: number, z: number) => { sx: number; sy: number; sz: number; visible: boolean }
  ): void {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.18)';

    let gridSize = 25;
    let step = 5;
    let floorZ = -15;

    if (this.currentSystemKey === 'aizawa') {
      gridSize = 2.2;
      step = 0.55;
      floorZ = -1.2;
    } else if (this.currentSystemKey === 'thomas') {
      gridSize = 5;
      step = 1.0;
      floorZ = -4.5;
    } else if (this.currentSystemKey === 'halvorsen') {
      gridSize = 12;
      step = 3;
      floorZ = -9;
    } else if (this.currentSystemKey === 'lorenz') {
      gridSize = 32;
      step = 8;
      floorZ = 0;
    } else if (this.currentSystemKey === 'rossler') {
      gridSize = 20;
      step = 5;
      floorZ = -2;
    } else if (this.currentSystemKey === 'dadras') {
      gridSize = 22;
      step = 5.5;
      floorZ = -12;
    }

    ctx.beginPath();
    for (let x = -gridSize; x <= gridSize; x += step) {
      const p1 = project(x, -gridSize, floorZ);
      const p2 = project(x, gridSize, floorZ);
      if (p1.visible && p2.visible) {
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
      }
    }
    for (let y = -gridSize; y <= gridSize; y += step) {
      const p1 = project(-gridSize, y, floorZ);
      const p2 = project(gridSize, y, floorZ);
      if (p1.visible && p2.visible) {
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawStreamline(
    ctx: CanvasRenderingContext2D,
    project: (x: number, y: number, z: number) => { sx: number; sy: number; sz: number; visible: boolean }
  ): void {
    const pts = this.streamlinePoints;
    const total = pts.length;
    if (total < 2) return;

    ctx.save();
    ctx.lineWidth = Math.max(1.2, Math.min(4.5, 1.8 * Math.pow(this.zoomLevel, 0.25)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Segment drawing with progressive gradient
    const stepSize = 4;
    for (let i = 0; i < total - stepSize; i += stepSize) {
      const p1 = project(pts[i].x, pts[i].y, pts[i].z);
      const p2 = project(pts[i + stepSize].x, pts[i + stepSize].y, pts[i + stepSize].z);

      if (!p1.visible || !p2.visible) continue;

      const progress = i / total;
      const alpha = Math.min(1.0, 0.15 + progress * 0.85);

      ctx.strokeStyle = this.getColorForProgress(progress, alpha);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }

    // Draw glowing leading head
    const head = project(this.streamlineHead.x, this.streamlineHead.y, this.streamlineHead.z);
    if (head.visible) {
      ctx.beginPath();
      ctx.arc(head.sx, head.sy, 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.fill();
    }

    ctx.restore();
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    project: (x: number, y: number, z: number) => { sx: number; sy: number; sz: number; visible: boolean }
  ): void {
    ctx.save();

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      const proj = project(pt.x, pt.y, pt.z);
      if (!proj.visible) continue;

      // Depth and zoom-aware particle sizing
      const depthFactor = Math.max(0.25, Math.min(1.4, 200 / proj.sz));
      const size = Math.max(1.2, Math.min(5.5, 2.0 * depthFactor * Math.pow(this.zoomLevel, 0.2)));

      if (this.vizMode === 'twin_lyapunov') {
        if (pt.group === 0) {
          // Cloud A: Electric Cyan
          ctx.fillStyle = `rgba(56, 189, 248, ${0.8 * depthFactor})`;
        } else {
          // Cloud B: Hot Neon Rose / Magenta
          ctx.fillStyle = `rgba(244, 63, 94, ${0.8 * depthFactor})`;
        }
      } else {
        // Color mapped by velocity / speed
        const speedNorm = Math.min(1.0, pt.speed / 45);
        ctx.fillStyle = this.getColorForProgress(speedNorm, 0.75 * depthFactor);
      }

      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, size, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawLyapunovHUD(ctx: CanvasRenderingContext2D, _width: number, height: number): void {
    const cardW = 230;
    const cardH = 104;
    const x = 20;
    const y = height - cardH - 24;

    ctx.save();

    // Background card with blur-like backdrop
    ctx.fillStyle = 'rgba(8, 14, 26, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeRect(x, y, cardW, cardH);
    }

    // Title
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ 3D Lyapunov Separation', x + 10, y + 17);

    // Legend
    ctx.font = '10px monospace';
    // Cyan dot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x + 160, y + 13, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('A', x + 167, y + 16);

    // Magenta dot
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(x + 184, y + 13, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('B (+ε)', x + 191, y + 16);

    // Separation Readout
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`Δr: ${this.twinSeparationDist.toFixed(3)}`, x + 10, y + 35);

    const statusText =
      this.twinSeparationDist < 0.6
        ? 'Coherent Cluster'
        : this.twinSeparationDist < 4.5
        ? 'Filament Stretching...'
        : 'Chaotic Divergence!';
    const statusColor =
      this.twinSeparationDist < 0.6
        ? '#38bdf8'
        : this.twinSeparationDist < 4.5
        ? '#f59e0b'
        : '#f43f5e';

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, x + 96, y + 35);

    // Mini Sparkline Graph Area
    const chartX = x + 10;
    const chartY = y + 42;
    const chartW = cardW - 20;
    const chartH = 44;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(chartX, chartY, chartW, chartH);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.strokeRect(chartX, chartY, chartW, chartH);

    // Plot separation history
    const history = this.lyapunovDistHistory;
    if (history.length > 1) {
      const maxVal = Math.max(8, ...history);
      ctx.beginPath();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;

      for (let i = 0; i < history.length; i++) {
        const px = chartX + (i / (history.length - 1)) * chartW;
        const norm = Math.min(1.0, history[i] / maxVal);
        const py = chartY + chartH - norm * (chartH - 4) - 2;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();

      // Translucent area beneath curve
      ctx.lineTo(chartX + chartW, chartY + chartH);
      ctx.lineTo(chartX, chartY + chartH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
      ctx.fill();
    }

    // Footnote
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('||δ(t)|| ~ ||δ(0)||·e^(λt)', x + 10, y + 97);

    ctx.restore();
  }

  private drawOrientationGizmo(
    ctx: CanvasRenderingContext2D,
    width: number,
    _height: number,
    cosAz: number,
    sinAz: number,
    cosEl: number,
    sinEl: number
  ): void {
    const gx = width - 48;
    const gy = 48;
    const len = 24;

    const projectVector = (vx: number, vy: number, vz: number) => {
      const x1 = vx * cosAz - vy * sinAz;
      const y1 = vx * sinAz + vy * cosAz;
      const z1 = vz;

      const x2 = x1;
      const y2 = y1 * cosEl - z1 * sinEl;
      return { x: gx + x2 * len, y: gy - y2 * len };
    };

    const origin = { x: gx, y: gy };
    const xEnd = projectVector(1, 0, 0);
    const yEnd = projectVector(0, 1, 0);
    const zEnd = projectVector(0, 0, 1);

    ctx.save();
    ctx.lineWidth = 2;

    // X Axis - Red
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();

    // Y Axis - Green
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();

    // Z Axis - Blue
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText('X', xEnd.x + 2, xEnd.y + 3);
    ctx.fillText('Y', yEnd.x + 2, yEnd.y + 3);
    ctx.fillText('Z', zEnd.x + 2, zEnd.y + 3);

    ctx.restore();
  }

  private getColorForProgress(t: number, alpha: number): string {
    switch (this.colorPalette) {
      case 'solar':
        // Gold to fiery orange / red
        return `rgba(${Math.floor(255 * (0.8 + 0.2 * t))}, ${Math.floor(100 + 140 * (1 - t))}, 30, ${alpha})`;
      case 'neon':
        // Deep purple to bright hot pink / cyan
        return `rgba(${Math.floor(80 + 175 * t)}, ${Math.floor(40 + 200 * (1 - t))}, 245, ${alpha})`;
      case 'emerald':
        // Emerald to bright neon lime
        return `rgba(${Math.floor(16 + 100 * t)}, ${Math.floor(185 + 70 * t)}, ${Math.floor(129 * (1 - t))}, ${alpha})`;
      case 'violet':
        // Deep indigo to electric violet
        return `rgba(${Math.floor(168 * t + 80)}, 85, ${Math.floor(247)}, ${alpha})`;
      case 'cyan':
      default:
        // Electric Cyan to Sky Blue
        return `rgba(${Math.floor(14 + 120 * t)}, ${Math.floor(165 + 70 * t)}, ${Math.floor(233 + 22 * t)}, ${alpha})`;
    }
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
    this.zoomLevel = 1.0;
    this.cameraAzimuth = 0.8;
    this.cameraElevation = 0.35;
    this.resetSimulation();
    this.updateControlsUI();
  }

  zoom(factor: number): void {
    this.zoomLevel = Math.max(0.15, Math.min(50.0, this.zoomLevel * factor));
  }

  destroy(): void {
    this.particles = [];
    this.streamlinePoints = [];
  }

  onPointerDown(e: PointerEvent): void {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.cameraAzimuth += dx * 0.008;
    this.cameraElevation = Math.max(-1.45, Math.min(1.45, this.cameraElevation + dy * 0.008));
  }

  onPointerUp(_e: PointerEvent): void {
    this.isDragging = false;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoom(factor);
  }

  getHudInfo(): { badge: string; coords: string } {
    const status = this.isSimPlaying ? 'RUNNING' : 'STOPPED';
    const azDeg = Math.round(((this.cameraAzimuth % (2 * Math.PI)) * 180) / Math.PI);
    const elDeg = Math.round((this.cameraElevation * 180) / Math.PI);

    if (this.vizMode === 'twin_lyapunov') {
      return {
        badge: `[${status}] ${this.currentSystem.name} • Twin Lyapunov Mode`,
        coords: `Separation: Δr = ${this.twinSeparationDist.toFixed(3)} • 3D Cam: Azimuth ${azDeg}°, Elevation ${elDeg}°`,
      };
    }

    return {
      badge: `[${status}] ${this.currentSystem.name} • Scale: ${(this.zoomLevel * 100).toFixed(0)}%`,
      coords: `3D Cam: Azimuth ${azDeg}°, Elevation ${elDeg}° • Mode: ${this.vizMode.toUpperCase()}`,
    };
  }

  getControlsHTML(): string {
    const sys = this.currentSystem;

    return `
      <!-- Master Control -->
      <div class="control-group !border-cyan-500/40 bg-gradient-to-b from-[#131926] to-[#0a0e16]">
        <div class="control-header">
          <span class="control-title text-cyan-300">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            3D Attractor Engine
          </span>
          <span id="attr-status-badge" class="px-2 py-0.5 rounded text-[10px] font-mono ${this.isSimPlaying ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'}">
            ${this.isSimPlaying ? '● RUNNING' : '❚❚ STOPPED'}
          </span>
        </div>
        <div class="flex space-x-2">
          <button id="btn-attr-playpause" class="btn-primary flex-1 ${this.isSimPlaying ? '!bg-rose-600 hover:!bg-rose-500' : '!bg-emerald-600 hover:!bg-emerald-500'}">
            <span id="attr-btn-play-text">${this.isSimPlaying ? '❚❚ Stop' : '▶ Run'}</span>
          </button>
          <button id="btn-attr-reset" class="btn-secondary flex-1 border-cyan-600/50 hover:border-cyan-500 text-cyan-200">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span id="attr-btn-reset-text">${this.vizMode === 'twin_lyapunov' ? 'Reset Twin Clouds' : 'Reset Swarm'}</span>
          </button>
        </div>
      </div>

      <!-- Attractor Selection -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            Chaotic System Preset
          </span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Non-Linear 3D System</label>
            <select id="attr-system-select">
              ${Object.values(ATTRACTOR_SYSTEMS)
                .map(
                  (s) => `<option value="${s.id}" ${s.id === this.currentSystemKey ? 'selected' : ''}>${s.name}</option>`
                )
                .join('')}
            </select>
          </div>
          <p class="text-[11px] text-slate-400 leading-normal bg-black/30 p-2.5 rounded-lg border border-slate-800">
            ${sys.description}
          </p>
        </div>
      </div>

      <!-- Rendering Modes & Appearance -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
            Visualization Mode & Palette
          </span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Render Geometry</label>
            <div class="segmented-control">
              <button id="mode-particles" class="segmented-btn ${this.vizMode === 'particles' ? 'active active-cyan' : ''}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                <span>Swarm</span>
              </button>
              <button id="mode-streamline" class="segmented-btn ${this.vizMode === 'streamline' ? 'active active-cyan' : ''}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                <span>Streamline</span>
              </button>
              <button id="mode-twin" class="segmented-btn ${this.vizMode === 'twin_lyapunov' ? 'active active-cyan' : ''}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                <span>Twin Cloud</span>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Spectral Color Scheme</label>
            <select id="attr-palette-select">
              <option value="cyan" ${this.colorPalette === 'cyan' ? 'selected' : ''}>Electric Cyan / Sky</option>
              <option value="solar" ${this.colorPalette === 'solar' ? 'selected' : ''}>Sunset Solar Flare</option>
              <option value="neon" ${this.colorPalette === 'neon' ? 'selected' : ''}>Cyberpunk Neon / Hot Pink</option>
              <option value="emerald" ${this.colorPalette === 'emerald' ? 'selected' : ''}>Emerald Abyss</option>
              <option value="violet" ${this.colorPalette === 'violet' ? 'selected' : ''}>Cosmic Violet</option>
            </select>
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Particle Density</span>
              <span id="val-particle-count" class="slider-val">${this.particleCount}</span>
            </div>
            <input type="range" id="slider-particle-count" min="800" max="6000" step="200" value="${this.particleCount}">
          </div>
        </div>
      </div>

      <!-- 3D Camera Controls -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            Camera & Dynamics
          </span>
        </div>
        <div class="space-y-3">
          <label class="toggle-switch">
            <span>Auto-Rotate Orbital View</span>
            <input type="checkbox" id="toggle-autorotate" class="switch-input" ${this.autoRotate ? 'checked' : ''}>
          </label>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Rotation Speed</span>
              <span id="val-autorotate-speed" class="slider-val">${this.autoRotateSpeed.toFixed(1)} rad/s</span>
            </div>
            <input type="range" id="slider-autorotate-speed" min="0.0" max="1.5" step="0.1" value="${this.autoRotateSpeed}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Simulation Speed</span>
              <span id="val-attr-speed" class="slider-val">${this.simSpeed.toFixed(1)}x</span>
            </div>
            <input type="range" id="slider-attr-speed" min="0.2" max="3.0" step="0.1" value="${this.simSpeed}">
          </div>
        </div>
      </div>

      <!-- Dynamic Parameter Tuning for current system -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
            System Parameters
          </span>
        </div>
        <div class="space-y-3">
          ${Object.entries(sys.paramRanges)
            .map(([paramKey, range]) => {
              const val = this.currentParams[paramKey] ?? sys.defaultParams[paramKey];
              return `
                <div class="slider-container">
                  <div class="slider-label-row">
                    <span>${range.label}</span>
                    <span id="val-param-${paramKey}" class="slider-val">${val.toFixed(2)}</span>
                  </div>
                  <input type="range" class="system-param-slider" data-param="${paramKey}" min="${range.min}" max="${range.max}" step="${range.step}" value="${val}">
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  bindControls(container: HTMLElement): void {
    this.containerEl = container;

    // Play/Pause & Reset
    const playBtn = container.querySelector('#btn-attr-playpause');
    playBtn?.addEventListener('click', () => this.togglePlay());

    const resetBtn = container.querySelector('#btn-attr-reset');
    resetBtn?.addEventListener('click', () => this.resetSimulation());

    // System Selection
    const sysSelect = container.querySelector('#attr-system-select') as HTMLSelectElement | null;
    sysSelect?.addEventListener('change', () => {
      this.loadSystem(sysSelect.value);
      // Refresh sidebar controls to show new dynamic parameters
      container.innerHTML = this.getControlsHTML();
      this.bindControls(container);
    });

    // Viz Mode Buttons
    const btnParticles = container.querySelector('#mode-particles');
    btnParticles?.addEventListener('click', () => {
      this.vizMode = 'particles';
      this.spawnParticles();
      this.refreshModeButtons();
    });

    const btnStreamline = container.querySelector('#mode-streamline');
    btnStreamline?.addEventListener('click', () => {
      this.vizMode = 'streamline';
      this.resetSimulation();
      this.refreshModeButtons();
    });

    const btnTwin = container.querySelector('#mode-twin');
    btnTwin?.addEventListener('click', () => {
      this.vizMode = 'twin_lyapunov';
      this.spawnTwinClouds();
      this.refreshModeButtons();
    });

    // Color Palette Select
    const palSelect = container.querySelector('#attr-palette-select') as HTMLSelectElement | null;
    palSelect?.addEventListener('change', () => {
      this.colorPalette = palSelect.value as any;
    });

    // Particle Count Slider
    const countSlider = container.querySelector('#slider-particle-count') as HTMLInputElement | null;
    const countVal = container.querySelector('#val-particle-count');
    countSlider?.addEventListener('input', () => {
      this.particleCount = parseInt(countSlider.value, 10);
      if (countVal) countVal.textContent = String(this.particleCount);
      if (this.vizMode === 'twin_lyapunov') {
        this.spawnTwinClouds();
      } else {
        this.spawnParticles();
      }
    });

    // Camera Auto-Rotate
    const autoRotToggle = container.querySelector('#toggle-autorotate') as HTMLInputElement | null;
    autoRotToggle?.addEventListener('change', () => {
      this.autoRotate = autoRotToggle.checked;
    });

    const autoRotSpeedSlider = container.querySelector('#slider-autorotate-speed') as HTMLInputElement | null;
    const autoRotSpeedVal = container.querySelector('#val-autorotate-speed');
    autoRotSpeedSlider?.addEventListener('input', () => {
      this.autoRotateSpeed = parseFloat(autoRotSpeedSlider.value);
      if (autoRotSpeedVal) autoRotSpeedVal.textContent = `${this.autoRotateSpeed.toFixed(1)} rad/s`;
    });

    // Sim Speed
    const simSpeedSlider = container.querySelector('#slider-attr-speed') as HTMLInputElement | null;
    const simSpeedVal = container.querySelector('#val-attr-speed');
    simSpeedSlider?.addEventListener('input', () => {
      this.simSpeed = parseFloat(simSpeedSlider.value);
      if (simSpeedVal) simSpeedVal.textContent = `${this.simSpeed.toFixed(1)}x`;
    });

    // System Parameter Sliders
    const paramSliders = container.querySelectorAll('.system-param-slider');
    paramSliders.forEach((sliderEl) => {
      const slider = sliderEl as HTMLInputElement;
      const paramKey = slider.dataset.param;
      if (!paramKey) return;
      const valEl = container.querySelector(`#val-param-${paramKey}`);

      slider.addEventListener('input', () => {
        const num = parseFloat(slider.value);
        this.currentParams[paramKey] = num;
        if (valEl) valEl.textContent = num.toFixed(2);
        this.buildManifoldCache();
      });
    });

    this.updateControlsUI();
  }

  private refreshModeButtons(): void {
    if (!this.containerEl) return;
    const btnParticles = this.containerEl.querySelector('#mode-particles');
    const btnStreamline = this.containerEl.querySelector('#mode-streamline');
    const btnTwin = this.containerEl.querySelector('#mode-twin');
    const resetText = this.containerEl.querySelector('#attr-btn-reset-text');

    const updateBtn = (btn: Element | null, active: boolean) => {
      if (!btn) return;
      if (active) {
        btn.className = 'segmented-btn active active-cyan';
      } else {
        btn.className = 'segmented-btn';
      }
    };

    updateBtn(btnParticles, this.vizMode === 'particles');
    updateBtn(btnStreamline, this.vizMode === 'streamline');
    updateBtn(btnTwin, this.vizMode === 'twin_lyapunov');

    if (resetText) {
      resetText.textContent = this.vizMode === 'twin_lyapunov' ? 'Reset Twin Clouds' : 'Reset Swarm';
    }
  }

  private updateControlsUI(): void {
    if (!this.containerEl) return;
    const badge = this.containerEl.querySelector('#attr-status-badge');
    const playBtn = this.containerEl.querySelector('#btn-attr-playpause');
    const playText = this.containerEl.querySelector('#attr-btn-play-text');

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
    const sys = this.currentSystem;

    return `
      <!-- Theory 1: System ODEs -->
      <div class="theory-card">
        <div class="theory-header">
          <span>${sys.name} System</span>
          <span class="text-xs text-cyan-400 font-mono">01</span>
        </div>
        <div class="theory-content">
          <p>
            Governed by the autonomous system of 3 coupled ordinary differential equations:
          </p>
          <div class="math-block">
            $${sys.latexFormula}$
          </div>
          <p class="text-xs text-slate-300">
            ${sys.description}
          </p>
        </div>
      </div>

      <!-- Theory 2: Strange Attractors & Fractal Dimension -->
      <div class="theory-card">
        <div class="theory-header">
          <span>What is a "Strange" Attractor?</span>
          <span class="text-xs text-purple-400 font-mono">02</span>
        </div>
        <div class="theory-content">
          <p>
            In dynamical systems, an <strong>attractor</strong> is a set of numerical values toward which a system tends to evolve for a wide variety of starting conditions.
          </p>
          <p>
            An attractor is called <strong>strange</strong> when:
          </p>
          <ul class="list-disc pl-4 space-y-1 text-xs text-slate-300 mb-2">
            <li>It exhibits <strong>sensitive dependence on initial conditions</strong> (positive Lyapunov exponent).</li>
            <li>Its geometric structure has a <strong>non-integer fractal Hausdorff dimension</strong> (e.g. for Lorenz, $D_H \\approx 2.06$).</li>
            <li>Trajectories never intersect themselves, yet remain bounded forever within a finite 3D volume.</li>
          </ul>
        </div>
      </div>

      <!-- Theory 3: Stretching & Folding Mechanism -->
      <div class="theory-card">
        <div class="theory-header">
          <span>The Stretching & Folding Geometry</span>
          <span class="text-xs text-amber-400 font-mono">03</span>
        </div>
        <div class="theory-content">
          <p>
            How can an infinite line fit inside a bounded volume without ever crossing itself?
          </p>
          <p>
            The flow field repeatedly performs two fundamental operations:
          </p>
          <p>
            <strong>1. Stretching:</strong> Nearby points are pulled apart exponentially in unstable directions ($\\|\\delta(t)\\| \\sim e^{\\lambda_1 t}$).<br>
            <strong>2. Folding:</strong> As trajectories reach outer bounds, non-linear terms fold them back into the attractor, similar to kneading baker's dough.
          </p>
          <p class="text-xs text-slate-400">
            Select the <strong>Twin Cloud</strong> render mode to see this stretching and folding in action!
          </p>
        </div>
      </div>

      <!-- Theory 4: Numerical Integration -->
      <div class="theory-card">
        <div class="theory-header">
          <span>RK4 Numerical Integration</span>
          <span class="text-xs text-emerald-400 font-mono">04</span>
        </div>
        <div class="theory-content">
          <p>
            Every particle coordinate is stepped forward in time using <strong>4th-Order Runge-Kutta (RK4)</strong>:
          </p>
          <div class="math-block">
            $$\\vec{r}_{n+1} = \\vec{r}_n + \\frac{\\Delta t}{6} (\\vec{k}_1 + 2\\vec{k}_2 + 2\\vec{k}_3 + \\vec{k}_4)$$
          </div>
          <p class="text-xs text-slate-300">
            Providing $O(\\Delta t^4)$ local truncation error for smooth, ultra-stable vector field tracing.
          </p>
        </div>
      </div>
    `;
  }
}
