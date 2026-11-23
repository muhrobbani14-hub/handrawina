import { useState } from 'react';
import type { BackdropIntensity, BackdropPresetId } from '../../types/handrawina';
import { computeBackdropLayers, getBackdropPreset } from '../../utils/backdropTheme';

interface CinematicBackdropProps {
  presetId: BackdropPresetId;
  intensity: BackdropIntensity;
  motionEnabled: boolean;
}

export function CinematicBackdrop({
  presetId,
  intensity,
  motionEnabled,
}: CinematicBackdropProps) {
  const preset = getBackdropPreset(presetId);
  const layers = computeBackdropLayers(intensity);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageAvailable = failedUrl !== preset.imageUrl;

  return (
    <div
      aria-hidden="true"
      data-testid="cinematic-backdrop"
      data-preset={preset.id}
      data-intensity={intensity}
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#09090B] [contain:strict]"
      style={{ backgroundImage: preset.fallbackGradient }}
    >
      {imageAvailable && (
        <img
          key={preset.imageUrl}
          src={preset.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(preset.imageUrl)}
          className={`w-full h-full object-cover object-center transition-[opacity,filter] duration-700 ${
            motionEnabled ? 'handrawina-cinematic-drift' : ''
          }`}
          style={{
            filter: `brightness(${layers.imageBrightness}) saturate(${layers.imageSaturation}) contrast(1.04)`,
          }}
        />
      )}

      {/* Measured dark editorial contrast scrim */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          backgroundColor: '#09090B',
          opacity: layers.scrimOpacity,
        }}
      />

      {/* Cinematic 35mm radial vignette for peripheral framing & center readability */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 84% 78% at 50% 45%, transparent 12%, ${preset.vignetteTint} 78%, rgba(6, 6, 8, 0.88) 100%)`,
        }}
      />

      {/* Subtle warm champagne architectural sheen along top horizon */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: preset.ambientSheen,
        }}
      />

      {/* Fine bottom grounding fade for desktop/mobile navigation bars */}
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background: 'linear-gradient(to top, rgba(8, 8, 10, 0.78) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
