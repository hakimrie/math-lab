export interface Experiment {
  id: string;
  name: string;
  badge: string;
  category?: string;
  accentColor?: string;

  init(canvas: HTMLCanvasElement): void;
  resize(width: number, height: number, dpr: number): void;
  update(dt: number, time: number): void;
  render(): void;
  destroy(): void;

  play(): void;
  pause(): void;
  isPlaying(): boolean;
  togglePlay(): boolean;
  reset(): void;
  zoom(factor: number): void;

  getControlsHTML(): string;
  bindControls(container: HTMLElement): void;

  getTheoryHTML(): string;
  getHudInfo(): { badge: string; coords: string };

  // Optional mouse/pointer event hooks
  onPointerDown?(e: PointerEvent): void;
  onPointerMove?(e: PointerEvent): void;
  onPointerUp?(e: PointerEvent): void;
  onWheel?(e: WheelEvent): void;

  // State serialization for URL deep linking & sharing
  serializeState?(): Record<string, string | number | boolean>;
  deserializeState?(state: Record<string, string>): void;
}
