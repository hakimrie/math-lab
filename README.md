# MathLab — Visual Math, Chaos & Fractals

> A visual mathematical playground that transforms abstract mathematical concepts into beautiful, interactive simulations.
>
> 🌐 **Live Hub**: [https://experiment.bukuanak.id/](https://experiment.bukuanak.id/)

![MathLab](public/favicon.svg)

MathLab is built as a blend of a **digital mathematics laboratory, interactive textbook, and creative sandbox** designed for students, educators, and curious mathematical minds. Part of the [BukuAnak Experiments](https://experiment.bukuanak.id/) collection.

---

## 🔬 Core Explorations

### 1. 3D Strange Attractors & Differential Geometry (Chaos in $\mathbb{R}^3$)
Explore non-linear vector fields and fractal attractors in three dimensions with real-time 3D orbital camera controls.
* **Attractor Systems**:
  * **Lorenz Attractor**: $\dot{x} = \sigma(y - x), \dot{y} = x(\rho - z) - y, \dot{z} = xy - \beta z$ (The quintessential butterfly of chaos)
  * **Aizawa Attractor**: Toroidal sphere with an internal vortex and geyser jet along the vertical axis
  * **Halvorsen Attractor**: 3-fold cyclic $\mathbb{Z}_3$ symmetry with three sweeping spiral lobes
  * **Thomas Cyclically Symmetric**: Labyrinthine trigonometric chaos governed by coupled sine functions
  * **Rössler Attractor**: Single-band Möbius-strip folding and stretching
  * **Dadras Attractor**: 5-parameter autonomous dual-helix chaotic system
* **Rendering & Interactivity**:
  * 3D perspective projection with real-time mouse/touch orbital camera (azimuth, elevation, zoom)
  * Multi-geometry modes: Particle Swarm (up to 6,000 live particles), Continuous Streamline Ribbon, and Twin Cloud (Lyapunov 3D divergence test)
  * 5 spectral color schemes (Electric Cyan, Sunset Solar, Cyberpunk Neon, Emerald Abyss, Cosmic Violet)
  * 3D orientation axis gizmo and auto-rotation orbit mode

### 2. Fractal Zoomer (GPU-Accelerated GLSL)
Explore infinite mathematical complexity rendered in real time on the GPU using WebGL 2.0 and GLSL fragment shaders.
* **Fractals**:
  * **Mandelbrot Set**: $z_{n+1} = z_n^2 + c$, $z_0 = 0$
  * **Julia Set**: $z_{n+1} = z_n^2 + c$ with real-time interactive 2D parameter pad for $\text{Re}(c)$ and $\text{Im}(c)$
  * **Burning Ship**: $z_{n+1} = (|\text{Re}(z_n)| + i|\text{Im}(z_n)|)^2 + c$
  * **Tricorn / Mandelbar**: $z_{n+1} = \bar{z}_n^2 + c$
* **Features**:
  * Smooth pan and zoom centered on cursor
  * Continuous smooth coloring using fractional iteration normalization $\nu = n + 1 - \frac{\ln(\ln|z|)}{\ln 2}$
  * 6 GPU color palettes (Electric Cosmic, Sunset Magma, Cyberpunk Neon, Emerald Abyss, Psychedelic Rainbow, Monochrome Platinum)
  * Real-time palette cycling animation
  * Presets: Seahorse Valley, Elephant Valley, Triple Spiral, Douady's Rabbit, San Marco Dragon, Dendrite Tree, Siegel Disk

### 3. Fourier Epicycles Drawing (Harmonic Analysis & Sound)
Draw any shape with your mouse or touchscreen and watch Discrete Fourier Transform (DFT) mathematics decompose it into rotating complex vectors that retrace your drawing circle by circle.
* **Algorithm**:
  * Uniform arc-length resampling of drawn 2D trajectories
  * Complex number mapping $z_k = x_k + i y_k$
  * Discrete Fourier Transform computation:
    $$c_n = \frac{1}{N} \sum_{k=0}^{N-1} z_k \cdot e^{-i \frac{2\pi n k}{N}}$$
  * Harmonic amplitude sorting (highest-energy epicycles rendered first)
* **Features**:
  * Freehand drawing canvas + preset vector shapes (5-Pointed Star, Cardioid Heart, Greek $\pi$, Trefoil Knot, Musical Note, Lemniscate)
  * Dynamic harmonic truncation slider (1 to $N$ components) with live Root Mean Square Error (RMSE) readout
  * **Web Audio Sonification**: Synthesizes harmonic overtone frequencies in real time matching the active epicycle frequencies

### 4. Chaos & Double Pendulum (Lagrangian Dynamics & Silk Ribbon)
Experiment with non-linear dynamics, deterministic chaos, and sensitivity to initial conditions.
* **Physics & Mathematics**:
  * Physically accurate Lagrangian equations of motion
  * 4th-Order Runge-Kutta (RK4) numerical integration with 16 sub-steps for extreme energy conservation
  * Mechanical energy tracking $E = T + V$ with real-time conservation drift monitoring ($\Delta E$)
* **Modes**:
  * **Twin Butterfly Effect**: Twin pendulums starting with an infinitesimal difference (e.g. $\Delta\theta_0 = 0.001^\circ$) with real-time Divergence HUD graph
  * **Multi-Pendulum Silk Ribbon (Ensemble)**: Simultaneous simulation of up to 80 pendulums released with micro-perturbations ($10^{-5}$ rad), forming an undulating rainbow silk ribbon that twists, shears, and splinters into chaos
  * **Phase Space Portrait HUD**: Live plotting of $(\theta_1, \omega_1)$ showing limit cycles and chaotic attractor orbits

---

## 🛠️ Technology Stack

* **Language**: TypeScript (strict mode)
* **Bundler & Tooling**: Vite
* **Rendering**:
  * **WebGL 2.0 + GLSL**: GPU-accelerated fractal computation
  * **HTML5 Canvas 2D + 3D Vector Math**: High-performance vector paths, epicycles, 3D projection, and physical simulation
* **Audio**: Web Audio API for harmonic overtone and frequency synthesis
* **Typography & Formulas**: KaTeX for LaTeX mathematical typesetting (100% offline bundled)
* **Export**: High-Resolution 4K canvas snapshot export with mathematical watermark badge
* **Zero Backend**: Runs 100% locally in the browser with zero latency

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause active simulation |
| `R` | Reset current experiment |
| `S` | Export high-resolution snapshot (.png) |
| `M` | Toggle mathematical audio sonification |
| `1` – `4` | Switch experiments (1: Fractals, 2: Fourier, 3: Chaos, 4: Attractors) |
| `F` | Toggle Fullscreen |

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* npm (v9+)

### Installation
```bash
git clone <repo-url> math-lab
cd math-lab
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm run preview
```
The compiled static website will be located in `dist/`.
