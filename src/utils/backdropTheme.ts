import type { BackdropIntensity, BackdropPresetId } from '../types/handrawina';

export interface BackdropPresetConfig {
  id: BackdropPresetId;
  name: string;
  subtitle: string;
  imageUrl: string;
  fallbackGradient: string;
  vignetteTint: string;
  ambientSheen: string;
}

export const BACKDROP_PRESETS: BackdropPresetConfig[] = [
  {
    id: 'obsidian-gold',
    name: 'Obsidian & Emas',
    subtitle: 'Marmer Nero Marquina dengan berkas cahaya keemasan arsitektural.',
    imageUrl: '/src/assets/images/handrawina_luxury_obsidian_gold_1795247234432.jpg',
    fallbackGradient:
      'radial-gradient(ellipse at 78% 12%, rgba(212, 168, 83, 0.28) 0%, rgba(24, 19, 14, 0.94) 48%, #09090B 100%)',
    vignetteTint: 'rgba(9, 8, 7, 0.62)',
    ambientSheen:
      'radial-gradient(ellipse 70% 45% at 80% 0%, rgba(245, 208, 128, 0.16) 0%, transparent 70%)',
  },
  {
    id: 'emerald-nocturne',
    name: 'Zamrud Nokturnal',
    subtitle: 'Lengkungan batu zamrud gelap, beludru malam, dan kilau kuningan hangat.',
    imageUrl: '/src/assets/images/handrawina_luxury_emerald_nocturne_1795247236979.jpg',
    fallbackGradient:
      'radial-gradient(ellipse at 50% 18%, rgba(20, 83, 65, 0.34) 0%, rgba(11, 20, 18, 0.94) 55%, #070A09 100%)',
    vignetteTint: 'rgba(6, 12, 10, 0.58)',
    ambientSheen:
      'radial-gradient(ellipse 65% 45% at 50% 0%, rgba(217, 173, 102, 0.14) 0%, transparent 72%)',
  },
  {
    id: 'penthouse-dusk',
    name: 'Penthouse Senja',
    subtitle: 'Teras kaca gelap menghadap cakrawala laut senja dengan aksen perunggu.',
    imageUrl: '/src/assets/images/handrawina_luxury_penthouse_dusk_1795247237803.jpg',
    fallbackGradient:
      'radial-gradient(ellipse at 65% 22%, rgba(180, 142, 102, 0.24) 0%, rgba(16, 20, 30, 0.94) 52%, #090B10 100%)',
    vignetteTint: 'rgba(9, 11, 16, 0.56)',
    ambientSheen:
      'radial-gradient(ellipse 75% 40% at 60% 0%, rgba(236, 194, 138, 0.14) 0%, transparent 70%)',
  },
];

export interface BackdropLayerMetrics {
  scrimOpacity: number;
  imageBrightness: number;
  imageSaturation: number;
  shellSurfaceAlpha: number;
}

export function getBackdropPreset(id: BackdropPresetId | string | undefined): BackdropPresetConfig {
  return BACKDROP_PRESETS.find((preset) => preset.id === id) ?? BACKDROP_PRESETS[0];
}

export function computeBackdropLayers(intensity: BackdropIntensity): BackdropLayerMetrics {
  switch (intensity) {
    case 'subtle':
      return {
        scrimOpacity: 0.72,
        imageBrightness: 0.78,
        imageSaturation: 0.95,
        shellSurfaceAlpha: 0.76,
      };
    case 'cinematic':
      return {
        scrimOpacity: 0.34,
        imageBrightness: 0.96,
        imageSaturation: 1.08,
        shellSurfaceAlpha: 0.52,
      };
    case 'balanced':
    default:
      return {
        scrimOpacity: 0.5,
        imageBrightness: 0.88,
        imageSaturation: 1.02,
        shellSurfaceAlpha: 0.64,
      };
  }
}
