import { useState } from 'react';
import { Laptop, Plus, QrCode, Smartphone, Trash2 } from 'lucide-react';
import type { PairedDevice } from '../../types/handrawina';
import type { JoinBarcodeMode } from './JoinBarcodeModal';

interface SecurityDevicesWorkspaceProps {
  devices: PairedDevice[];
  onPairDevice: (name: string, platform: PairedDevice['platform']) => Promise<void>;
  onRevokeDevice: (deviceId: string) => Promise<void>;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
}

export function SecurityDevicesWorkspace({
  devices,
  onPairDevice,
  onRevokeDevice,
  onOpenJoinBarcode,
}: SecurityDevicesWorkspaceProps) {
  const [deviceName, setDeviceName] = useState('');
  const [devicePlatform, setDevicePlatform] = useState<PairedDevice['platform']>('Desktop');
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const handleAddDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = deviceName.trim();
    if (!name) {
      setDeviceError('Masukkan nama perangkat companion.');
      return;
    }

    setDeviceError(null);
    try {
      await onPairDevice(name, devicePlatform);
      setDeviceName('');
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : 'Gagal menautkan perangkat.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-stone-950/42 backdrop-blur-md px-5 sm:px-8 py-8 text-stone-100">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="pb-5 border-b border-amber-200/15">
          <h1 className="text-2xl font-display font-bold text-amber-50">Perangkat Tertaut</h1>
          <p className="text-sm text-stone-300 mt-1">
            Kelola perangkat yang terdaftar pada akun Handrawina Anda.
          </p>
        </header>

        <section
          aria-label="Manajemen perangkat tertaut"
          className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-amber-200/12 bg-stone-950/55 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-amber-50">
                Perangkat ({devices.length})
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                Perangkat tersinkron melalui akun cloud Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenJoinBarcode('pair')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-300/25 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              QR Pairing
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="divide-y divide-amber-200/10 border border-amber-200/15 rounded-md bg-stone-900/50">
              {devices.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-stone-400">
                  Belum ada perangkat tertaut.
                </p>
              ) : (
                devices.map((device) => (
                  <div
                    key={device.deviceId}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {device.isPrimary ? (
                        <Smartphone className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
                      ) : (
                        <Laptop className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-100 truncate">
                          {device.name}
                        </div>
                        <div className="text-xs text-stone-400 font-mono">
                          {device.platform} · {device.lastActive}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={device.online ? 'text-xs text-[#FDBA74]' : 'text-xs text-stone-400'}>
                        {device.online ? 'Online' : 'Offline'}
                      </span>
                      {!device.isPrimary && (
                        <button
                          type="button"
                          onClick={() => void onRevokeDevice(device.deviceId)}
                          aria-label={`Cabut perangkat ${device.name}`}
                          className="p-1.5 text-stone-400 hover:text-red-300 hover:bg-red-950/60 rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddDevice} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label htmlFor="pair-dev-name" className="block text-xs font-medium text-stone-300 mb-1">
                  Nama Perangkat
                </label>
                <input
                  id="pair-dev-name"
                  type="text"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  placeholder="Mis. Handrawina Desktop"
                  className="w-full px-3 py-2 text-sm border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label htmlFor="pair-dev-platform" className="block text-xs font-medium text-stone-300 mb-1">
                  Platform
                </label>
                <select
                  id="pair-dev-platform"
                  value={devicePlatform}
                  onChange={(event) => setDevicePlatform(event.target.value as PairedDevice['platform'])}
                  className="w-full px-3 py-2 text-sm border border-amber-200/20 rounded-md bg-stone-900 text-stone-100"
                >
                  <option value="Desktop">Desktop</option>
                  <option value="Web">Web Browser</option>
                  <option value="Android">Android</option>
                  <option value="iOS">iOS</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={devices.length >= 5}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-md h-[38px] cursor-pointer whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Tautkan
              </button>
            </form>
            {deviceError && <p className="text-xs text-red-400 font-medium">{deviceError}</p>}
          </div>
        </section>

        <p className="text-xs text-stone-400">
          Migrasi nomor dan cloud backup belum tersedia pada penyimpanan cloud aplikasi.
        </p>
      </div>
    </div>
  );
}
