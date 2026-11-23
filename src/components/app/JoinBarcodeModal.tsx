import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  QrCode,
  RefreshCw,
  ScanLine,
  Smartphone,
  UserPlus,
  X,
} from 'lucide-react';
import { encodeCode128B, parseHandrawinaJoinInput } from '../../utils/barcodeGenerator';

export type JoinBarcodeMode = 'invite' | 'pair' | 'call';

export interface MintedJoinToken {
  code: string;
  mode: JoinBarcodeMode;
  label: string;
  expiresInSec: number;
  advChallenge?: string;
  roomId?: string;
}

interface JoinBarcodeModalProps {
  open: boolean;
  initialMode?: JoinBarcodeMode;
  onMintToken: (mode: JoinBarcodeMode) => Promise<MintedJoinToken>;
  onRedeemCode: (params: {
    code: string;
    memberName?: string;
  }) => Promise<{
    ok: boolean;
    mode?: JoinBarcodeMode;
    message: string;
    conversationId?: string;
    callRoomCode?: string;
  }>;
  onClose: () => void;
  onRedeemSuccess: (result: {
    mode: JoinBarcodeMode;
    message: string;
    conversationId?: string;
    callRoomCode?: string;
  }) => void;
}

export function BarcodeVisualCard({
  code,
  deepLinkUrl,
  caption,
}: {
  code: string;
  deepLinkUrl: string;
  caption: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const linearBarcode = useMemo(() => encodeCode128B(code), [code]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(deepLinkUrl, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [deepLinkUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(deepLinkUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `handrawina-${code.toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="bg-stone-900/75 border border-amber-200/15 rounded-lg p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
        {/* 2D QR Code (ISO/IEC 18004) — crisp white quiet zone for reliable physical scanning */}
        <div className="flex flex-col items-center bg-white border border-amber-200/25 rounded-md p-4 shadow-md">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Kode QR Handrawina ${code}`}
              data-testid="handrawina-qr-image"
              className="w-[184px] h-[184px] object-contain"
            />
          ) : (
            <div className="w-[184px] h-[184px] flex items-center justify-center text-xs text-slate-500">
              Membuat QR Code...
            </div>
          )}
          <span className="text-[11px] font-mono text-slate-600 mt-2">
            QR Code 2D · ISO/IEC 18004
          </span>
        </div>

        {/* 1D Linear Barcode (Code-128B) + Action Buttons */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-amber-200/75">Kode Gabung Handrawina</div>
            <div
              className="text-lg font-mono font-bold tracking-wider text-stone-100 mt-0.5 tabular-nums"
              data-testid="join-barcode-code"
            >
              {code}
            </div>
            <p className="text-xs text-stone-300 mt-1 leading-relaxed">{caption}</p>
          </div>

          <div className="bg-white border border-amber-200/25 rounded-md p-3">
            <svg
              viewBox={`0 0 ${linearBarcode.totalWidth} 56`}
              className="w-full h-14 block"
              role="img"
              aria-label={`Barcode linear Code-128 ${linearBarcode.encodedText}`}
              data-testid="handrawina-linear-barcode"
            >
              <rect x="0" y="0" width={linearBarcode.totalWidth} height="56" fill="#FFFFFF" />
              {linearBarcode.bars.map((bar, idx) => (
                <rect
                  key={idx}
                  x={bar.x}
                  y="4"
                  width={bar.width}
                  height="48"
                  fill="#0F172A"
                />
              ))}
            </svg>
            <div className="text-center font-mono text-[11px] tracking-widest text-slate-700 mt-1">
              {linearBarcode.encodedText}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-200 bg-stone-950/75 border border-stone-700/80 hover:bg-stone-800/85 hover:text-white rounded-md transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                  Tautan Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Salin Tautan
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-200 bg-stone-950/75 border border-stone-700/80 hover:bg-stone-800/85 hover:text-white rounded-md transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Unduh QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JoinBarcodeModal({
  open,
  initialMode = 'invite',
  onMintToken,
  onRedeemCode,
  onClose,
  onRedeemSuccess,
}: JoinBarcodeModalProps) {
  const [mode, setMode] = useState<JoinBarcodeMode>(initialMode);
  const [token, setToken] = useState<MintedJoinToken | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  // Redeem / scan form
  const [redeemInput, setRedeemInput] = useState('');
  const [joinDisplayName, setJoinDisplayName] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Live camera QR scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRedeemFeedback(null);
      setScannerOpen(false);
      setScannerStatus(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const fetchToken = async (targetMode: JoinBarcodeMode) => {
    setLoadingToken(true);
    try {
      const minted = await onMintToken(targetMode);
      setToken(minted);
      setSecondsLeft(minted.expiresInSec);
    } catch (error) {
      setRedeemFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Gagal menerbitkan token QR.',
      });
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void fetchToken(mode);
  }, [open, mode]);

  useEffect(() => {
    if (!open || !token) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, token]);

  // Live camera QR scanner using native BarcodeDetector when available
  useEffect(() => {
    if (!open || !scannerOpen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanInterval: number | null = null;

    async function startCameraScanner() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerStatus('Kamera browser tidak tersedia. Tempel kode HND-INV-... atau tautan QR di kolom bawah.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
        }

        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
            };
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setScannerStatus(
            'Kamera aktif, namun browser ini belum mendukung pemindaian QR langsung di dalam tab. Pindai QR dengan aplikasi kamera bawaan ponsel Anda agar tautan Handrawina langsung terbuka.'
          );
          return;
        }

        setScannerStatus('Arahkan kamera ke QR Code Handrawina milik rekan Anda...');
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code', 'code_128'] });
        scanInterval = window.setInterval(async () => {
          if (cancelled || !videoEl || videoEl.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoEl);
            const firstRaw = barcodes[0]?.rawValue;
            if (firstRaw) {
              const parsed = parseHandrawinaJoinInput(firstRaw);
              if (parsed.kind !== 'invalid') {
                setScannerOpen(false);
                setRedeemInput(parsed.code);
                void handleRedeem(parsed.code);
              }
            }
          } catch {
            // Keep scanning
          }
        }, 450);
      } catch {
        if (!cancelled) {
          setScannerStatus(
            'Izin kamera ditolak atau kamera tidak terdeteksi. Anda tetap bisa menempel kode atau tautan QR di kolom bawah.'
          );
        }
      }
    }

    void startCameraScanner();
    return () => {
      cancelled = true;
      if (scanInterval) window.clearInterval(scanInterval);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, scannerOpen, videoEl]);

  if (!open) return null;

  const queryParam = mode === 'call' ? 'call' : mode === 'pair' ? 'pair' : 'join';
  const deepLinkUrl = token
    ? `${window.location.origin}/?${queryParam}=${encodeURIComponent(token.code)}`
    : window.location.origin;

  const handleRedeem = async (rawCode: string) => {
    const parsed = parseHandrawinaJoinInput(rawCode);
    if (parsed.kind === 'invalid') {
      setRedeemFeedback({
        ok: false,
        text: 'Format kode tidak valid. Gunakan format HND-INV-..., HND-PAIR-..., HND-VID-... atau tautan QR Handrawina.',
      });
      return;
    }

    setRedeemBusy(true);
    setRedeemFeedback(null);
    try {
      const result = await onRedeemCode({
        code: parsed.code,
        memberName: joinDisplayName.trim() || undefined,
      });
      if (!result.ok) {
        setRedeemFeedback({ ok: false, text: result.message });
        return;
      }
      setRedeemFeedback({ ok: true, text: result.message });
      setRedeemInput('');
      setJoinDisplayName('');
      onRedeemSuccess({
        mode: result.mode ?? parsed.kind,
        message: result.message,
        conversationId: result.conversationId,
        callRoomCode: result.callRoomCode,
      });
    } catch (error) {
      setRedeemFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Gagal memproses kode QR.',
      });
    } finally {
      setRedeemBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Barcode dan QR Code untuk Bergabung ke Handrawina"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-stone-950/92 backdrop-blur-2xl border border-amber-200/20 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] max-w-2xl w-full overflow-hidden my-auto text-stone-100">
        <div className="px-5 py-4 border-b border-amber-200/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <QrCode className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-display font-bold text-stone-100 truncate">
                Barcode &amp; QR Code Gabung Handrawina
              </h2>
              <p className="text-xs text-stone-400 truncate">
                Pindai dari akun Handrawina lain untuk terhubung melalui cloud.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela barcode gabung"
            className="p-2 text-stone-400 hover:text-stone-100 hover:bg-white/5 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="Jenis barcode Handrawina"
            className="grid grid-cols-3 gap-1 p-1 bg-stone-900/90 border border-stone-800 rounded-md"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'invite'}
              onClick={() => setMode('invite')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                mode === 'invite'
                  ? 'bg-amber-300/15 text-amber-100 border border-amber-300/30'
                  : 'text-stone-400 border border-transparent hover:text-stone-100'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Hubungkan User</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pair'}
              onClick={() => setMode('pair')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                mode === 'pair'
                  ? 'bg-amber-300/15 text-amber-100 border border-amber-300/30'
                  : 'text-stone-400 border border-transparent hover:text-stone-100'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Tautkan Perangkat</span>
            </button>
          </div>

          {/* Live QR + Linear Barcode Display */}
          {token ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-300">
                <span>
                  {token.label}
                  {token.advChallenge ? ` · Challenge ${token.advChallenge}` : ''}
                </span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="text-stone-400">Berlaku {secondsLeft} dtk</span>
                  <button
                    type="button"
                    disabled={loadingToken}
                    onClick={() => void fetchToken(mode)}
                    className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 hover:underline cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${loadingToken ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Perbarui
                  </button>
                </div>
              </div>

              <BarcodeVisualCard
                code={token.code}
                deepLinkUrl={deepLinkUrl}
                caption={
                  mode === 'invite'
                    ? 'Minta pengguna lain memindai QR ini (atau buka tautannya) dari akun Handrawina mereka untuk terhubung.'
                    : mode === 'pair'
                    ? 'Pindai dari perangkat companion Anda untuk menautkan perangkat baru (ADV Signed Device List).'
                    : 'Pindai untuk bergabung langsung ke panggilan Video Call WebRTC P2P terenkripsi.'
                }
              />
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-stone-400">
              Menerbitkan token kriptografi...
            </div>
          )}

          {/* Live Camera QR Scanner (Optional Toggle) */}
          {scannerOpen && (
            <div className="p-3.5 rounded-lg bg-[#071329]/90 border border-[#FDBA74]/30 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-100">Pemindai Kamera QR Langsung</span>
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="text-stone-400 hover:text-white cursor-pointer"
                >
                  Tutup Kamera
                </button>
              </div>
              <div className="relative aspect-video bg-black rounded-md overflow-hidden border border-amber-200/20">
                <video
                  ref={setVideoEl}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              {scannerStatus && (
                <p className="text-xs text-amber-200/90 leading-relaxed">{scannerStatus}</p>
              )}
            </div>
          )}

          {/* Interactive Join / Scan Code Redemption */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleRedeem(redeemInput);
            }}
            className="pt-4 border-t border-amber-200/15 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-stone-100 flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-amber-300" aria-hidden="true" />
                Pindai Kamera atau Masukkan Kode QR Rekan
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScannerOpen((v) => !v)}
                  className="text-xs font-medium text-[#FDBA74] hover:text-amber-200 hover:underline cursor-pointer"
                >
                  {scannerOpen ? 'Tutup Pemindai Kamera' : 'Buka Kamera Pindai QR'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="join-member-name" className="sr-only">
                  Nama Anda atau Perangkat
                </label>
                <input
                  id="join-member-name"
                  type="text"
                  value={joinDisplayName}
                  onChange={(e) => setJoinDisplayName(e.target.value)}
                  placeholder={mode === 'pair' ? 'Nama perangkat (opsional)' : 'Catatan / nama (opsional)'}
                  className="w-full px-3 py-2 text-xs bg-stone-900/80 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-300/60"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <label htmlFor="join-code-input" className="sr-only">
                  Kode Barcode atau Tautan QR Handrawina
                </label>
                <input
                  id="join-code-input"
                  type="text"
                  value={redeemInput}
                  onChange={(e) => setRedeemInput(e.target.value)}
                  placeholder="Tempel kode HND-INV-... atau tautan QR"
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-stone-900/80 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-300/60"
                />
                <button
                  type="submit"
                  disabled={redeemBusy || !redeemInput.trim()}
                  className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {redeemBusy ? 'Memproses...' : 'Gabung'}
                </button>
              </div>
            </div>

            {redeemFeedback && (
              <div
                data-testid="join-redeem-feedback"
                className={`p-3 rounded-md text-xs border ${
                  redeemFeedback.ok
                    ? 'bg-[#3A2B14]/80 border-[#FDBA74]/40 text-amber-100'
                    : 'bg-red-950/60 border-red-400/35 text-red-200'
                }`}
              >
                {redeemFeedback.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
