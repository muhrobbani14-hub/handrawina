import { useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Phone,
  QrCode,
  ShieldCheck,
  UserPlus,
  Video,
} from 'lucide-react';
import type { AppSettings } from '../../types/handrawina';
import { COUNTRY_DIAL_OPTIONS } from '../../utils/phoneAuthAndContacts';
import { CinematicBackdrop } from './CinematicBackdrop';

interface AuthGateScreenProps {
  pendingQrCode: string | null;
  authLoading: boolean;
  authError: string | null;
  onClearAuthError?: () => void;
  backdropSettings: Pick<
    AppSettings,
    'backdropPreset' | 'backdropIntensity' | 'backdropMotion'
  >;
  onPhoneSignIn: (params: {
    phoneInput: string;
    countryCode: string;
    pin: string;
  }) => Promise<boolean>;
  onPhoneRegister: (params: {
    phoneInput: string;
    countryCode: string;
    pin: string;
    displayName: string;
  }) => Promise<boolean>;
}

export function AuthGateScreen({
  pendingQrCode,
  authLoading,
  authError,
  onClearAuthError,
  backdropSettings,
  onPhoneSignIn,
  onPhoneRegister,
}: AuthGateScreenProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [countryCode, setCountryCode] = useState('+62');
  const [phoneInput, setPhoneInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchTab = (next: 'login' | 'register') => {
    setAuthTab(next);
    onClearAuthError?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || authLoading) return;
    setBusy(true);
    try {
      if (authTab === 'register') {
        await onPhoneRegister({
          phoneInput,
          countryCode,
          pin,
          displayName,
        });
      } else {
        await onPhoneSignIn({
          phoneInput,
          countryCode,
          pin,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="auth-gate-screen"
      className="min-h-screen relative flex items-center justify-center p-4 sm:p-8 text-stone-100 overflow-y-auto"
    >
      <CinematicBackdrop
        presetId={backdropSettings.backdropPreset}
        intensity={backdropSettings.backdropIntensity}
        motionEnabled={backdropSettings.backdropMotion}
      />

      <main className="relative z-10 w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
        {/* Left Brand & Architecture Showcase (below Sign-In on mobile so CTA is above the fold) */}
        <section className="order-2 lg:order-1 lg:col-span-7 bg-[#0A1833]/84 backdrop-blur-2xl border border-[#FDBA74]/22 rounded-2xl p-6 sm:p-9 flex flex-col justify-between shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#FDBA74] tracking-wide uppercase">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Komunikasi Nomor Telepon Terenkripsi E2EE</span>
            </div>

            <div className="space-y-3">
              <h1 className="hidden lg:block text-3xl sm:text-4xl font-display font-bold tracking-tight text-amber-50">
                Handrawina
              </h1>
              <p className="text-sm sm:text-base text-stone-300 leading-relaxed max-w-xl">
                Masuk cukup dengan nomor telepon tanpa Gmail. Simpan nomor teman langsung seperti WhatsApp, kirim pesan real-time dengan enkripsi ECDH P-256, dan lakukan panggilan suara maupun video WebRTC P2P.
              </p>
            </div>

            {pendingQrCode && (
              <div
                data-testid="auth-pending-qr-banner-desktop"
                className="hidden lg:flex p-4 rounded-xl bg-[#3A2B14]/85 border border-[#FDBA74]/40 items-start gap-3"
              >
                <QrCode className="w-5 h-5 text-[#FDBA74] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs sm:text-sm space-y-1">
                  <div className="font-semibold text-amber-100">
                    Kode QR Undangan Terdeteksi: <span className="font-mono">{pendingQrCode}</span>
                  </div>
                  <p className="text-stone-300">
                    Masuk atau daftar dengan nomor telepon Anda agar Handrawina langsung menautkan percakapan atau ruang panggilan dari QR tersebut.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 lg:pt-7 lg:mt-7 border-t border-amber-200/15">
            <div className="p-3.5 rounded-xl bg-[#102A54]/70 border border-sky-200/15 space-y-1.5">
              <UserPlus className="w-4 h-4 text-[#FDBA74]" aria-hidden="true" />
              <div className="text-xs font-semibold text-amber-50">Tambah via Nomor HP</div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Cukup simpan nomor telepon teman untuk langsung chat &amp; buat grup ala WhatsApp.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#3A2B14]/65 border border-[#E5C17B]/20 space-y-1.5">
              <Lock className="w-4 h-4 text-[#F7DC9C]" aria-hidden="true" />
              <div className="text-xs font-semibold text-amber-50">ECDH P-256 E2EE</div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Kunci identitas kriptografi &amp; 60-digit Safety Number asli tiap nomor telepon.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#3B2318]/75 border border-[#FDBA74]/20 space-y-1.5">
              <Video className="w-4 h-4 text-[#FDBA74]" aria-hidden="true" />
              <div className="text-xs font-semibold text-amber-50">WebRTC Live Call</div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Panggilan suara &amp; video real-time lintas perangkat lewat signaling Firestore.
              </p>
            </div>
          </div>
        </section>

        {/* Right Phone Login / Register Card (first on mobile so CTA is immediately visible) */}
        <section className="order-1 lg:order-2 lg:col-span-5 bg-stone-950/90 backdrop-blur-2xl border border-amber-200/20 rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FDBA74] to-[#B47A38] text-stone-950 flex items-center justify-center shadow-lg">
                  <Phone className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="lg:hidden text-lg font-display font-bold tracking-tight text-amber-50">
                  Handrawina
                </span>
              </div>
              <h2 className="text-xl font-display font-bold text-amber-50 pt-1">
                {authTab === 'login' ? 'Masuk dengan Nomor HP' : 'Daftar Nomor Telepon'}
              </h2>
              <p className="text-xs text-stone-400 leading-relaxed">
                {authTab === 'login'
                  ? 'Masukkan nomor telepon dan PIN Handrawina Anda tanpa perlu login Gmail.'
                  : 'Daftarkan nomor telepon Anda agar teman bisa langsung menambahkan nomor Anda.'}
              </p>
            </div>

            {/* Mode Switcher: Masuk / Daftar Baru */}
            <div
              role="tablist"
              aria-label="Mode masuk nomor telepon"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#071329]/85 border border-amber-200/15"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'login'}
                data-testid="auth-tab-login"
                onClick={() => switchTab('login')}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  authTab === 'login'
                    ? 'bg-[#3A2B14] text-[#F7DC9C] border border-[#E5C17B]/35'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'register'}
                data-testid="auth-tab-register"
                onClick={() => switchTab('register')}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  authTab === 'register'
                    ? 'bg-[#3A2B14] text-[#F7DC9C] border border-[#E5C17B]/35'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Daftar Baru
              </button>
            </div>

            {pendingQrCode && (
              <div
                data-testid="auth-pending-qr-banner"
                className="lg:hidden p-3 rounded-xl bg-[#3A2B14]/85 border border-[#FDBA74]/40 flex items-start gap-2.5"
              >
                <QrCode className="w-4 h-4 text-[#FDBA74] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-amber-100">
                    Kode QR: <span className="font-mono">{pendingQrCode}</span>
                  </div>
                  <p className="text-stone-300">
                    Masuk dengan nomor HP untuk menautkan QR ini.
                  </p>
                </div>
              </div>
            )}

            {authError && (
              <div
                role="alert"
                data-testid="auth-error-alert"
                className="p-3 rounded-lg bg-red-950/75 border border-red-400/40 text-xs text-red-200 leading-relaxed"
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {authTab === 'register' && (
                <div>
                  <label
                    htmlFor="auth-display-name"
                    className="block text-[11px] font-medium text-stone-300 mb-1"
                  >
                    Nama Profil Anda
                  </label>
                  <input
                    id="auth-display-name"
                    data-testid="auth-display-name-input"
                    type="text"
                    required
                    maxLength={80}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Contoh: Ahmad K."
                    className="w-full px-3 py-2.5 text-sm bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-phone-input"
                  className="block text-[11px] font-medium text-stone-300 mb-1"
                >
                  Nomor Telepon
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Kode negara"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-[92px] shrink-0 px-2.5 py-2.5 text-xs font-mono bg-stone-900/90 border border-amber-200/20 rounded-xl text-amber-100 focus:outline-none focus:border-[#FDBA74]"
                  >
                    {COUNTRY_DIAL_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.flag} {opt.code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="auth-phone-input"
                    data-testid="auth-phone-input"
                    type="tel"
                    inputMode="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="812-3456-7890"
                    className="flex-1 min-w-0 px-3 py-2.5 text-sm font-mono bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-pin-input"
                  className="block text-[11px] font-medium text-stone-300 mb-1"
                >
                  PIN / Kata Sandi Akun (min. 6 karakter)
                </label>
                <div className="relative">
                  <input
                    id="auth-pin-input"
                    data-testid="auth-pin-input"
                    type={showPin ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={64}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder={authTab === 'register' ? 'Buat PIN 6+ karakter' : 'Masukkan PIN Anda'}
                    className="w-full px-3 py-2.5 pr-10 text-sm bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-amber-200 cursor-pointer"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading || busy}
                data-testid="phone-auth-submit-button"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-stone-950 bg-gradient-to-r from-[#F7DC9C] via-[#FDBA74] to-[#E5A852] hover:brightness-105 disabled:opacity-50 rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <span>
                  {busy || authLoading
                    ? 'Memverifikasi Nomor...'
                    : authTab === 'register'
                    ? 'Daftar & Masuk Handrawina'
                    : 'Masuk dengan Nomor Telepon'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            </form>
          </div>

        </section>
      </main>
    </div>
  );
}
