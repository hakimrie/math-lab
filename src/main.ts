import './style.css';
import { Experiment } from './experiments/experiment';
import { FractalRenderer } from './experiments/fractals/fractal-renderer';
import { FourierRenderer } from './experiments/fourier/fourier-renderer';
import { ChaosRenderer } from './experiments/chaos/chaos-renderer';
import { AttractorRenderer } from './experiments/attractors/attractor-renderer';
import { renderMathInElement } from './utils/katex-render';
import { mathAudio } from './utils/audio-synthesizer';
import { exportCanvasSnapshot } from './utils/exporter';

class MathLabApp {
  private canvas: HTMLCanvasElement;
  private experiments: Map<string, Experiment> = new Map();
  private activeExperiment: Experiment | null = null;

  // UI Element References
  private experimentsNavEl: HTMLElement;
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

  // Audio & Snapshot Tools
  private btnAudioToggle: HTMLElement;
  private iconAudioOff: HTMLElement;
  private iconAudioOn: HTMLElement;
  private btnSnapshot: HTMLElement;
  private vpBtnSnapshot: HTMLElement;
  private btnShareLink: HTMLElement | null;
  private vpBtnShare: HTMLElement | null;

  // Floating Viewport Actions
  private playPauseBtn: HTMLElement;
  private iconPause: HTMLElement;
  private iconPlay: HTMLElement;
  private resetBtn: HTMLElement;
  private zoomInBtn: HTMLElement;
  private zoomOutBtn: HTMLElement;

  // Toast Notifications
  private toastEl: HTMLElement | null;
  private toastIconEl: HTMLElement | null;
  private toastMessageEl: HTMLElement | null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.experimentsNavEl = document.getElementById('experiments-nav')!;
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

    this.btnAudioToggle = document.getElementById('btn-audio-toggle')!;
    this.iconAudioOff = document.getElementById('icon-audio-off')!;
    this.iconAudioOn = document.getElementById('icon-audio-on')!;
    this.btnSnapshot = document.getElementById('btn-snapshot')!;
    this.vpBtnSnapshot = document.getElementById('vp-btn-snapshot')!;
    this.btnShareLink = document.getElementById('btn-share-link');
    this.vpBtnShare = document.getElementById('vp-btn-share');

    this.toastEl = document.getElementById('toast-notification');
    this.toastIconEl = document.getElementById('toast-icon');
    this.toastMessageEl = document.getElementById('toast-message');

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
    this.renderExperimentTabs();
    this.setupUIEvents();
    this.setupCanvasEvents();
    this.setupResizeObserver();

    // Check URL Hash for initial experiment & parameters
    const { id, params } = this.parseURLHash();
    const initialId = this.experiments.has(id) ? id : 'fractals';
    this.switchExperiment(initialId, params);

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupExperiments(): void {
    this.experiments.set('fractals', new FractalRenderer());
    this.experiments.set('fourier', new FourierRenderer());
    this.experiments.set('chaos', new ChaosRenderer());
    this.experiments.set('attractors', new AttractorRenderer());
  }

  /**
   * Dynamically renders tabs from registered experiments.
   * Enables adding new experiments seamlessly in 1 line without touching index.html!
   */
  private renderExperimentTabs(): void {
    if (!this.experimentsNavEl) return;
    this.experimentsNavEl.innerHTML = '';

    const exps = Array.from(this.experiments.values());
    exps.forEach((exp) => {
      const btn = document.createElement('button');
      btn.dataset.expId = exp.id;
      btn.className = `nav-tab px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center space-x-1.5 shrink-0 text-slate-400 hover:text-slate-200`;

      const dot = document.createElement('span');
      dot.className = 'w-2 h-2 rounded-full indicator hidden transition-all';
      dot.style.backgroundColor = exp.accentColor || '#38bdf8';
      dot.style.boxShadow = `0 0 8px ${exp.accentColor || '#38bdf8'}`;

      const title = document.createElement('span');
      title.textContent = exp.name;

      btn.appendChild(dot);
      btn.appendChild(title);

      btn.addEventListener('click', () => {
        this.switchExperiment(exp.id);
      });

      this.experimentsNavEl.appendChild(btn);
    });
  }

