/**
 * Web Audio API Mathematical Sound Synthesizer & Sonification Engine
 */
class MathLabAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  private masterGain: GainNode | null = null;

  // Additive harmonic oscillators for Fourier
  private harmonicOscs: OscillatorNode[] = [];
  private harmonicGains: GainNode[] = [];

  // Continuous FM / pitch drone for Chaos & Attractors
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.initContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.25, now + 0.08);
    }
    return !this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Updates Fourier harmonic synthesis frequencies and amplitudes
   */
  public updateFourierHarmonics(components: { freq: number; amp: number }[], baseHz: number = 220): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const maxActive = Math.min(components.length, 6);

    // Ensure we have enough oscillators
    while (this.harmonicOscs.length < maxActive) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.harmonicOscs.push(osc);
      this.harmonicGains.push(gain);
    }

    const totalAmp = components.slice(0, maxActive).reduce((sum, c) => sum + c.amp, 0) || 1;

    for (let i = 0; i < this.harmonicOscs.length; i++) {
      if (i < maxActive) {
        const c = components[i];
        const pitch = Math.max(80, Math.min(1800, baseHz * (1 + Math.abs(c.freq) * 0.5)));
        const targetVol = Math.min(0.2, (c.amp / totalAmp) * 0.35);

        this.harmonicOscs[i].frequency.setTargetAtTime(pitch, now, 0.04);
        this.harmonicGains[i].gain.setTargetAtTime(targetVol, now, 0.05);
      } else {
        this.harmonicGains[i].gain.setTargetAtTime(0, now, 0.05);
      }
    }
  }

  /**
   * Sonifies kinetic energy / velocity as continuous dynamic pitch
   */
  public updateSonificationPitch(normalizedValue: number, minHz = 120, maxHz = 880): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    if (!this.droneOsc) {
      this.droneOsc = this.ctx.createOscillator();
      this.droneGain = this.ctx.createGain();
      this.droneOsc.type = 'triangle';
      this.droneOsc.frequency.setValueAtTime(minHz, now);
      this.droneGain.gain.setValueAtTime(0.08, now);
      this.droneOsc.connect(this.droneGain);
      this.droneGain.connect(this.masterGain);
      this.droneOsc.start();
    }

    const hz = minHz + Math.max(0, Math.min(1, normalizedValue)) * (maxHz - minHz);
    this.droneOsc.frequency.setTargetAtTime(hz, now, 0.05);
  }

  public silence(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const g of this.harmonicGains) {
      g.gain.setTargetAtTime(0, now, 0.05);
    }
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }
}

export const mathAudio = new MathLabAudioEngine();
