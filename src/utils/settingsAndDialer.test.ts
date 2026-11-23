import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_APP_SETTINGS,
  mergeSettingsPatch,
} from './settingsAndDialer.ts';

test('mergeSettingsPatch updates valid fields and ignores invalid enum values', () => {
  const updated = mergeSettingsPatch(DEFAULT_APP_SETTINGS, {
    aboutText: '  Sedang rapat arsitektur  ',
    readReceiptsEnabled: false,
  });

  assert.equal(updated.aboutText, 'Sedang rapat arsitektur');
  assert.equal(updated.readReceiptsEnabled, false);

  const safe = mergeSettingsPatch(updated, {
    backdropPreset: 'neon-pink' as unknown as 'obsidian-gold',
    backdropIntensity: 'ultra' as unknown as 'balanced',
  });
  assert.equal(safe.backdropPreset, 'obsidian-gold');
  assert.equal(safe.backdropIntensity, 'balanced');
});

test('mergeSettingsPatch accepts valid cinematic luxury backdrop presets and motion toggle', async () => {
  const { BACKDROP_PRESETS, computeBackdropLayers, getBackdropPreset } = await import(
    './backdropTheme.ts'
  );

  assert.equal(BACKDROP_PRESETS.length, 3);
  const patched = mergeSettingsPatch(DEFAULT_APP_SETTINGS, {
    backdropPreset: 'emerald-nocturne',
    backdropIntensity: 'cinematic',
    backdropMotion: false,
  });

  assert.equal(patched.backdropPreset, 'emerald-nocturne');
  assert.equal(patched.backdropIntensity, 'cinematic');
  assert.equal(patched.backdropMotion, false);

  const preset = getBackdropPreset(patched.backdropPreset);
  assert.equal(preset.id, 'emerald-nocturne');
  assert.ok(preset.imageUrl.startsWith('/src/assets/images/'));

  const fallbackPreset = getBackdropPreset('unknown-preset');
  assert.equal(fallbackPreset.id, 'obsidian-gold');

  const subtle = computeBackdropLayers('subtle');
  const balanced = computeBackdropLayers('balanced');
  const cinematic = computeBackdropLayers('cinematic');
  assert.ok(subtle.scrimOpacity > balanced.scrimOpacity);
  assert.ok(balanced.scrimOpacity > cinematic.scrimOpacity);
});

test('navbarTheme supports the 4 curated luxury colors with safe validation fallback', async () => {
  const { NAVBAR_THEMES, getNavbarThemeConfig } = await import('./navbarTheme.ts');

  assert.deepEqual(
    NAVBAR_THEMES.map((t) => t.label),
    ['Biru Dongker', 'Emas Sampanye', 'Orange Light', 'Perunggu Senja']
  );

  assert.equal(DEFAULT_APP_SETTINGS.navbarTheme, 'navy');
  const orangeNavbar = mergeSettingsPatch(DEFAULT_APP_SETTINGS, {
    navbarTheme: 'orange-light',
  });
  assert.equal(orangeNavbar.navbarTheme, 'orange-light');
  assert.equal(getNavbarThemeConfig(orangeNavbar.navbarTheme).isLight, true);

  const invalidPatch = mergeSettingsPatch(orangeNavbar, {
    navbarTheme: 'green-neon' as unknown as 'navy',
  });
  assert.equal(invalidPatch.navbarTheme, 'orange-light');
  assert.equal(getNavbarThemeConfig('unknown').id, 'navy');
});

