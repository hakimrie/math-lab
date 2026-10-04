# MathLab — Visual Math, Chaos & Fractals

> A visual mathematical playground that transforms abstract mathematical concepts into beautiful, interactive simulations.

![MathLab](public/favicon.svg)

MathLab is built as a blend of a **digital mathematics laboratory, interactive textbook, and creative sandbox** designed for high-school and university students, educators, and curious learners.

---

## 🔬 Core Experiences

### 1. Fractal Zoomer (GPU-Accelerated GLSL)
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

### 2. Fourier Epicycles Drawing (Harmonic Analysis)
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
  * Animation speed, direction reversal, and visual toggles for epicycles, vectors, target path, and reconstructed curve

### 3. Chaos & Double Pendulum (Lagrangian Dynamics)
Experiment with non-linear dynamics, deterministic chaos, and sensitivity to initial conditions.
* **Physics & Mathematics**:
  * Physically accurate Lagrangian equations of motion
  * 4th-Order Runge-Kutta (RK4) numerical integration with sub-stepping for extreme energy conservation
  * Mechanical energy tracking $E = T + V$
* **Sensitivity Experiment (The Butterfly Effect)**:
  * Simultaneous simulation of twin pendulums (A: Cyan, B: Rose) starting with an infinitesimal difference (e.g. $\Delta\theta_0 = 0.001^\circ$)
  * Real-time Divergence HUD graph plotting $\|r_B(t) - r_A(t)\|$ over time, demonstrating the exponential Lyapunov divergence phase followed by chaotic saturation
  * Interactive dragging of pendulum bobs directly in the canvas
  * Adjustable parameters: arm lengths $L_1, L_2$, bob masses $m_1, m_2$, gravity $g$, viscous friction damping $b$

---

## 🛠️ Technology Stack

* **Language**: TypeScript (strict mode)
* **Bundler & Tooling**: Vite
* **Rendering**:
  * **WebGL 2.0 + GLSL**: GPU-accelerated fractal computation
  * **HTML5 Canvas 2D**: High-performance 60 FPS vector paths, epicycles, and physical simulation
* **Typography & Formulas**: KaTeX for LaTeX mathematical typesetting
* **Zero Backend**: Runs 100% locally in the browser with zero latency

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
