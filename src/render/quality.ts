export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Cap on the device pixel ratio. */
  pixelRatio: number;
  /** Bloom buffer size relative to the screen. */
  bloom: number;
  /** Multiplier on particle and debris counts. */
  particles: number;
  /** Water reflection resolution relative to the screen; 0 turns it off. */
  reflection: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 1, bloom: 0.5, particles: 0.4, reflection: 0 },
  medium: { pixelRatio: 1.5, bloom: 0.75, particles: 0.7, reflection: 0.25 },
  high: { pixelRatio: 2, bloom: 1, particles: 1, reflection: 0.5 },
};

const LEVELS = Object.keys(QUALITY) as QualityLevel[];
const QUALITY_KEY = 'river.quality';
const SCANLINES_KEY = 'river.scanlines';

/** Graphics options, saved to localStorage. */
export class GraphicsSettings {
  quality: QualityLevel = LEVELS.includes(localStorage.getItem(QUALITY_KEY) as QualityLevel)
    ? (localStorage.getItem(QUALITY_KEY) as QualityLevel)
    : 'high';
  scanlines = localStorage.getItem(SCANLINES_KEY) === '1';

  get preset(): QualityPreset {
    return QUALITY[this.quality];
  }

  cycleQuality(): QualityLevel {
    this.quality = LEVELS[(LEVELS.indexOf(this.quality) + 1) % LEVELS.length];
    localStorage.setItem(QUALITY_KEY, this.quality);
    return this.quality;
  }

  toggleScanlines(): boolean {
    this.scanlines = !this.scanlines;
    localStorage.setItem(SCANLINES_KEY, this.scanlines ? '1' : '0');
    return this.scanlines;
  }
}
