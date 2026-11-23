import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Image as ImageIcon,
  Lock,
  LogOut,
  PhoneCall,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import type {
  AccountProfile,
  AppSettings,
  BackdropIntensity,
  BackdropPresetId,
  StatusTheme,
} from '../../types/handrawina';
import { BACKDROP_PRESETS } from '../../utils/backdropTheme';
import { NAVBAR_THEMES } from '../../utils/navbarTheme';

export type SettingsCategory = 'appearance' | 'profile' | 'privacy' | 'calls' | 'notifications';

interface SettingsWorkspaceProps {
  account: AccountProfile;
  settings: AppSettings;
  activeCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  onPreviewBackdrop?: (
    preview: {
      backdropPreset: BackdropPresetId;
      backdropIntensity: BackdropIntensity;
      backdropMotion: boolean;
      navbarTheme: StatusTheme;
    } | null
  ) => void;
  onSaveSettings: (params: {
    displayName?: string;
    settings: Partial<AppSettings>;
  }) => Promise<{ ok: boolean; message: string }>;
  onResetSettings: () => Promise<void>;
  onOpenSecurityTab: () => void;
  onSignOut?: () => Promise<void>;
}

const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  desc: string;
  icon: typeof User;
}[] = [
  {
    id: 'appearance',
    label: 'Latar Sinematik',
    desc: 'Tema latar mewah, intensitas atmosfer, dan gerak halus.',
    icon: ImageIcon,
  },
  {
    id: 'profile',
    label: 'Profil & Akun',
    desc: 'Nama tampilan, info status, dan identitas UUID.',
    icon: User,
  },
  {
    id: 'privacy',
    label: 'Privasi & E2EE',
    desc: 'Laporan dibaca, mengetik, dan pesan sementara.',
    icon: Lock,
  },
  {
    id: 'calls',
    label: 'Panggilan WebRTC',
    desc: 'Pengaturan jaringan panggilan lanjutan belum tersedia.',
    icon: PhoneCall,
  },
  {
    id: 'notifications',
    label: 'Notifikasi & Media',
    desc: 'Pengaturan notifikasi dan media belum tersedia.',
    icon: Bell,
  },
];

const INTENSITY_OPTIONS: {
  id: BackdropIntensity;
  label: string;
  detail: string;
}[] = [
  { id: 'subtle', label: 'Halus', detail: 'Fokus tinggi, latar meredup tenang.' },
  { id: 'balanced', label: 'Seimbang', detail: 'Keseimbangan atmosfer mewah dan keterbacaan.' },
  { id: 'cinematic', label: 'Sinematik', detail: 'Pencahayaan arsitektural tampil lebih menonjol.' },
];

