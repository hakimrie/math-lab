import { Experiment } from '../experiment';
import { vertexShaderSource, fragmentShaderSource } from './shaders';
import { FRACTAL_PRESETS } from './presets';

export class FractalRenderer implements Experiment {
  id = 'fractals';
  name = 'Fractal Zoomer';
  badge = 'GPU Accelerated';

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;

  // Uniform locations
  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uCenterLoc: WebGLUniformLocation | null = null;
  private uZoomLoc: WebGLUniformLocation | null = null;
  private uMaxIterLoc: WebGLUniformLocation | null = null;
  private uFractalTypeLoc: WebGLUniformLocation | null = null;
  private uJuliaCLoc: WebGLUniformLocation | null = null;
  private uEscapeRadSqLoc: WebGLUniformLocation | null = null;
  private uSmoothColoringLoc: WebGLUniformLocation | null = null;
  private uPaletteLoc: WebGLUniformLocation | null = null;
  private uTimeLoc: WebGLUniformLocation | null = null;
  private uPaletteSpeedLoc: WebGLUniformLocation | null = null;

  // State
  private fractalType = 0; // 0: Mandelbrot, 1: Julia, 2: Burning Ship, 3: Tricorn
  private centerX = -0.5;
  private centerY = 0.0;
  private zoomLevel = 0.35;
  private maxIterations = 200;
  private juliaC: [number, number] = [-0.7, 0.27015];
  private escapeRadius = 4.0;
  private smoothColoring = 1;
  private palette = 0;
  private paletteSpeed = 0.0;
  private isAnimPlaying = true;
  private elapsedTime = 0;

