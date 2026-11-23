import { useState } from 'react';
import { calculateGroupFanoutMetrics } from '../utils/architectureCalc';

function formatKb(kb: number): string {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(2)} MB`;
  }
  return `${kb.toFixed(2)} KB`;
}

export function GroupScaleCalculator() {
  const [participants, setParticipants] = useState<number>(1500);
  const [avgDevicesPerUser, setAvgDevicesPerUser] = useState<number>(2);
  const [messageSizeKb, setMessageSizeKb] = useState<number>(4);

  const metrics = calculateGroupFanoutMetrics({
    participants,
    avgDevicesPerUser,
    messageSizeKb,
  });

  const senderBarWidthPct = Math.max(
    1,
    Math.min(100, (metrics.senderKeyClientUploadKb / Math.max(1, metrics.pairwiseClientUploadKb)) * 100)
  );

  return (
    <section
      aria-label="Kalkulator Efisiensi Enkripsi Grup Sender Keys"
      className="my-8 bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Kalkulator Skala Grup: Pairwise Signal vs Sender Keys
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Uji perbandingan beban enkripsi klien, bandwidth unggah, dan fan-out multi-device hingga 1.500 peserta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[50, 500, 1500].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setParticipants(preset)}
              className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                participants === preset
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {preset.toLocaleString('id-ID')} Peserta
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="calc-participants" className="text-xs font-medium text-slate-700">
                Jumlah Peserta Grup
              </label>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                {metrics.participants.toLocaleString('id-ID')}
              </span>
            </div>
            <input
              id="calc-participants"
              type="range"
              min={2}
              max={1500}
              step={1}
              value={participants}
              onChange={(e) => setParticipants(Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
              <span>2</span>
              <span>750</span>
              <span>1.500</span>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="calc-devices" className="text-xs font-medium text-slate-700">
                Rata-Rata Perangkat / Akun
              </label>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                {metrics.avgDevicesPerUser} perangkat
              </span>
            </div>
            <input
              id="calc-devices"
              type="range"
              min={1}
              max={5}
              step={1}
              value={avgDevicesPerUser}
              onChange={(e) => setAvgDevicesPerUser(Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
              <span>1 (Ponsel)</span>
              <span>3</span>
              <span>5 (Maks)</span>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="calc-payload" className="text-xs font-medium text-slate-700">
                Ukuran Payload Pesan
              </label>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                {metrics.messageSizeKb} KB
              </span>
            </div>
            <input
              id="calc-payload"
              type="range"
              min={1}
              max={64}
              step={1}
              value={messageSizeKb}
              onChange={(e) => setMessageSizeKb(Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
              <span>1 KB (Teks)</span>
              <span>32 KB</span>
              <span>64 KB (Metadata)</span>
            </div>
          </div>
        </div>

        {/* Metrics grid with tabular numerals */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200"
          data-testid="scale-metrics-grid"
        >
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600">Total Perangkat Tujuan</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
              {metrics.totalRecipientDevices.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Termasuk companion self-sync</div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600">Penghematan Operasi Enkripsi</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-teal-800 mt-1">
              {metrics.encryptionReductionPct}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              1 operasi vs {metrics.pairwiseEncryptions.toLocaleString('id-ID')} pairwise
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600">Efisiensi Bandwidth Unggah</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-teal-800 mt-1">
              {metrics.bandwidthSavingsFactor.toLocaleString('id-ID')}x
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {formatKb(metrics.senderKeyClientUploadKb)} vs {formatKb(metrics.pairwiseClientUploadKb)}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600">Estimasi Fan-Out Server BEAM</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
              {metrics.estimatedServerFanoutMs} ms
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Rotasi SKDM saat eviksi: {metrics.rotationSkdmMessages.toLocaleString('id-ID')} paket
            </div>
          </div>
        </div>

        {/* Visual bar comparison */}
        <div className="space-y-3 pt-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">
                Tanpa Sender Keys (Pairwise Signal O(N x D))
              </span>
              <span className="font-mono tabular-nums text-slate-700">
                {formatKb(metrics.pairwiseClientUploadKb)} unggah klien / pesan
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-sm overflow-hidden">
              <div className="h-full bg-slate-400 w-full" />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-teal-900">
                Dengan Sender Keys (Enkripsi Klien O(1) + Fan-Out Server)
              </span>
              <span className="font-mono tabular-nums text-teal-800 font-semibold">
                {formatKb(metrics.senderKeyClientUploadKb)} unggah klien / pesan
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-teal-700 transition-all duration-150"
                style={{ width: `${senderBarWidthPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
