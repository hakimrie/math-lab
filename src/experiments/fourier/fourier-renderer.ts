import { Experiment } from '../experiment';
import { Point2D, FourierComponent, resamplePath, computeDFT, evaluateEpicycles, computeRMSE } from '../../math/dft';
import { FOURIER_PRESETS } from './presets';
import { mathAudio } from '../../utils/audio-synthesizer';

export class FourierRenderer implements Experiment {
  id = 'fourier';
  name = 'Fourier Epicycles';
  badge = 'Harmonic Analysis';
  category = 'Harmonic Analysis';
  accentColor = '#c084fc';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Drawing state
  private isDrawing = false;
  private userRawPoints: Point2D[] = [];
  private resampledPoints: Point2D[] = [];
  private fourierComponents: FourierComponent[] = [];
  private currentPresetIdx = 1;

  serializeState(): Record<string, string | number | boolean> {
    return {
      preset: this.currentPresetIdx,
      order: this.componentCount,
      speed: Number(this.animSpeed.toFixed(2)),
      zoom: Number(this.zoomLevel.toFixed(3)),
      circles: this.showCircles,
      vectors: this.showVectors,
    };
  }

  deserializeState(state: Record<string, string>): void {
    if (state.preset !== undefined) {
      const idx = parseInt(state.preset, 10);
      this.currentPresetIdx = idx;
      this.loadPreset(idx);
    }
    if (state.order !== undefined) {
      this.componentCount = parseInt(state.order, 10);
    }
    if (state.speed !== undefined) {
      this.animSpeed = parseFloat(state.speed);
    }
    if (state.zoom !== undefined) {
      this.zoomLevel = parseFloat(state.zoom);
    }
    if (state.circles !== undefined) {
      this.showCircles = state.circles === 'true';
    }
    if (state.vectors !== undefined) {
      this.showVectors = state.vectors === 'true';
    }
    this.updateControlsUI();
  }

  // Epicycle animation state
  private t = 0;
  private animSpeed = 1.0;
  private direction = 1; // 1: forward, -1: reverse
  private isPlayingState = true;
  private componentCount = 50;
  private sampleTargetCount = 180;

  // Visual toggles
  private showCircles = true;
  private showVectors = true;
  private showOriginal = true;
  private showReconstructed = true;
  private trail: Point2D[] = [];

  // Zoom and Pan
  private zoomLevel = 1.0;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  private containerEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hintEl = document.getElementById('drawing-hint');

