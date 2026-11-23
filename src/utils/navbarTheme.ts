import type { StatusTheme } from '../types/handrawina';

export interface NavbarThemeConfig {
  id: StatusTheme;
  label: string;
  subtitle: string;
  swatchClass: string;
  isLight: boolean;
  headerClass: string;
  bottomNavClass: string;
  brandClass: string;
  navActiveClass: string;
  navInactiveClass: string;
  unreadBadgeClass: string;
  statusDotClass: string;
  mobileDotBorderClass: string;
  mobileActiveCapsuleClass: string;
  mobileInactiveIconClass: string;
  mobileActiveLabelClass: string;
  mobileInactiveLabelClass: string;
  akuAiActiveClass: string;
  akuAiIdleClass: string;
  iconBtnClass: string;
  settingsActiveClass: string;
  settingsIdleClass: string;
  primaryCtaClass: string;
  mobileHeaderBtnClass: string;
  overflowMenuClass: string;
  overflowMenuItemHoverClass: string;
  overflowCallIconClass: string;
}

export const NAVBAR_THEMES: NavbarThemeConfig[] = [
  {
    id: 'navy',
    label: 'Biru Dongker',
    subtitle: 'Biru laut gelap dengan aksen Emas Sampanye & Orange Light.',
    swatchClass: 'bg-gradient-to-br from-[#0B1D3A] via-[#102A54] to-[#071329]',
    isLight: false,
    headerClass:
      'bg-gradient-to-r from-[#071329]/94 via-[#0B1D3A]/92 to-[#102A54]/92 border-b border-[#FDBA74]/22',
    bottomNavClass:
      'bg-gradient-to-r from-[#071329]/96 via-[#0B1D3A]/95 to-[#102A54]/96 border-t border-[#FDBA74]/22',
    brandClass: 'text-stone-50 hover:text-[#FDBA74]',
    navActiveClass: 'text-stone-50 border-[#FDBA74]',
    navInactiveClass: 'text-slate-300 border-transparent hover:text-stone-50 hover:border-amber-200/40',
    unreadBadgeClass:
      'bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] text-[#071329]',
    statusDotClass: 'bg-[#FB923C]',
    mobileDotBorderClass: 'border-[#071329]',
    mobileActiveCapsuleClass: 'bg-[#3B2318]/90 text-[#FDBA74] border border-[#FDBA74]/35',
    mobileInactiveIconClass: 'text-slate-200 hover:text-white',
    mobileActiveLabelClass: 'text-[#FFEDD5] font-semibold',
    mobileInactiveLabelClass: 'text-slate-300 font-medium',
    akuAiActiveClass: 'bg-[#3A2B14]/90 text-amber-200 border-[#FDBA74]/55',
    akuAiIdleClass: 'bg-[#102A54]/85 text-stone-100 border-amber-300/30 hover:bg-[#173668] hover:border-[#FDBA74]/55',
    iconBtnClass: 'text-stone-100 bg-[#102A54]/85 hover:bg-[#173668] border border-amber-200/20',
    settingsActiveClass: 'bg-[#3B2318]/90 text-[#FDBA74] border-[#FDBA74]/45',
    settingsIdleClass: 'bg-[#102A54]/85 text-stone-100 border-amber-200/20 hover:bg-[#173668]',
    primaryCtaClass:
      'text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105',
    mobileHeaderBtnClass: 'text-stone-50 hover:bg-white/10',
    overflowMenuClass: 'bg-[#0B1D3A]/98 border-[#FDBA74]/25 text-stone-100',
    overflowMenuItemHoverClass: 'hover:bg-[#102A54]',
    overflowCallIconClass: 'text-[#FDBA74]',
  },
  {
    id: 'champagne',
    label: 'Emas Sampanye',
    subtitle: 'Nuansa emas hangat gelap dengan tombol Orange Light.',
    swatchClass: 'bg-gradient-to-br from-[#3A2B14] via-[#281E0F] to-[#161109]',
    isLight: false,
    headerClass:
      'bg-gradient-to-r from-[#161109]/95 via-[#281E0F]/92 to-[#3A2B14]/92 border-b border-amber-300/25',
    bottomNavClass:
      'bg-gradient-to-r from-[#161109]/96 via-[#281E0F]/95 to-[#3A2B14]/95 border-t border-amber-300/25',
    brandClass: 'text-amber-50 hover:text-[#FDBA74]',
    navActiveClass: 'text-amber-50 border-amber-300',
    navInactiveClass: 'text-amber-100/75 border-transparent hover:text-amber-50 hover:border-amber-200/40',
    unreadBadgeClass:
      'bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] text-[#161109]',
    statusDotClass: 'bg-[#FDBA74]',
    mobileDotBorderClass: 'border-[#161109]',
    mobileActiveCapsuleClass: 'bg-[#0B1D3A]/90 text-[#FDBA74] border border-amber-300/40',
    mobileInactiveIconClass: 'text-amber-100/85 hover:text-white',
    mobileActiveLabelClass: 'text-amber-100 font-semibold',
    mobileInactiveLabelClass: 'text-amber-100/70 font-medium',
    akuAiActiveClass: 'bg-[#0B1D3A]/90 text-amber-200 border-amber-300/55',
    akuAiIdleClass: 'bg-[#3A2B14]/85 text-amber-50 border-amber-300/30 hover:bg-[#4B381B]',
    iconBtnClass: 'text-amber-50 bg-[#3A2B14]/85 hover:bg-[#4B381B] border border-amber-300/20',
    settingsActiveClass: 'bg-[#0B1D3A]/90 text-[#FDBA74] border-[#FDBA74]/45',
    settingsIdleClass: 'bg-[#3A2B14]/85 text-amber-50 border-amber-300/20 hover:bg-[#4B381B]',
    primaryCtaClass:
      'text-[#161109] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105',
    mobileHeaderBtnClass: 'text-amber-50 hover:bg-amber-200/12',
    overflowMenuClass: 'bg-[#281E0F]/98 border-amber-300/25 text-amber-50',
    overflowMenuItemHoverClass: 'hover:bg-[#3A2B14]',
    overflowCallIconClass: 'text-[#FDBA74]',
  },
  {
    id: 'orange-light',
    label: 'Orange Light',
    subtitle: 'Oranye cerah lembut dengan teks Biru Dongker berkontras tinggi.',
    swatchClass: 'bg-gradient-to-br from-[#FFEDD5] via-[#FDBA74] to-[#FB923C]',
    isLight: true,
    headerClass:
      'bg-gradient-to-r from-[#FFEDD5]/95 via-[#FDBA74]/95 to-[#FB923C]/95 border-b border-[#0B1D3A]/20',
    bottomNavClass:
      'bg-gradient-to-r from-[#FFEDD5]/96 via-[#FDBA74]/96 to-[#FB923C]/96 border-t border-[#0B1D3A]/20',
    brandClass: 'text-[#071329] hover:text-[#3B2318]',
    navActiveClass: 'text-[#071329] border-[#0B1D3A] font-semibold',
    navInactiveClass: 'text-[#291812]/80 border-transparent hover:text-[#071329] hover:border-[#0B1D3A]/40',
    unreadBadgeClass: 'bg-[#0B1D3A] text-[#FFEDD5]',
    statusDotClass: 'bg-[#0B1D3A]',
    mobileDotBorderClass: 'border-[#FDBA74]',
    mobileActiveCapsuleClass: 'bg-[#0B1D3A] text-[#FFEDD5] border border-[#071329]/40',
    mobileInactiveIconClass: 'text-[#291812] hover:text-[#071329]',
    mobileActiveLabelClass: 'text-[#071329] font-bold',
    mobileInactiveLabelClass: 'text-[#291812]/85 font-medium',
    akuAiActiveClass: 'bg-[#0B1D3A] text-[#FFEDD5] border-[#071329]',
    akuAiIdleClass: 'bg-[#0B1D3A]/12 text-[#071329] border-[#0B1D3A]/25 hover:bg-[#0B1D3A]/20',
    iconBtnClass: 'text-[#071329] bg-[#0B1D3A]/12 hover:bg-[#0B1D3A]/20 border border-[#0B1D3A]/20',
    settingsActiveClass: 'bg-[#0B1D3A] text-[#FFEDD5] border-[#071329]',
    settingsIdleClass: 'bg-[#0B1D3A]/12 text-[#071329] border-[#0B1D3A]/20 hover:bg-[#0B1D3A]/20',
    primaryCtaClass: 'text-[#FFEDD5] bg-[#0B1D3A] hover:bg-[#102A54]',
    mobileHeaderBtnClass: 'text-[#071329] hover:bg-[#0B1D3A]/12',
    overflowMenuClass: 'bg-[#0B1D3A]/98 border-[#FDBA74]/30 text-stone-100',
    overflowMenuItemHoverClass: 'hover:bg-[#102A54]',
    overflowCallIconClass: 'text-[#FDBA74]',
  },
  {
    id: 'bronze',
    label: 'Perunggu Senja',
    subtitle: 'Perunggu hangat gelap dengan aksen Orange Light & Emas Sampanye.',
    swatchClass: 'bg-gradient-to-br from-[#3B2318] via-[#291812] to-[#140C0A]',
    isLight: false,
    headerClass:
      'bg-gradient-to-r from-[#140C0A]/95 via-[#291812]/92 to-[#3B2318]/92 border-b border-orange-200/22',
    bottomNavClass:
      'bg-gradient-to-r from-[#140C0A]/96 via-[#291812]/95 to-[#3B2318]/95 border-t border-orange-200/22',
    brandClass: 'text-orange-50 hover:text-[#FDBA74]',
    navActiveClass: 'text-orange-50 border-[#FDBA74]',
    navInactiveClass: 'text-orange-100/75 border-transparent hover:text-orange-50 hover:border-orange-200/40',
    unreadBadgeClass:
      'bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] text-[#140C0A]',
    statusDotClass: 'bg-[#FB923C]',
    mobileDotBorderClass: 'border-[#140C0A]',
    mobileActiveCapsuleClass: 'bg-[#0B1D3A]/90 text-[#FDBA74] border border-[#FDBA74]/35',
    mobileInactiveIconClass: 'text-orange-100/85 hover:text-white',
    mobileActiveLabelClass: 'text-[#FFEDD5] font-semibold',
    mobileInactiveLabelClass: 'text-orange-100/70 font-medium',
    akuAiActiveClass: 'bg-[#3A2B14]/90 text-amber-200 border-[#FDBA74]/55',
    akuAiIdleClass: 'bg-[#3B2318]/85 text-orange-50 border-orange-200/25 hover:bg-[#4C2E20]',
    iconBtnClass: 'text-orange-50 bg-[#3B2318]/85 hover:bg-[#4C2E20] border border-orange-200/20',
    settingsActiveClass: 'bg-[#0B1D3A]/90 text-[#FDBA74] border-[#FDBA74]/45',
    settingsIdleClass: 'bg-[#3B2318]/85 text-orange-50 border-orange-200/20 hover:bg-[#4C2E20]',
    primaryCtaClass:
      'text-[#140C0A] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105',
    mobileHeaderBtnClass: 'text-orange-50 hover:bg-orange-200/12',
    overflowMenuClass: 'bg-[#291812]/98 border-orange-200/25 text-orange-50',
    overflowMenuItemHoverClass: 'hover:bg-[#3B2318]',
    overflowCallIconClass: 'text-[#FDBA74]',
  },
];

export function getNavbarThemeConfig(themeId?: StatusTheme | string): NavbarThemeConfig {
  return NAVBAR_THEMES.find((item) => item.id === themeId) ?? NAVBAR_THEMES[0];
}
