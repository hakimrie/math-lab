import './style.css';
import { Experiment } from './experiments/experiment';
import { FractalRenderer } from './experiments/fractals/fractal-renderer';
import { FourierRenderer } from './experiments/fourier/fourier-renderer';
import { ChaosRenderer } from './experiments/chaos/chaos-renderer';
import { renderMathInElement } from './utils/katex-render';

class MathLabApp {
  private canvas: HTMLCanvasElement;
  private experiments: Map<string, Experiment> = new Map();
  private activeExperiment: Experiment | null = null;

  // UI Element References
  private navFractalsBtn: HTMLElement;
  private navFourierBtn: HTMLElement;
  private navChaosBtn: HTMLElement;
  private hudBadgeEl: HTMLElement;
  private hudCoordsEl: HTMLElement;
  private footerFpsEl: HTMLElement;
  private footerEngineEl: HTMLElement;
  private dynamicControlsEl: HTMLElement;
  private dynamicTheoryEl: HTMLElement;
  private tabControlsBtn: HTMLElement;
  private tabLearnBtn: HTMLElement;
  private panelControlsEl: HTMLElement;
  private panelLearnEl: HTMLElement;

  // Global Header Engine Controls
  private globalPlayPauseBtn: HTMLElement;
  private globalResetBtn: HTMLElement;
  private globalStatusDot: HTMLElement;
  private globalPlayPauseText: HTMLElement;

  // Floating Viewport Actions
  private playPauseBtn: HTMLElement;
  private iconPause: HTMLElement;
  private iconPlay: HTMLElement;
  private resetBtn: HTMLElement;
  private zoomInBtn: HTMLElement;
  private zoomOutBtn: HTMLElement;

  // About Modal
  private aboutModal: HTMLElement;
  private btnAbout: HTMLElement;
  private modalClose: HTMLElement;
  private modalAck: HTMLElement;
  private btnFullscreen: HTMLElement;