    // Load initial default preset (Cardioid Heart)
    this.loadPreset(1);
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
  }

  update(dt: number, _time: number): void {
    if (this.isDrawing) {
      mathAudio.silence();
      return;
    }

    if (this.isPlayingState && this.fourierComponents.length > 0) {
      // Advance t by dt * speed
      const deltaT = (this.direction * this.animSpeed * dt * 2 * Math.PI) / 6.0;
      this.t = (this.t + deltaT) % (2 * Math.PI);
      if (this.t < 0) this.t += 2 * Math.PI;

      // Evaluate current tip
      const { tip } = evaluateEpicycles(this.fourierComponents, this.t, this.componentCount);
      this.trail.push(tip);

      // Web Audio additive synthesis of active harmonics
      mathAudio.updateFourierHarmonics(
        this.fourierComponents.slice(0, 6).map((c) => ({ freq: c.freq, amp: c.amp })),
        220
      );

      // Keep trail length within one complete cycle
      const maxTrailPoints = Math.floor((6.0 / (this.animSpeed * dt || 0.016)) * 1.1) + 20;
      if (this.trail.length > Math.max(300, maxTrailPoints)) {
        this.trail.shift();
      }
    } else {
      mathAudio.silence();
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

    // Dark grid background
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    this.drawCoordinateGrid(ctx, width, height);

    // Apply pan and zoom centered
    ctx.save();
    ctx.translate(width / 2 + this.panX, height / 2 + this.panY);
    ctx.scale(this.zoomLevel, this.zoomLevel);

    if (this.isDrawing) {
      // User is currently sketching
      this.drawUserLiveStroke(ctx);
    } else {
      // Render Fourier analysis

      // 1. Original target drawing
      if (this.showOriginal && this.resampledPoints.length > 1) {
        this.drawOriginalPath(ctx);
      }

      // 2. Full reconstructed closed path or trail
      if (this.showReconstructed && this.fourierComponents.length > 0) {
        this.drawReconstructedPath(ctx);
      }

      // 3. Epicycles (Circles & Vectors)
      if (this.fourierComponents.length > 0) {
        this.drawEpicycles(ctx);
      }
    }

    ctx.restore();
    ctx.restore();
  }

  private drawCoordinateGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.lineWidth = 1;

    const gridSize = 40;
    const startX = ((width / 2 + this.panX) % gridSize);
    const startY = ((height / 2 + this.panY) % gridSize);

    ctx.beginPath();
    for (let x = startX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Central axes
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 + this.panX, 0);
    ctx.lineTo(width / 2 + this.panX, height);
    ctx.moveTo(0, height / 2 + this.panY);
    ctx.lineTo(width, height / 2 + this.panY);
    ctx.stroke();

    ctx.restore();
  }

  private drawUserLiveStroke(ctx: CanvasRenderingContext2D): void {
    if (this.userRawPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3 / this.zoomLevel;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#0ea5e9';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(this.userRawPoints[0].x, this.userRawPoints[0].y);
    for (let i = 1; i < this.userRawPoints.length; i++) {
      ctx.lineTo(this.userRawPoints[i].x, this.userRawPoints[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawOriginalPath(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1.5 / this.zoomLevel;
    ctx.setLineDash([4 / this.zoomLevel, 4 / this.zoomLevel]);

    ctx.beginPath();
    ctx.moveTo(this.resampledPoints[0].x, this.resampledPoints[0].y);
    for (let i = 1; i < this.resampledPoints.length; i++) {
      ctx.lineTo(this.resampledPoints[i].x, this.resampledPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawReconstructedPath(ctx: CanvasRenderingContext2D): void {
    const N = 200;
    ctx.save();
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5 / this.zoomLevel;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const angle = (i / N) * 2 * Math.PI;
      const { tip } = evaluateEpicycles(this.fourierComponents, angle, this.componentCount);
      if (i === 0) ctx.moveTo(tip.x, tip.y);
      else ctx.lineTo(tip.x, tip.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawEpicycles(ctx: CanvasRenderingContext2D): void {
    const { circles, tip } = evaluateEpicycles(this.fourierComponents, this.t, this.componentCount);
    ctx.save();

    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];

      // Draw circle
      if (this.showCircles) {
        ctx.beginPath();
        ctx.arc(c.cx, c.cy, c.radius, 0, 2 * Math.PI);
        // Dim smaller epicycles so visual focus stays on dominant harmonics
        const alpha = Math.max(0.08, Math.min(0.4, (c.radius / 80) * 0.4));
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 1 / this.zoomLevel;
        ctx.stroke();
      }

      // Draw vector radius
      if (this.showVectors) {
        ctx.beginPath();
        ctx.moveTo(c.cx, c.cy);
        ctx.lineTo(c.tipX, c.tipY);
        ctx.strokeStyle = i === 0 ? 'rgba(244, 63, 94, 0.7)' : 'rgba(168, 85, 247, 0.6)';
        ctx.lineWidth = (i === 0 ? 2 : 1.2) / this.zoomLevel;
        ctx.stroke();
      }
    }

    // Final tip drawing pen
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 4 / this.zoomLevel, 0, 2 * Math.PI);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.fill();

    ctx.restore();
  }

  destroy(): void {
    mathAudio.silence();
    this.isDrawing = false;
    this.isPanning = false;
    this.userRawPoints = [];
    this.resampledPoints = [];
    this.fourierComponents = [];
    this.trail = [];
  }

  play(): void {
    this.isPlayingState = true;
  }

  pause(): void {
    this.isPlayingState = false;
    mathAudio.silence();
  }

  isPlaying(): boolean {
    return this.isPlayingState;
  }

  togglePlay(): boolean {
    this.isPlayingState = !this.isPlayingState;
    if (!this.isPlayingState) mathAudio.silence();
    return this.isPlayingState;
  }

  reset(): void {
    mathAudio.silence();
    this.t = 0;
    this.trail = [];
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1.0;
  }

  zoom(factor: number): void {
    this.zoomLevel *= factor;
  }

  loadPreset(index: number): void {
    const preset = FOURIER_PRESETS[index];
    if (!preset) return;
    this.currentPresetIdx = index;
    this.isDrawing = false;
    if (this.hintEl) {
      this.hintEl.classList.add('hidden');
    }
    this.userRawPoints = preset.generate();
    this.processPath();
  }

  private processPath(): void {
    if (this.userRawPoints.length < 2) return;

    // Resample path uniformly
    this.resampledPoints = resamplePath(this.userRawPoints, this.sampleTargetCount);

    // Compute DFT
    this.fourierComponents = computeDFT(this.resampledPoints);

    // Default component count: all or max 60
    this.componentCount = Math.min(this.fourierComponents.length, 60);

    this.t = 0;
    this.trail = [];
    this.syncUI();
  }

  onPointerDown(e: PointerEvent): void {
    if (e.button === 1 || e.shiftKey) {
      // Middle click or shift: Pan
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    // Start drawing
    this.isDrawing = true;
    this.userRawPoints = [];
    this.trail = [];

    const pt = this.screenToWorld(e.clientX, e.clientY);
    this.userRawPoints.push(pt);

    if (this.hintEl) {
      this.hintEl.classList.remove('hidden');
    }
  }

  onPointerMove(e: PointerEvent): void {
    if (this.isPanning) {
      this.panX += e.clientX - this.lastPanX;
      this.panY += e.clientY - this.lastPanY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    if (!this.isDrawing) return;
    const pt = this.screenToWorld(e.clientX, e.clientY);
    // Limit maximum sampled points to prevent memory hanging
    if (this.userRawPoints.length < 1200) {
      this.userRawPoints.push(pt);
    }
  }

  onPointerUp(_e: PointerEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.hintEl) {
      this.hintEl.classList.add('hidden');
    }

    // If user drew something valid (at least 5 points)
    if (this.userRawPoints.length >= 5) {
      // Close loop automatically
      this.userRawPoints.push({ ...this.userRawPoints[0] });
      this.processPath();
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.zoomLevel *= factor;
  }

  private screenToWorld(clientX: number, clientY: number): Point2D {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const screenX = (clientX - rect.left);
    const screenY = (clientY - rect.top);
    const centerX = this.canvas.width / (2 * dpr) + this.panX;
    const centerY = this.canvas.height / (2 * dpr) + this.panY;

    return {
      x: (screenX - centerX) / this.zoomLevel,
      y: (screenY - centerY) / this.zoomLevel,
    };
  }

  getHudInfo(): { badge: string; coords: string } {
    const count = Math.min(this.componentCount, this.fourierComponents.length);
    const total = this.fourierComponents.length;
    const rmse = this.resampledPoints.length > 0 && this.fourierComponents.length > 0
      ? computeRMSE(this.resampledPoints, this.fourierComponents, count).toFixed(2)
      : '0.00';
    const status = this.isPlayingState ? 'RUNNING' : 'STOPPED';

    return {
      badge: `[${status}] ${count}/${total} Harmonics • RMSE: ${rmse}px`,
      coords: `Phase: ${(this.t).toFixed(2)} rad (${((this.t / (2 * Math.PI)) * 100).toFixed(0)}%) | Direction: ${this.direction > 0 ? 'Forward' : 'Reverse'}`,
    };
  }

  getControlsHTML(): string {
    const total = this.fourierComponents.length || 1;
    const rmse = this.resampledPoints.length > 0 && this.fourierComponents.length > 0
      ? computeRMSE(this.resampledPoints, this.fourierComponents, this.componentCount).toFixed(2)
      : '0.00';

    return `
      <!-- Master Control: Stop / Run / Reset -->
      <div class="control-group !border-purple-500/40 bg-gradient-to-b from-[#131926] to-[#0a0e16]">
        <div class="control-header">
          <span class="control-title text-purple-300">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Epicycle Generation Control
          </span>
          <span id="fourier-status-badge" class="px-2 py-0.5 rounded text-[10px] font-mono ${this.isPlayingState ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'}">
            ${this.isPlayingState ? '● GENERATING' : '❚❚ STOPPED'}
          </span>
        </div>
        <div class="flex space-x-2">
          <button id="btn-fourier-playpause" class="btn-primary flex-1 ${this.isPlayingState ? '!bg-rose-600 hover:!bg-rose-500' : '!bg-emerald-600 hover:!bg-emerald-500'}">
            <span id="fourier-btn-play-text">${this.isPlayingState ? '❚❚ Stop Generation' : '▶ Run Generation'}</span>
          </button>
          <button id="btn-fourier-reset-top" class="btn-secondary flex-1 border-purple-700/50 hover:border-purple-500 text-purple-200">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>Restart (t=0)</span>
          </button>
        </div>
      </div>

      <!-- Presets & Freehand -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            Input Geometry & Presets
          </span>
          <button id="btn-clear-draw" class="btn-secondary !py-0.5 !px-2 text-[11px]">Clear Canvas</button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Preset Vector Paths</label>
            <select id="fourier-preset-select">
              <option value="" disabled selected>Select a Mathematical Shape...</option>
              ${FOURIER_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="text-[11px] text-slate-400 bg-[#070a12] p-2.5 rounded-lg border border-slate-800 flex items-center space-x-2">
            <span class="text-cyan-400 text-sm">💡</span>
            <span>Click & drag directly on the canvas to draw any custom continuous closed loop!</span>
          </div>
        </div>
      </div>

      <!-- Harmonic Approximation Slider -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            Fourier Series Truncation
          </span>
          <span id="label-rmse-badge" class="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
            RMSE: ${rmse} px
          </span>
        </div>
        <div class="space-y-3">
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Active Epicycles / Harmonics</span>
              <span id="val-comp-count" class="slider-val">${this.componentCount} / ${total}</span>
            </div>
            <input type="range" id="slider-comp-count" min="1" max="${total}" step="1" value="${this.componentCount}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Rotation Speed</span>
              <span id="val-anim-speed" class="slider-val">${this.animSpeed.toFixed(1)}x</span>
            </div>
            <input type="range" id="slider-anim-speed" min="0.1" max="4.0" step="0.1" value="${this.animSpeed}">
          </div>

          <div class="flex space-x-2">
            <button id="btn-reverse-dir" class="btn-secondary flex-1">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
              <span>Reverse Direction</span>
            </button>
            <button id="btn-redraw-cycle" class="btn-secondary flex-1">
              <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              <span>Restart Cycle</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Visibility Toggles -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            Component Visualization
          </span>
        </div>
        <div class="space-y-2">
          <label class="toggle-switch">
            <span>Show Epicycle Circles</span>
            <input type="checkbox" id="toggle-circles" class="switch-input" ${this.showCircles ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Radius Vectors</span>
            <input type="checkbox" id="toggle-vectors" class="switch-input" ${this.showVectors ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Original Target Drawing (Dashed)</span>
            <input type="checkbox" id="toggle-original" class="switch-input" ${this.showOriginal ? 'checked' : ''}>
          </label>
          <label class="toggle-switch">
            <span>Show Reconstructed Fourier Curve</span>
            <input type="checkbox" id="toggle-reconstructed" class="switch-input" ${this.showReconstructed ? 'checked' : ''}>
          </label>
        </div>
      </div>
    `;
  }

  bindControls(container: HTMLElement): void {
    this.containerEl = container;

    // Master Controls
    const playPauseBtn = container.querySelector('#btn-fourier-playpause');
    playPauseBtn?.addEventListener('click', () => {
      this.togglePlay();
    });

    const resetTopBtn = container.querySelector('#btn-fourier-reset-top');
    resetTopBtn?.addEventListener('click', () => {
      this.reset();
    });

    // Preset selector
    const presetSelect = container.querySelector('#fourier-preset-select') as HTMLSelectElement | null;
    presetSelect?.addEventListener('change', () => {
      const idx = parseInt(presetSelect.value, 10);
      this.loadPreset(idx);
    });

    // Component count slider
    const compSlider = container.querySelector('#slider-comp-count') as HTMLInputElement | null;
    const compVal = container.querySelector('#val-comp-count');
    const rmseBadge = container.querySelector('#label-rmse-badge');

    compSlider?.addEventListener('input', () => {
      this.componentCount = parseInt(compSlider.value, 10);
      const total = this.fourierComponents.length;
      if (compVal) compVal.textContent = `${this.componentCount} / ${total}`;

      if (rmseBadge && this.resampledPoints.length > 0) {
        const rmse = computeRMSE(this.resampledPoints, this.fourierComponents, this.componentCount).toFixed(2);
        rmseBadge.textContent = `RMSE: ${rmse} px`;
      }
    });

    // Animation speed slider
    const speedSlider = container.querySelector('#slider-anim-speed') as HTMLInputElement | null;
    const speedVal = container.querySelector('#val-anim-speed');
    speedSlider?.addEventListener('input', () => {
      this.animSpeed = parseFloat(speedSlider.value);
      if (speedVal) speedVal.textContent = `${this.animSpeed.toFixed(1)}x`;
    });

    // Reverse direction
    const revBtn = container.querySelector('#btn-reverse-dir');
    revBtn?.addEventListener('click', () => {
      this.direction *= -1;
    });

    // Restart cycle
    const redrawBtn = container.querySelector('#btn-redraw-cycle');
    redrawBtn?.addEventListener('click', () => {
      this.t = 0;
      this.trail = [];
    });

    // Clear canvas
    const clearBtn = container.querySelector('#btn-clear-draw');
    clearBtn?.addEventListener('click', () => {
      this.userRawPoints = [];
      this.resampledPoints = [];
      this.fourierComponents = [];
      this.trail = [];
      this.syncUI();
    });

    // Toggles
    const toggleCircles = container.querySelector('#toggle-circles') as HTMLInputElement | null;
    toggleCircles?.addEventListener('change', () => {
      this.showCircles = toggleCircles.checked;
    });

    const toggleVectors = container.querySelector('#toggle-vectors') as HTMLInputElement | null;
    toggleVectors?.addEventListener('change', () => {
      this.showVectors = toggleVectors.checked;
    });

    const toggleOriginal = container.querySelector('#toggle-original') as HTMLInputElement | null;
    toggleOriginal?.addEventListener('change', () => {
      this.showOriginal = toggleOriginal.checked;
    });

    const toggleReconstructed = container.querySelector('#toggle-reconstructed') as HTMLInputElement | null;
    toggleReconstructed?.addEventListener('change', () => {
      this.showReconstructed = toggleReconstructed.checked;
    });

    this.updateControlsUI();
  }

  private updateControlsUI(): void {
    if (!this.containerEl) return;
    const badge = this.containerEl.querySelector('#fourier-status-badge');
    const playBtn = this.containerEl.querySelector('#btn-fourier-playpause');
    const playText = this.containerEl.querySelector('#fourier-btn-play-text');

    if (badge) {
      if (this.isPlayingState) {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/60';
        badge.textContent = '● GENERATING';
      } else {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-300 border border-rose-800/60';
        badge.textContent = '❚❚ STOPPED';
      }
    }

    if (playBtn && playText) {
      if (this.isPlayingState) {
        playBtn.className = 'btn-primary flex-1 !bg-rose-600 hover:!bg-rose-500';
        playText.textContent = '❚❚ Stop Generation';
      } else {
        playBtn.className = 'btn-primary flex-1 !bg-emerald-600 hover:!bg-emerald-500';
        playText.textContent = '▶ Run Generation';
      }
    }
  }

  private syncUI(): void {
    if (!this.containerEl) return;
    const compSlider = this.containerEl.querySelector('#slider-comp-count') as HTMLInputElement | null;
    const compVal = this.containerEl.querySelector('#val-comp-count');
    const rmseBadge = this.containerEl.querySelector('#label-rmse-badge');

    const total = this.fourierComponents.length;
    if (compSlider) {
      compSlider.max = String(total || 1);
      compSlider.value = String(this.componentCount);
    }
    if (compVal) compVal.textContent = `${this.componentCount} / ${total}`;

    if (rmseBadge && this.resampledPoints.length > 0) {
      const rmse = computeRMSE(this.resampledPoints, this.fourierComponents, this.componentCount).toFixed(2);
      rmseBadge.textContent = `RMSE: ${rmse} px`;
    }
  }

  getTheoryHTML(): string {
    return `
      <!-- Theory 1 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>The Core Fourier Concept</span>
          <span class="text-xs text-purple-400 font-mono">01</span>
        </div>
        <div class="theory-content">
          <p>
            In 1807, Joseph Fourier proposed a revolutionary insight: <em>any arbitrary periodic signal or continuous curve can be broken down into a sum of simple sinusoidal waves</em>.
          </p>
          <p>
            When applied to 2D geometric curves, each sinusoidal wave manifests as a <strong>rotating circle (epicycle)</strong> whose radius, rotation frequency, and starting phase are determined by complex coefficients:
          </p>
          <div class="math-block">
            $$f(t) = \\sum_{n=-M}^{M} c_n e^{i n t}$$
          </div>
          <p>
            By stacking these rotating vectors tip-to-tail, the tip of the final vector traces out your original drawing with unbelievable fidelity!
          </p>
        </div>
      </div>

      <!-- Theory 2 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Euler's Formula & Rotating Vectors</span>
          <span class="text-xs text-cyan-400 font-mono">02</span>
        </div>
        <div class="theory-content">
          <p>
            Why do complex exponentials correspond to rotating circles? The connection is <strong>Euler's identity</strong>:
          </p>
          <div class="math-block">
            $$e^{i \\theta} = \\cos(\\theta) + i \\sin(\\theta)$$
          </div>
          <p>
            As parameter $t$ advances, $e^{i n t}$ spins around the origin at an angular velocity of $n$ radians per unit time. The complex coefficient $c_n = |c_n| e^{i \\phi_n}$ scales the circle to radius $|c_n|$ and sets its initial angle to $\\phi_n$.
          </p>
        </div>
      </div>

      <!-- Theory 3 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Discrete Fourier Transform (DFT)</span>
          <span class="text-xs text-amber-400 font-mono">03</span>
        </div>
        <div class="theory-content">
          <p>
            When you sketch a shape, MathLab samples $N$ points $(x_k, y_k)$ and treats them as complex coordinates $z_k = x_k + i y_k$. The frequency spectrum is computed via the DFT:
          </p>
          <div class="math-block">
            $$c_n = \\frac{1}{N} \\sum_{k=0}^{N-1} z_k \\cdot e^{-i \\frac{2\\pi n k}{N}}$$
          </div>
          <p>
            We sort these components by amplitude $|c_n|$ descending. The largest circles capture the general silhouette, while tiny rapid epicycles add fine details, sharp corners, and curvature.
          </p>
        </div>
      </div>

      <!-- Theory 4 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Try This Experiment!</span>
          <span class="text-xs text-purple-400 font-mono">04</span>
        </div>
        <div class="theory-content">
          <p class="text-xs text-slate-300">
            1. Select the <strong>5-Pointed Star</strong> or <strong>Cardioid Heart</strong> preset.<br>
            2. Drag the <strong>Active Epicycles slider</strong> down to <strong>3</strong>. Notice how the shape turns into a crude rounded oval.<br>
            3. Increase it to <strong>10</strong>, then <strong>35</strong>. Watch how the sharp star points and inward vertices abruptly snap into view as high-frequency harmonics are reintroduced!
          </p>
        </div>
      </div>
    `;
  }
}