export function SettingsWorkspace({
  account,
  settings,
  activeCategory,
  onCategoryChange,
  onPreviewBackdrop,
  onSaveSettings,
  onResetSettings,
  onOpenSecurityTab,
  onSignOut,
}: SettingsWorkspaceProps) {
  const [internalCategory, setInternalCategory] = useState<SettingsCategory>(
    activeCategory ?? 'appearance'
  );
  const category = activeCategory ?? internalCategory;
  const setCategory = (next: SettingsCategory) => {
    setInternalCategory(next);
    onCategoryChange?.(next);
  };

  const [displayName, setDisplayName] = useState(account.displayName);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(account.displayName);
    setDraft(settings);
  }, [account.displayName, settings]);

  useEffect(() => {
    const changed =
      draft.backdropPreset !== settings.backdropPreset ||
      draft.backdropIntensity !== settings.backdropIntensity ||
      draft.backdropMotion !== settings.backdropMotion ||
      draft.navbarTheme !== settings.navbarTheme;
    if (changed) {
      onPreviewBackdrop?.({
        backdropPreset: draft.backdropPreset,
        backdropIntensity: draft.backdropIntensity,
        backdropMotion: draft.backdropMotion,
        navbarTheme: draft.navbarTheme,
      });
    } else {
      onPreviewBackdrop?.(null);
    }
  }, [
    draft.backdropPreset,
    draft.backdropIntensity,
    draft.backdropMotion,
    draft.navbarTheme,
    settings.backdropPreset,
    settings.backdropIntensity,
    settings.backdropMotion,
    settings.navbarTheme,
    onPreviewBackdrop,
  ]);

  useEffect(() => {
    return () => {
      onPreviewBackdrop?.(null);
    };
  }, [onPreviewBackdrop]);

  const updateBackdropDraft = (
    patch: Partial<
      Pick<AppSettings, 'backdropPreset' | 'backdropIntensity' | 'backdropMotion' | 'navbarTheme'>
    >
  ) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await onSaveSettings({
        displayName: displayName.trim() || account.displayName,
        settings: draft,
      });
      setFeedback({ ok: res.ok, text: res.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await onResetSettings();
      onPreviewBackdrop?.(null);
      setFeedback({
        ok: true,
        text: 'Seluruh pengaturan telah dikembalikan ke konfigurasi bawaan.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-stone-950/42 backdrop-blur-md px-5 sm:px-8 py-8 text-stone-100">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="pb-5 border-b border-amber-200/15 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-amber-50">
              Pengaturan Handrawina
            </h1>
            <p className="text-sm text-stone-300 mt-1">
              Sesuaikan latar belakang sinematik mewah, profil akun, privasi E2EE, panggilan WebRTC, dan notifikasi perangkat.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-200 bg-stone-900/75 border border-amber-200/20 hover:bg-stone-800/90 hover:text-amber-100 rounded-md cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Bawaan
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Category Navigation */}
          <nav
            aria-label="Kategori pengaturan"
            className="lg:col-span-4 bg-stone-950/72 backdrop-blur-xl border border-amber-200/15 rounded-lg divide-y divide-amber-200/10 overflow-hidden"
          >
            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-400/12 text-amber-100'
                      : 'hover:bg-stone-900/70 text-stone-200'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? 'text-amber-300' : 'text-stone-400'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Right Settings Form */}
          <form
            onSubmit={handleSave}
            className="lg:col-span-8 bg-stone-950/72 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
          >
            <div className="p-6 space-y-6">
              {category === 'appearance' && (
                <div className="space-y-6" data-testid="appearance-settings-panel">
                  <div>
                    <h2 className="text-base font-semibold text-amber-50">
                      Nuansa Warna Navbar &amp; Latar Sinematik
                    </h2>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Pilih salah satu dari 4 warna utama untuk bilah navigasi serta lanskap arsitektural sinematik ruang kerja Handrawina.
                    </p>
                  </div>

                  {/* 4-Color Navbar Theme Selector */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-medium text-stone-200">
                      Warna Bilah Navigasi (Navbar)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {NAVBAR_THEMES.map((theme) => {
                        const selected = draft.navbarTheme === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => updateBackdropDraft({ navbarTheme: theme.id })}
                            aria-pressed={selected}
                            data-testid={`navbar-theme-option-${theme.id}`}
                            className={`px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${theme.swatchClass} ${
                              theme.isLight
                                ? selected
                                  ? 'border-[#071329] ring-2 ring-[#FDBA74]/80 text-[#071329]'
                                  : 'border-[#0B1D3A]/25 text-[#071329] hover:border-[#071329]/60'
                                : selected
                                ? 'border-[#FDBA74] ring-1 ring-[#FDBA74]/60 text-stone-50'
                                : 'border-amber-200/20 text-stone-100 hover:border-amber-200/50'
                            }`}
                          >
                            <span className="truncate">{theme.label}</span>
                            {selected && (
                              <Check
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  theme.isLight ? 'text-[#071329]' : 'text-[#FDBA74]'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Curated Luxury Backdrop Presets */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {BACKDROP_PRESETS.map((preset) => {
                      const selected = draft.backdropPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateBackdropDraft({ backdropPreset: preset.id })}
                          aria-pressed={selected}
                          data-testid={`backdrop-option-${preset.id}`}
                          className={`group text-left rounded-lg overflow-hidden border transition-all cursor-pointer bg-stone-900/80 ${
                            selected
                              ? 'border-amber-400 ring-1 ring-amber-400/50'
                              : 'border-amber-200/15 hover:border-amber-200/40'
                          }`}
                        >
                          <div
                            className="relative aspect-video w-full overflow-hidden bg-stone-950"
                            style={{ backgroundImage: preset.fallbackGradient }}
                          >
                            <img
                              src={preset.imageUrl}
                              alt={`Pratinjau latar ${preset.name}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/20 to-transparent" />
                            {selected && (
                              <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-400 text-stone-950 flex items-center justify-center shadow">
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              </span>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <div className="text-xs font-semibold text-amber-50">
                              {preset.name}
                            </div>
                            <p className="text-[11px] text-stone-400 leading-relaxed">
                              {preset.subtitle}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Atmospheric Intensity Selector */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-medium text-stone-200">
                      Intensitas Pencahayaan Latar
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Intensitas pencahayaan latar"
                      className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                    >
                      {INTENSITY_OPTIONS.map((opt) => {
                        const active = draft.backdropIntensity === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => updateBackdropDraft({ backdropIntensity: opt.id })}
                            className={`text-left px-3.5 py-2.5 rounded-md border transition-colors cursor-pointer ${
                              active
                                ? 'bg-amber-400/15 border-amber-400/70 text-amber-100'
                                : 'bg-stone-900/65 border-amber-200/15 text-stone-300 hover:border-amber-200/35 hover:text-stone-100'
                            }`}
                          >
                            <div className="text-xs font-semibold">{opt.label}</div>
                            <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">
                              {opt.detail}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ambient Motion Toggle */}
                  <div className="border border-amber-200/15 rounded-md bg-stone-900/50">
                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-stone-100">
                          Gerakan Kamera Sinematik Halus
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          Aktifkan pergeseran lambat berakselerasi GPU pada latar belakang (otomatis nonaktif jika OS mengaktifkan Reduce Motion).
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.backdropMotion}
                        onChange={(e) =>
                          updateBackdropDraft({ backdropMotion: e.target.checked })
                        }
                        className="w-4 h-4 accent-amber-400 cursor-pointer shrink-0"
                      />
                    </label>
                  </div>
                </div>
              )}

              {category === 'profile' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-amber-50">
                      Profil &amp; Identitas Akun
                    </h2>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Perubahan nama tampilan akan langsung tersinkron ke sesi obrolan dan panggilan aktif Anda.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="settings-display-name"
                        className="block text-xs font-medium text-stone-300 mb-1"
                      >
                        Nama Tampilan Handrawina
                      </label>
                      <input
                        id="settings-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-stone-900/80 border border-amber-200/20 rounded-md text-stone-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="settings-about-text"
                        className="block text-xs font-medium text-stone-300 mb-1"
                      >
                        Info / Status Profil
                      </label>
                      <input
                        id="settings-about-text"
                        type="text"
                        maxLength={140}
                        value={draft.aboutText}
                        onChange={(e) => setDraft({ ...draft, aboutText: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-stone-900/80 border border-amber-200/20 rounded-md text-stone-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-stone-900/65 border border-amber-200/15 rounded-md text-xs">
                      <div>
                        <dt className="text-stone-400">Nomor Telepon Terdaftar</dt>
                        <dd className="font-mono font-semibold text-amber-100 mt-1">
                          {account.phoneNumber}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-400">Account UUID Permanen</dt>
                        <dd className="font-mono text-stone-200 mt-1 break-all">
                          {account.accountId}
                        </dd>
                      </div>
                    </dl>

                    <div className="p-4 rounded-lg bg-[#0A1833]/80 border border-[#FDBA74]/25 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-semibold text-amber-100">
                          Sesi Cloud Aktif
                        </div>
                        <div className="text-xs text-stone-300 truncate">
                          {account.phoneNumber} · Tersinkron Real-Time &amp; E2EE
                        </div>
                      </div>
                      {onSignOut ? (
                        <button
                          type="button"
                          onClick={() => void onSignOut()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-200 bg-red-950/60 hover:bg-red-900/70 border border-red-400/35 rounded-md cursor-pointer transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                          Keluar
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-stone-400">
                        Kelola perangkat yang terhubung dari halaman Keamanan.
                      </span>
                      <button
                        type="button"
                        onClick={onOpenSecurityTab}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Buka Keamanan &amp; Perangkat
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {category === 'privacy' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-amber-50">
                      Privasi &amp; Enkripsi E2EE
                    </h2>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Kendalikan laporan dibaca dan indikator mengetik pada percakapan.
                    </p>
                  </div>

                  <div className="divide-y divide-amber-200/10 border border-amber-200/15 rounded-md bg-stone-900/50">
                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-stone-100">
                          Laporan Dibaca (Centang Biru)
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          Jika dimatikan, klien tidak mengirim sinyal receipt:read saat Anda membuka obrolan.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.readReceiptsEnabled}
                        onChange={(e) =>
                          setDraft({ ...draft, readReceiptsEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-amber-400 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <div>
                        <div className="text-sm font-medium text-stone-100">
                          Indikator Sedang Mengetik
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          Bagikan status mengetik secara real-time dengan lawan bicara.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={draft.typingIndicatorsEnabled}
                        onChange={(e) =>
                          setDraft({ ...draft, typingIndicatorsEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-amber-400 cursor-pointer shrink-0"
                      />
                    </label>

                  </div>
                </div>
              )}

              {category === 'calls' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-amber-50">
                      Panggilan Keluar &amp; Jaringan WebRTC
                    </h2>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Pengaturan jaringan tambahan untuk panggilan belum tersedia.
                    </p>
                  </div>
                </div>
              )}

              {category === 'notifications' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-amber-50">
                      Notifikasi &amp; Media
                    </h2>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Pengaturan notifikasi pesan dan pengunduhan media belum tersedia.
                    </p>
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  data-testid="settings-saved-feedback"
                  className={`p-3 rounded-md text-xs border flex items-center gap-2 ${
                    feedback.ok
                      ? 'bg-[#3A2B14]/80 border-[#FDBA74]/40 text-amber-100'
                      : 'bg-red-950/70 border-red-500/35 text-red-100'
                  }`}
                >
                  <Check
                    className={`w-4 h-4 shrink-0 ${
                      feedback.ok ? 'text-[#FDBA74]' : 'text-red-300'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-stone-950/80 border-t border-amber-200/15 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md cursor-pointer transition-colors"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