  // Animation Loop State
  private lastTime = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor() {
    this.canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    this.navFractalsBtn = document.getElementById('nav-fractals')!;
    this.navFourierBtn = document.getElementById('nav-fourier')!;
    this.navChaosBtn = document.getElementById('nav-chaos')!;
    this.hudBadgeEl = document.getElementById('hud-badge')!;
    this.hudCoordsEl = document.getElementById('hud-coords')!;
    this.footerFpsEl = document.getElementById('footer-fps')!;
    this.footerEngineEl = document.getElementById('footer-engine')!;
    this.dynamicControlsEl = document.getElementById('dynamic-controls')!;
    this.dynamicTheoryEl = document.getElementById('dynamic-theory')!;
    this.tabControlsBtn = document.getElementById('sidebar-tab-controls')!;
    this.tabLearnBtn = document.getElementById('sidebar-tab-learn')!;
    this.panelControlsEl = document.getElementById('panel-controls')!;
    this.panelLearnEl = document.getElementById('panel-learn')!;

    this.globalPlayPauseBtn = document.getElementById('btn-global-playpause')!;
    this.globalResetBtn = document.getElementById('btn-global-reset')!;
    this.globalStatusDot = document.getElementById('global-status-dot')!;
    this.globalPlayPauseText = document.getElementById('global-playpause-text')!;

    this.playPauseBtn = document.getElementById('vp-btn-playpause')!;
    this.iconPause = document.getElementById('vp-icon-pause')!;
    this.iconPlay = document.getElementById('vp-icon-play')!;
    this.resetBtn = document.getElementById('vp-btn-reset')!;
    this.zoomInBtn = document.getElementById('vp-btn-zoomin')!;
    this.zoomOutBtn = document.getElementById('vp-btn-zoomout')!;

    this.aboutModal = document.getElementById('about-modal')!;
    this.btnAbout = document.getElementById('btn-about')!;
    this.modalClose = document.getElementById('modal-close')!;
    this.modalAck = document.getElementById('modal-ack')!;
    this.btnFullscreen = document.getElementById('btn-fullscreen')!;

    this.setupExperiments();
    this.setupUIEvents();
    this.setupCanvasEvents();
    this.setupResizeObserver();

    // Start with Fractal Zoomer
    this.switchExperiment('fractals');

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupExperiments(): void {
    this.experiments.set('fractals', new FractalRenderer());
    this.experiments.set('fourier', new FourierRenderer());
    this.experiments.set('chaos', new ChaosRenderer());
  }

  private switchExperiment(id: string): void {
    const nextExp = this.experiments.get(id);
    if (!nextExp || nextExp === this.activeExperiment) return;

    if (this.activeExperiment) {
      this.activeExperiment.destroy();
    }

    this.activeExperiment = nextExp;

    // Reset canvas context and re-initialize
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.activeExperiment.init(this.canvas);
    this.activeExperiment.resize(rect.width, rect.height, dpr);

    // Update Nav bar visual tabs
    const tabs = [
      { id: 'fractals', btn: this.navFractalsBtn, colorClass: 'bg-cyan-400' },
      { id: 'fourier', btn: this.navFourierBtn, colorClass: 'bg-purple-400' },
      { id: 'chaos', btn: this.navChaosBtn, colorClass: 'bg-amber-400' },
    ];

    tabs.forEach((tab) => {
      const indicator = tab.btn.querySelector('.indicator') as HTMLElement;
      if (tab.id === id) {
        tab.btn.classList.add('active');
        tab.btn.classList.remove('text-slate-400');
        tab.btn.classList.add('text-slate-100');
        indicator?.classList.remove('hidden');
      } else {
        tab.btn.classList.remove('active');
        tab.btn.classList.add('text-slate-400');
        tab.btn.classList.remove('text-slate-100');
        indicator?.classList.add('hidden');
      }
    });

    // Populate Sidebar Lab Controls
    this.dynamicControlsEl.innerHTML = this.activeExperiment.getControlsHTML();
    this.activeExperiment.bindControls(this.dynamicControlsEl);

    // Populate Sidebar Math & Theory
    this.dynamicTheoryEl.innerHTML = this.activeExperiment.getTheoryHTML();
    renderMathInElement(this.dynamicTheoryEl);

    // Update Engine footer label
    if (id === 'fractals') {
      this.footerEngineEl.textContent = 'WebGL 2.0 / GLSL Shaders';
    } else {
      this.footerEngineEl.textContent = 'Canvas 2D / 60 FPS Native';
    }

    this.updatePlayPauseIcon();
  }

  private setupUIEvents(): void {
    // Experiment Navigation
    this.navFractalsBtn.addEventListener('click', () => this.switchExperiment('fractals'));
    this.navFourierBtn.addEventListener('click', () => this.switchExperiment('fourier'));
    this.navChaosBtn.addEventListener('click', () => this.switchExperiment('chaos'));

    // Sidebar Tab Switching
    this.tabControlsBtn.addEventListener('click', () => {
      this.tabControlsBtn.classList.add('active');
      this.tabLearnBtn.classList.remove('active');
      this.panelControlsEl.classList.remove('hidden');
      this.panelLearnEl.classList.add('hidden');
    });

    this.tabLearnBtn.addEventListener('click', () => {
      this.tabLearnBtn.classList.add('active');
      this.tabControlsBtn.classList.remove('active');
      this.panelLearnEl.classList.remove('hidden');
      this.panelControlsEl.classList.add('hidden');
    });

    // Global Header Engine Controls
    this.globalPlayPauseBtn.addEventListener('click', () => {
      if (this.activeExperiment) {
        this.activeExperiment.togglePlay();
        this.updatePlayPauseIcon();
      }
    });

    this.globalResetBtn.addEventListener('click', () => {
      this.activeExperiment?.reset();
      this.updatePlayPauseIcon();
    });

    // Spacebar to Pause / Resume
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
        e.preventDefault();
        if (this.activeExperiment) {
          this.activeExperiment.togglePlay();
          this.updatePlayPauseIcon();
        }
      }
    });

    // Viewport Quick Actions
    this.playPauseBtn.addEventListener('click', () => {
      if (this.activeExperiment) {
        this.activeExperiment.togglePlay();
        this.updatePlayPauseIcon();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.activeExperiment?.reset();
      this.updatePlayPauseIcon();
    });

    this.zoomInBtn.addEventListener('click', () => {
      this.activeExperiment?.zoom(1.25);
    });

    this.zoomOutBtn.addEventListener('click', () => {
      this.activeExperiment?.zoom(1 / 1.25);
    });

    // About Modal
    const showModal = () => this.aboutModal.classList.remove('hidden');
    const hideModal = () => this.aboutModal.classList.add('hidden');
    this.btnAbout.addEventListener('click', showModal);
    this.modalClose.addEventListener('click', hideModal);
    this.modalAck.addEventListener('click', hideModal);
    this.aboutModal.addEventListener('click', (e) => {
      if (e.target === this.aboutModal) hideModal();
    });

    // Fullscreen toggle
    this.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  private updatePlayPauseIcon(): void {
    if (!this.activeExperiment) return;
    const playing = this.activeExperiment.isPlaying();

    // Floating viewport icons
    if (playing) {
      this.iconPause.classList.remove('hidden');
      this.iconPlay.classList.add('hidden');
    } else {
      this.iconPause.classList.add('hidden');
      this.iconPlay.classList.remove('hidden');
    }

    // Header global status indicator
    if (playing) {
      this.globalStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      this.globalPlayPauseText.textContent = 'Stop';
      this.globalPlayPauseBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors bg-rose-600/30 text-rose-300 hover:bg-rose-600/50 border border-rose-500/30';
    } else {
      this.globalStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      this.globalPlayPauseText.textContent = 'Run';
      this.globalPlayPauseBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 border border-emerald-500/30';
    }
  }

  private setupCanvasEvents(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.activeExperiment?.onPointerDown?.(e);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      this.activeExperiment?.onPointerMove?.(e);
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.activeExperiment?.onPointerUp?.(e);
    });

    this.canvas.addEventListener('pointercancel', (e) => {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.activeExperiment?.onPointerUp?.(e);
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.activeExperiment?.onWheel?.(e);
    }, { passive: false });
  }

  private setupResizeObserver(): void {
    const container = document.getElementById('viewport-container');
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && this.activeExperiment) {
          const dpr = window.devicePixelRatio || 1;
          this.activeExperiment.resize(width, height, dpr);
        }
      }
    });

    observer.observe(container);
  }

  private loop(timestamp: number): void {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    // Calculate FPS
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.frameCount / this.fpsTimer);
      this.footerFpsEl.textContent = `FPS: ${fps}`;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (this.activeExperiment) {
      this.activeExperiment.update(dt, timestamp / 1000);
      this.activeExperiment.render();

      const hud = this.activeExperiment.getHudInfo();
      this.hudBadgeEl.textContent = hud.badge;
      this.hudCoordsEl.textContent = hud.coords;
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Bootstrap application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new MathLabApp();
});