  private updateNavVisuals(activeId: string): void {
    if (!this.experimentsNavEl) return;
    const buttons = this.experimentsNavEl.querySelectorAll<HTMLButtonElement>('.nav-tab');

    buttons.forEach((btn) => {
      const id = btn.dataset.expId;
      const indicator = btn.querySelector('.indicator') as HTMLElement | null;

      if (id === activeId) {
        btn.classList.add('active', 'text-slate-100');
        btn.classList.remove('text-slate-400');
        indicator?.classList.remove('hidden');
      } else {
        btn.classList.remove('active', 'text-slate-100');
        btn.classList.add('text-slate-400');
        indicator?.classList.add('hidden');
      }
    });
  }

  private parseURLHash(): { id: string; params: Record<string, string> } {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return { id: '', params: {} };

    const qIndex = raw.indexOf('?');
    if (qIndex === -1) {
      return { id: raw, params: {} };
    }

    const id = raw.slice(0, qIndex);
    const queryString = raw.slice(qIndex + 1);
    const searchParams = new URLSearchParams(queryString);
    const params: Record<string, string> = {};

    searchParams.forEach((val, key) => {
      params[key] = val;
    });

    return { id, params };
  }

  private switchExperiment(id: string, initialParams?: Record<string, string>): void {
    const nextExp = this.experiments.get(id);
    if (!nextExp || (nextExp === this.activeExperiment && !initialParams)) return;

    if (this.activeExperiment) {
      this.activeExperiment.destroy();
    }

    this.activeExperiment = nextExp;

    // Reset canvas element to guarantee clean WebGL2 and 2D contexts without lock
    const canvas = this.resetCanvas();
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    this.activeExperiment.init(canvas);
    this.activeExperiment.resize(rect.width, rect.height, dpr);

    // Apply URL parameters if present
    if (initialParams && Object.keys(initialParams).length > 0) {
      this.activeExperiment.deserializeState?.(initialParams);
    }

    this.updatePlayPauseIcon();
    this.updateNavVisuals(id);

    // Update URL hash without polluting browser history
    if (!initialParams || Object.keys(initialParams).length === 0) {
      window.location.hash = id;
    }

    // Populate Sidebar Lab Controls
    this.dynamicControlsEl.innerHTML = this.activeExperiment.getControlsHTML();
    this.activeExperiment.bindControls(this.dynamicControlsEl);

    // Populate Sidebar Math & Theory
    this.dynamicTheoryEl.innerHTML = this.activeExperiment.getTheoryHTML();
    renderMathInElement(this.dynamicTheoryEl);

    // Update Engine footer label
    if (id === 'fractals') {
      this.footerEngineEl.textContent = 'WebGL 2.0 / GLSL Shaders';
    } else if (id === 'attractors') {
      this.footerEngineEl.textContent = 'Canvas 2D / 3D Vector RK4 Engine';
    } else {
      this.footerEngineEl.textContent = 'Canvas 2D / 60 FPS Native';
    }

    this.updatePlayPauseIcon();
  }

  /**
   * Generates a sharable deep-link encoding the exact current simulation state.
   */
  private copyShareLink(): void {
    if (!this.activeExperiment) return;

    let hash = `#${this.activeExperiment.id}`;
    if (this.activeExperiment.serializeState) {
      const state = this.activeExperiment.serializeState();
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(state)) {
        params.set(key, String(val));
      }
      const qs = params.toString();
      if (qs) {
        hash += `?${qs}`;
      }
    }