  // Dragging & Interaction
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private containerEl: HTMLElement | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.error('WebGL 2 is not supported on this device/browser');
      return;
    }
    this.gl = gl;

    // Create shader program
    const vertShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertShader || !fragShader) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vertShader);
    gl.attachShader(prog, fragShader);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;
    gl.useProgram(prog);

    // Setup full-screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posAttrLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posAttrLoc);
    gl.vertexAttribPointer(posAttrLoc, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    this.uResolutionLoc = gl.getUniformLocation(prog, 'u_resolution');
    this.uCenterLoc = gl.getUniformLocation(prog, 'u_center');
    this.uZoomLoc = gl.getUniformLocation(prog, 'u_zoom');
    this.uMaxIterLoc = gl.getUniformLocation(prog, 'u_max_iterations');
    this.uFractalTypeLoc = gl.getUniformLocation(prog, 'u_fractal_type');
    this.uJuliaCLoc = gl.getUniformLocation(prog, 'u_julia_c');
    this.uEscapeRadSqLoc = gl.getUniformLocation(prog, 'u_escape_radius_sq');
    this.uSmoothColoringLoc = gl.getUniformLocation(prog, 'u_smooth_coloring');
    this.uPaletteLoc = gl.getUniformLocation(prog, 'u_palette');
    this.uTimeLoc = gl.getUniformLocation(prog, 'u_time');
    this.uPaletteSpeedLoc = gl.getUniformLocation(prog, 'u_palette_speed');
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.gl || !this.canvas) return;
    const renderWidth = Math.floor(width * dpr);
    const renderHeight = Math.floor(height * dpr);

    this.canvas.width = renderWidth;
    this.canvas.height = renderHeight;
    this.gl.viewport(0, 0, renderWidth, renderHeight);
  }

  update(dt: number, _time: number): void {
    if (this.isAnimPlaying && this.paletteSpeed > 0) {
      this.elapsedTime += dt;
    }
  }

  render(): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.canvas) return;

    gl.useProgram(this.program);

    gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uCenterLoc, this.centerX, this.centerY);
    gl.uniform1f(this.uZoomLoc, this.zoomLevel);
    gl.uniform1i(this.uMaxIterLoc, this.maxIterations);
    gl.uniform1i(this.uFractalTypeLoc, this.fractalType);
    gl.uniform2f(this.uJuliaCLoc, this.juliaC[0], this.juliaC[1]);
    gl.uniform1f(this.uEscapeRadSqLoc, this.escapeRadius * this.escapeRadius);
    gl.uniform1i(this.uSmoothColoringLoc, this.smoothColoring);
    gl.uniform1i(this.uPaletteLoc, this.palette);
    gl.uniform1f(this.uTimeLoc, this.elapsedTime);
    gl.uniform1f(this.uPaletteSpeedLoc, this.paletteSpeed);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
      this.gl = null;
    }
  }

  play(): void {
    this.isAnimPlaying = true;
  }

  pause(): void {
    this.isAnimPlaying = false;
  }

  isPlaying(): boolean {
    return this.isAnimPlaying;
  }

  togglePlay(): boolean {
    this.isAnimPlaying = !this.isAnimPlaying;
    return this.isAnimPlaying;
  }

  reset(): void {
    this.centerX = this.fractalType === 1 ? 0.0 : -0.5;
    this.centerY = 0.0;
    this.zoomLevel = this.fractalType === 1 ? 0.45 : 0.35;
    this.maxIterations = 200;
    this.syncUI();
  }

  zoom(factor: number): void {
    this.zoomLevel *= factor;
    this.syncUI();
  }

  onPointerDown(e: PointerEvent): void {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging || !this.canvas) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    const minDim = Math.min(this.canvas.width, this.canvas.height);
    // Pan in complex coordinates
    this.centerX -= (dx * window.devicePixelRatio) / (minDim * this.zoomLevel);
    this.centerY += (dy * window.devicePixelRatio) / (minDim * this.zoomLevel);

    this.syncUI();
  }

  onPointerUp(_e: PointerEvent): void {
    this.isDragging = false;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * window.devicePixelRatio;
    const mouseY = (e.clientY - rect.top) * window.devicePixelRatio;
    const minDim = Math.min(this.canvas.width, this.canvas.height);

    // Complex coordinate of cursor before zoom
    const cX = this.centerX + (mouseX - 0.5 * this.canvas.width) / (minDim * this.zoomLevel);
    const cY = this.centerY - (mouseY - 0.5 * this.canvas.height) / (minDim * this.zoomLevel);

    const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    this.zoomLevel *= zoomFactor;

    // Adjust center so point under cursor remains pinned
    this.centerX = cX - (mouseX - 0.5 * this.canvas.width) / (minDim * this.zoomLevel);
    this.centerY = cY + (mouseY - 0.5 * this.canvas.height) / (minDim * this.zoomLevel);

    this.syncUI();
  }

  getHudInfo(): { badge: string; coords: string } {
    const typeNames = ['Mandelbrot', 'Julia Set', 'Burning Ship', 'Tricorn'];
    const zoomExp = Math.log10(this.zoomLevel / 0.35);
    const zoomStr = zoomExp >= 1 ? `10^${zoomExp.toFixed(1)}x` : `${this.zoomLevel.toFixed(2)}x`;
    return {
      badge: `${typeNames[this.fractalType]} • ${this.maxIterations} iters`,
      coords: `Re: ${this.centerX.toFixed(6)}, Im: ${this.centerY.toFixed(6)} | Zoom: ${zoomStr}`,
    };
  }

  getControlsHTML(): string {
    return `
      <!-- Presets & Types -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            Fractal Configuration
          </span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Fractal Equation</label>
            <select id="fractal-type-select">
              <option value="0" ${this.fractalType === 0 ? 'selected' : ''}>Mandelbrot Set: z = z² + c</option>
              <option value="1" ${this.fractalType === 1 ? 'selected' : ''}>Julia Set: z = z² + c (interactive)</option>
              <option value="2" ${this.fractalType === 2 ? 'selected' : ''}>Burning Ship: z = (|x| + i|y|)² + c</option>
              <option value="3" ${this.fractalType === 3 ? 'selected' : ''}>Tricorn: z = (z̄)² + c</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Preset Locations</label>
            <select id="fractal-preset-select">
              <option value="" disabled selected>Explore Featured Landmarks...</option>
              ${FRACTAL_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Julia Parameter Pad (Shows when Julia is active) -->
      <div id="julia-controls" class="control-group ${this.fractalType === 1 ? '' : 'hidden'}">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Julia Constant c = Re(c) + i Im(c)
          </span>
          <button id="btn-random-julia" class="btn-secondary !py-0.5 !px-2 text-[11px]">Randomize</button>
        </div>
        <div class="space-y-3">
          <!-- 2D interactive pad for c -->
          <div class="relative">
            <div id="julia-pad" class="xy-pad-container">
              <div class="xy-pad-axis-x"></div>
              <div class="xy-pad-axis-y"></div>
              <div id="julia-pad-cursor" class="xy-pad-cursor"></div>
            </div>
            <div class="absolute bottom-1 right-2 text-[10px] font-mono text-slate-500 pointer-events-none">Drag in 2D plane</div>
          </div>
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Re(c)</span>
              <span id="val-julia-re" class="slider-val">${this.juliaC[0].toFixed(4)}</span>
            </div>
            <input type="range" id="slider-julia-re" min="-2" max="2" step="0.001" value="${this.juliaC[0]}">
          </div>
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Im(c)</span>
              <span id="val-julia-im" class="slider-val">${this.juliaC[1].toFixed(4)}</span>
            </div>
            <input type="range" id="slider-julia-im" min="-2" max="2" step="0.001" value="${this.juliaC[1]}">
          </div>
        </div>
      </div>

      <!-- Precision & Shading -->
      <div class="control-group">
        <div class="control-header">
          <span class="control-title">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            Calculation & Aesthetics
          </span>
        </div>
        <div class="space-y-3">
          <div class="slider-container">
            <div class="slider-label-row">
              <span>Max Iterations</span>
              <span id="val-iterations" class="slider-val">${this.maxIterations}</span>
            </div>
            <input type="range" id="slider-iterations" min="50" max="1500" step="25" value="${this.maxIterations}">
          </div>

          <div>
            <label class="block text-xs font-mono text-slate-400 mb-1">Color Palette</label>
            <select id="palette-select">
              <option value="0" ${this.palette === 0 ? 'selected' : ''}>Electric Cosmic (Cyan & Violet)</option>
              <option value="1" ${this.palette === 1 ? 'selected' : ''}>Sunset Magma (Crimson & Gold)</option>
              <option value="2" ${this.palette === 2 ? 'selected' : ''}>Cyberpunk Neon (Magenta & Cyan)</option>
              <option value="3" ${this.palette === 3 ? 'selected' : ''}>Emerald Abyss (Deep Jade & Mint)</option>
              <option value="4" ${this.palette === 4 ? 'selected' : ''}>Psychedelic Rainbow (Continuous HSV)</option>
              <option value="5" ${this.palette === 5 ? 'selected' : ''}>Monochrome Platinum (Technical)</option>
            </select>
          </div>

          <label class="toggle-switch">
            <span>Continuous Smooth Coloring (Renormalized)</span>
            <input type="checkbox" id="toggle-smooth" class="switch-input" ${this.smoothColoring === 1 ? 'checked' : ''}>
          </label>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Palette Animation Speed</span>
              <span id="val-pal-speed" class="slider-val">${this.paletteSpeed.toFixed(2)}x</span>
            </div>
            <input type="range" id="slider-pal-speed" min="0" max="1.5" step="0.05" value="${this.paletteSpeed}">
          </div>

          <div class="slider-container">
            <div class="slider-label-row">
              <span>Escape Radius</span>
              <span id="val-escape-radius" class="slider-val">${this.escapeRadius.toFixed(1)}</span>
            </div>
            <input type="range" id="slider-escape-radius" min="2.0" max="20.0" step="0.5" value="${this.escapeRadius}">
          </div>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex space-x-2">
        <button id="btn-reset-view" class="btn-secondary flex-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Reset View
        </button>
        <button id="btn-copy-coords" class="btn-secondary flex-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
          Copy Coords
        </button>
      </div>
    `;
  }

  bindControls(container: HTMLElement): void {
    this.containerEl = container;

    // Type selector
    const typeSelect = container.querySelector('#fractal-type-select') as HTMLSelectElement | null;
    typeSelect?.addEventListener('change', () => {
      this.fractalType = parseInt(typeSelect.value, 10);
      const juliaBox = container.querySelector('#julia-controls');
      if (this.fractalType === 1) {
        juliaBox?.classList.remove('hidden');
        this.centerX = 0.0;
        this.centerY = 0.0;
        this.zoomLevel = 0.45;
      } else {
        juliaBox?.classList.add('hidden');
        if (this.fractalType === 0) {
          this.centerX = -0.5;
          this.centerY = 0.0;
          this.zoomLevel = 0.35;
        }
      }
      this.syncUI();
    });

    // Preset selector
    const presetSelect = container.querySelector('#fractal-preset-select') as HTMLSelectElement | null;
    presetSelect?.addEventListener('change', () => {
      const idx = parseInt(presetSelect.value, 10);
      const preset = FRACTAL_PRESETS[idx];
      if (preset) {
        this.fractalType = preset.type;
        this.centerX = preset.centerX;
        this.centerY = preset.centerY;
        this.zoomLevel = preset.zoom;
        this.maxIterations = preset.iterations;
        if (preset.juliaC) this.juliaC = [...preset.juliaC];
        if (preset.palette !== undefined) this.palette = preset.palette;

        if (typeSelect) typeSelect.value = String(this.fractalType);
        const juliaBox = container.querySelector('#julia-controls');
        if (this.fractalType === 1) {
          juliaBox?.classList.remove('hidden');
        } else {
          juliaBox?.classList.add('hidden');
        }
        this.syncUI();
      }
    });

    // Iterations slider
    const iterSlider = container.querySelector('#slider-iterations') as HTMLInputElement | null;
    const iterVal = container.querySelector('#val-iterations');
    iterSlider?.addEventListener('input', () => {
      this.maxIterations = parseInt(iterSlider.value, 10);
      if (iterVal) iterVal.textContent = String(this.maxIterations);
    });

    // Palette selector
    const paletteSelect = container.querySelector('#palette-select') as HTMLSelectElement | null;
    paletteSelect?.addEventListener('change', () => {
      this.palette = parseInt(paletteSelect.value, 10);
    });

    // Smooth coloring toggle
    const smoothToggle = container.querySelector('#toggle-smooth') as HTMLInputElement | null;
    smoothToggle?.addEventListener('change', () => {
      this.smoothColoring = smoothToggle.checked ? 1 : 0;
    });

    // Palette speed slider
    const palSpeedSlider = container.querySelector('#slider-pal-speed') as HTMLInputElement | null;
    const palSpeedVal = container.querySelector('#val-pal-speed');
    palSpeedSlider?.addEventListener('input', () => {
      this.paletteSpeed = parseFloat(palSpeedSlider.value);
      if (palSpeedVal) palSpeedVal.textContent = `${this.paletteSpeed.toFixed(2)}x`;
    });

    // Escape radius slider
    const escapeSlider = container.querySelector('#slider-escape-radius') as HTMLInputElement | null;
    const escapeVal = container.querySelector('#val-escape-radius');
    escapeSlider?.addEventListener('input', () => {
      this.escapeRadius = parseFloat(escapeSlider.value);
      if (escapeVal) escapeVal.textContent = this.escapeRadius.toFixed(1);
    });

    // Julia Re & Im sliders
    const juliaReSlider = container.querySelector('#slider-julia-re') as HTMLInputElement | null;
    const juliaImSlider = container.querySelector('#slider-julia-im') as HTMLInputElement | null;
    const juliaReVal = container.querySelector('#val-julia-re');
    const juliaImVal = container.querySelector('#val-julia-im');

    const updateJulia = () => {
      if (juliaReSlider && juliaImSlider) {
        this.juliaC[0] = parseFloat(juliaReSlider.value);
        this.juliaC[1] = parseFloat(juliaImSlider.value);
        if (juliaReVal) juliaReVal.textContent = this.juliaC[0].toFixed(4);
        if (juliaImVal) juliaImVal.textContent = this.juliaC[1].toFixed(4);
        this.updatePadCursor();
      }
    };

    juliaReSlider?.addEventListener('input', updateJulia);
    juliaImSlider?.addEventListener('input', updateJulia);

    // Interactive 2D Julia Pad
    const juliaPad = container.querySelector('#julia-pad') as HTMLElement | null;
    let padDragging = false;

    const handlePadMove = (e: MouseEvent | TouchEvent) => {
      if (!juliaPad) return;
      const rect = juliaPad.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      // Map [0, 1] to [-1.5, 1.5]
      this.juliaC[0] = (normX - 0.5) * 3.0;
      this.juliaC[1] = -(normY - 0.5) * 3.0;

      if (juliaReSlider) juliaReSlider.value = String(this.juliaC[0]);
      if (juliaImSlider) juliaImSlider.value = String(this.juliaC[1]);
      if (juliaReVal) juliaReVal.textContent = this.juliaC[0].toFixed(4);
      if (juliaImVal) juliaImVal.textContent = this.juliaC[1].toFixed(4);

      this.updatePadCursor();
    };

    juliaPad?.addEventListener('mousedown', (e) => {
      padDragging = true;
      handlePadMove(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (padDragging) handlePadMove(e);
    });
    window.addEventListener('mouseup', () => {
      padDragging = false;
    });

    juliaPad?.addEventListener('touchstart', (e) => {
      padDragging = true;
      handlePadMove(e);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (padDragging) handlePadMove(e);
    }, { passive: false });
    window.addEventListener('touchend', () => {
      padDragging = false;
    });

    // Randomize Julia button
    const randJuliaBtn = container.querySelector('#btn-random-julia');
    randJuliaBtn?.addEventListener('click', () => {
      // Pick aesthetic Julia coordinates inside or near boundary
      const r = 0.78 * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      this.juliaC[0] = r * Math.cos(theta);
      this.juliaC[1] = r * Math.sin(theta);
      if (juliaReSlider) juliaReSlider.value = String(this.juliaC[0]);
      if (juliaImSlider) juliaImSlider.value = String(this.juliaC[1]);
      if (juliaReVal) juliaReVal.textContent = this.juliaC[0].toFixed(4);
      if (juliaImVal) juliaImVal.textContent = this.juliaC[1].toFixed(4);
      this.updatePadCursor();
    });

    // Reset view button
    const resetBtn = container.querySelector('#btn-reset-view');
    resetBtn?.addEventListener('click', () => this.reset());

    // Copy coords button
    const copyBtn = container.querySelector('#btn-copy-coords');
    copyBtn?.addEventListener('click', () => {
      const text = `MathLab Fractal Location:\nType: ${this.fractalType}\nCenter: (${this.centerX}, ${this.centerY})\nZoom: ${this.zoom}\nIterations: ${this.maxIterations}`;
      navigator.clipboard.writeText(text);
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
            Copy Coords
          `;
        }, 1500);
      }
    });

    this.updatePadCursor();
  }

  private updatePadCursor(): void {
    if (!this.containerEl) return;
    const cursor = this.containerEl.querySelector('#julia-pad-cursor') as HTMLElement | null;
    if (!cursor) return;

    // Map [-1.5, 1.5] back to [0%, 100%]
    const pctX = ((this.juliaC[0] / 3.0) + 0.5) * 100;
    const pctY = ((-this.juliaC[1] / 3.0) + 0.5) * 100;

    cursor.style.left = `${Math.max(0, Math.min(100, pctX))}%`;
    cursor.style.top = `${Math.max(0, Math.min(100, pctY))}%`;
  }

  private syncUI(): void {
    if (!this.containerEl) return;
    const iterSlider = this.containerEl.querySelector('#slider-iterations') as HTMLInputElement | null;
    const iterVal = this.containerEl.querySelector('#val-iterations');
    if (iterSlider) iterSlider.value = String(this.maxIterations);
    if (iterVal) iterVal.textContent = String(this.maxIterations);

    const palSelect = this.containerEl.querySelector('#palette-select') as HTMLSelectElement | null;
    if (palSelect) palSelect.value = String(this.palette);

    this.updatePadCursor();
  }

  getTheoryHTML(): string {
    return `
      <!-- Educational Section 1 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>What is a Fractal?</span>
          <span class="text-xs text-cyan-400 font-mono">01</span>
        </div>
        <div class="theory-content">
          <p>
            A <strong>fractal</strong> is a geometric figure exhibiting <em>self-similarity</em> across infinite scales. No matter how deeply you zoom into the boundary, new intricate structures, spirals, filaments, and mini-replicas continually reveal themselves.
          </p>
          <p>
            Rather than being crafted by an artist, this infinite complexity emerges from an astonishingly simple deterministic feedback rule iterated in the complex number plane:
          </p>
          <div class="math-block">
            $$z_{n+1} = z_n^2 + c$$
          </div>
          <p>
            where $z$ and $c$ are complex numbers of the form $x + iy$.
          </p>
        </div>
      </div>

      <!-- Educational Section 2 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Mandelbrot vs. Julia Sets</span>
          <span class="text-xs text-purple-400 font-mono">02</span>
        </div>
        <div class="theory-content">
          <p>
            The fundamental difference lies in which variable represents the pixel coordinate:
          </p>
          <ul class="space-y-2 text-xs text-slate-300 ml-4 list-disc mb-3">
            <li>
              <strong>Mandelbrot Set:</strong> We start with $z_0 = 0$ and set $c$ equal to the pixel's coordinate. It acts as a comprehensive "dictionary" or catalog of all possible Julia sets.
            </li>
            <li>
              <strong>Julia Set:</strong> We choose a fixed parameter $c$ (try the 2D coordinate pad in Lab Controls!), and set the initial point $z_0$ equal to each pixel coordinate.
            </li>
          </ul>
          <p>
            Gaston Julia proved that if $c$ lies <em>inside</em> the Mandelbrot set, its Julia set is a single connected shape; if $c$ lies <em>outside</em>, the Julia set fractures into a cloud of disconnected dust (a Cantor set).
          </p>
        </div>
      </div>

      <!-- Educational Section 3 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Escape-Time & Continuous Shading</span>
          <span class="text-xs text-amber-400 font-mono">03</span>
        </div>
        <div class="theory-content">
          <p>
            If $|z_n| > 2$, the sequence is mathematically guaranteed to fly off toward infinity. The number of iterations $n$ it takes for $|z_n|$ to exceed this escape threshold determines the pixel's color.
          </p>
          <p>
            Traditional escape-time rendering creates discrete color bands. MathLab implements <strong>continuous smooth shading</strong> using the fractional iteration formula:
          </p>
          <div class="math-block">
            $$\nu = n + 1 - \\frac{\\ln(\\ln|z_{n+1}|)}{\\ln 2}$$
          </div>
          <p>
            This normalizes the color transition, yielding silky-smooth organic gradients powered by GLSL GPU shaders at 60 FPS.
          </p>
        </div>
      </div>

      <!-- Educational Section 4 -->
      <div class="theory-card">
        <div class="theory-header">
          <span>Try This Experiment!</span>
          <span class="text-xs text-cyan-400 font-mono">04</span>
        </div>
        <div class="theory-content">
          <p class="text-xs text-slate-300">
            1. Select <strong>Julia Set</strong> from the dropdown.<br>
            2. Slowly drag inside the <strong>Julia Constant 2D pad</strong>.<br>
            3. Observe how the fractal smoothly morphs between Douady's rabbit, San Marco spires, and filament dendrites as $c$ crosses different internal resonances!
          </p>
        </div>
      </div>
    `;
  }
}
