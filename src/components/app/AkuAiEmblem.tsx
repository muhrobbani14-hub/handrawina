interface AkuAiEmblemProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AkuAiEmblemProps['size']>, string> = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-7 h-7',
  lg: 'w-10 h-10',
};

export const AKU_AI_LOGO_SRC = '/assets/aistudio/sunflower-7464119_1280_af08ffd1.png';

export function AkuAiEmblem({ size = 'md', className = '' }: AkuAiEmblemProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 ring-1 ring-amber-300/45 bg-[#1B1F23] shadow-[0_0_12px_rgba(251,191,36,0.22)] ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={AKU_AI_LOGO_SRC}
        alt="Logo Aku AI"
        className="w-full h-full object-cover scale-105"
        loading="eager"
      />
    </span>
  );
}
