import type { AppSettings } from '../types/handrawina';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aboutText: 'Tersedia · Enkripsi Signal Protocol E2EE Aktif',
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
  backdropPreset: 'obsidian-gold',
  backdropIntensity: 'balanced',
  backdropMotion: true,
  navbarTheme: 'navy',
};

const VALID_BACKDROP_PRESETS = new Set<AppSettings['backdropPreset']>([
  'obsidian-gold',
  'emerald-nocturne',
  'penthouse-dusk',
]);
const VALID_BACKDROP_INTENSITIES = new Set<AppSettings['backdropIntensity']>([
  'subtle',
  'balanced',
  'cinematic',
]);
const VALID_NAVBAR_THEMES = new Set<AppSettings['navbarTheme']>([
  'navy',
  'champagne',
  'orange-light',
  'bronze',
]);

/**
 * Pure validator & merger for Handrawina application settings patches.
 */
export function mergeSettingsPatch(
  current: AppSettings,
  patch: Partial<AppSettings>
): AppSettings {
  const next: AppSettings = { ...current };

  if (typeof patch.aboutText === 'string') {
    const cleanAbout = patch.aboutText.trim().slice(0, 140);
    next.aboutText = cleanAbout || DEFAULT_APP_SETTINGS.aboutText;
  }
  if (typeof patch.readReceiptsEnabled === 'boolean') {
    next.readReceiptsEnabled = patch.readReceiptsEnabled;
  }
  if (typeof patch.typingIndicatorsEnabled === 'boolean') {
    next.typingIndicatorsEnabled = patch.typingIndicatorsEnabled;
  }
  if (patch.backdropPreset && VALID_BACKDROP_PRESETS.has(patch.backdropPreset)) {
    next.backdropPreset = patch.backdropPreset;
  }
  if (patch.backdropIntensity && VALID_BACKDROP_INTENSITIES.has(patch.backdropIntensity)) {
    next.backdropIntensity = patch.backdropIntensity;
  }
  if (typeof patch.backdropMotion === 'boolean') {
    next.backdropMotion = patch.backdropMotion;
  }
  if (patch.navbarTheme && VALID_NAVBAR_THEMES.has(patch.navbarTheme)) {
    next.navbarTheme = patch.navbarTheme;
  }

  return next;
}