    // Update address bar silently
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);

    // Copy to clipboard
    const fullUrl = window.location.href;
    navigator.clipboard
      .writeText(fullUrl)
      .then(() => {
        this.showToast('Direct state link copied to clipboard!', '🔗');
      })
      .catch(() => {
        this.showToast('Link generated in address bar!', '🔗');
      });
  }

  private showToast(message: string, icon = '🔗', duration = 3000): void {
    if (!this.toastEl || !this.toastMessageEl) return;

    if (this.toastIconEl) this.toastIconEl.textContent = icon;
    this.toastMessageEl.textContent = message;

    // Show toast
    this.toastEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
    this.toastEl.classList.add('opacity-100', 'translate-y-0');

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      if (this.toastEl) {
        this.toastEl.classList.remove('opacity-100', 'translate-y-0');
        this.toastEl.classList.add('opacity-0', 'pointer-events-none', 'translate-y-3');
      }
    }, duration);
  }

  private handleSnapshot(): void {
    if (!this.activeExperiment || !this.canvas) return;
    const hud = this.activeExperiment.getHudInfo();
    const filename = exportCanvasSnapshot(
      this.canvas,
      this.activeExperiment.name,
      hud.badge,
      { category: this.activeExperiment.category }
    );
    if (filename) {
      this.showToast(`Snapshot saved: ${filename}`, '📸');
    }
  }

  private toggleAudio(): void {
    const unmuted = mathAudio.toggleMute();
    if (unmuted) {
      this.iconAudioOff.classList.add('hidden');
      this.iconAudioOn.classList.remove('hidden');
      this.showToast('Mathematical Audio Synthesizer Enabled', '🔊', 2000);
    } else {
      this.iconAudioOff.classList.remove('hidden');
      this.iconAudioOn.classList.add('hidden');
      this.showToast('Audio Muted', '🔇', 2000);
    }
  }

  private setupUIEvents(): void {
    // Hash change listener for browser Back/Forward navigation
    window.addEventListener('hashchange', () => {
      const { id, params } = this.parseURLHash();
      if (this.experiments.has(id) && (id !== this.activeExperiment?.id || Object.keys(params).length > 0)) {
        this.switchExperiment(id, params);
      }
    });

    // Audio sonification toggle
    this.btnAudioToggle?.addEventListener('click', () => this.toggleAudio());

    // Snapshot Exporters
    this.btnSnapshot?.addEventListener('click', () => this.handleSnapshot());
    this.vpBtnSnapshot?.addEventListener('click', () => this.handleSnapshot());

    // Share State Link Buttons
    this.btnShareLink?.addEventListener('click', () => this.copyShareLink());
    this.vpBtnShare?.addEventListener('click', () => this.copyShareLink());

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

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.activeExperiment) {
          this.activeExperiment.togglePlay();
          this.updatePlayPauseIcon();
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.activeExperiment?.reset();
        this.updatePlayPauseIcon();
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        this.handleSnapshot();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        this.copyShareLink();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        this.toggleAudio();
      } else if (e.code === 'KeyF') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''), 10);
        const expKeys = Array.from(this.experiments.keys());
        if (digit >= 1 && digit <= expKeys.length) {
          this.switchExperiment(expKeys[digit - 1]);
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
      this.globalPlayPauseBtn.className =
        'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors bg-rose-600/30 text-rose-300 hover:bg-rose-600/50 border border-rose-500/30';
    } else {
      this.globalStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      this.globalPlayPauseText.textContent = 'Run';
      this.globalPlayPauseBtn.className =
        'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 border border-emerald-500/30';
    }
  }

  private resetCanvas(): HTMLCanvasElement {
    const oldCanvas = this.canvas;
    const newCanvas = oldCanvas.cloneNode(false) as HTMLCanvasElement;
    oldCanvas.parentNode?.replaceChild(newCanvas, oldCanvas);
    this.canvas = newCanvas;
    this.setupCanvasEvents();
    return newCanvas;
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

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        this.activeExperiment?.onWheel?.(e);
      },
      { passive: false }
    );
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
