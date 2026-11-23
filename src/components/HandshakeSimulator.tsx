import { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import {
  clampHandshakeStep,
  getHandshakeScenario,
  HANDSHAKE_SCENARIOS,
  type HandshakeScenarioId,
  type HandshakePartyState,
} from '../utils/architectureCalc';

const SENSITIVITY_LABEL: Record<
  HandshakePartyState['items'][number]['sensitivity'],
  { text: string; className: string }
> = {
  private: { text: 'Privat Lokal', className: 'text-teal-800 font-medium' },
  ephemeral: { text: 'Ephemeral / Dihapus', className: 'text-amber-800 font-medium' },
  public: { text: 'Publik / Routing', className: 'text-slate-600' },
  'zero-knowledge': { text: 'Zero-Knowledge', className: 'text-slate-900 font-semibold' },
};

export function HandshakeSimulator({
  defaultScenario = 'x3dh-ratchet',
}: {
  defaultScenario?: HandshakeScenarioId;
}) {
  const [scenarioId, setScenarioId] = useState<HandshakeScenarioId>(defaultScenario);
  const [stepIndex, setStepIndex] = useState<number>(0);

  const scenario = getHandshakeScenario(scenarioId);
  const currentIndex = clampHandshakeStep(scenario, stepIndex);
  const activeStep = scenario.steps[currentIndex];

  const handleSelectScenario = (id: HandshakeScenarioId) => {
    setScenarioId(id);
    setStepIndex(0);
  };

  const renderPartyColumn = (party: HandshakePartyState, isServer = false) => (
    <div
      className={`p-4 rounded-md border ${
        isServer ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200'
      }`}
    >
      <div className="text-xs font-semibold text-slate-900 pb-2.5 mb-3 border-b border-slate-200">
        {party.roleLabel}
      </div>
      <dl className="space-y-3">
        {party.items.map((item) => {
          const meta = SENSITIVITY_LABEL[item.sensitivity];
          return (
            <div key={item.key} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="font-mono font-medium text-slate-900">{item.key}</dt>
                <span className={`text-[11px] shrink-0 ${meta.className}`}>{meta.text}</span>
              </div>
              <dd className="text-slate-600 mt-0.5 leading-relaxed">{item.value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );

  return (
    <section
      aria-label="Simulator Interaktif Pertukaran Kunci Kriptografi"
      className="my-8 bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Simulator Alur Pertukaran Kunci (Handshake Inspector)
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Telusuri status memori kriptografi antar-perangkat dan verifikasi sifat zero-knowledge server di setiap langkah.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Pilih protokol simulasi"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-md"
        >
          {HANDSHAKE_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              role="tab"
              type="button"
              aria-selected={sc.id === scenarioId}
              onClick={() => handleSelectScenario(sc.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sc.id === scenarioId
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sc.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* Stepper progress buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pilih langkah simulasi">
            {scenario.steps.map((st, idx) => (
              <button
                key={st.stepNumber}
                type="button"
                onClick={() => setStepIndex(idx)}
                className={`px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border transition-colors duration-100 whitespace-nowrap shrink-0 cursor-pointer ${
                  idx === currentIndex
                    ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                    : idx < currentIndex
                    ? 'bg-teal-50 text-teal-950 border-teal-300 hover:bg-teal-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Langkah {st.stepNumber}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(scenario.steps.length - 1, i + 1))}
              disabled={currentIndex === scenario.steps.length - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 border border-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Berikutnya
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setStepIndex(0)}
              aria-label="Ulangi simulasi dari langkah 1"
              className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Active step explanation & cryptographic formula */}
        <div className="py-4" data-testid="handshake-active-step">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-base font-semibold text-slate-900">
              {activeStep.stepNumber}. {activeStep.title}
            </h4>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Langkah {activeStep.stepNumber} dari {scenario.steps.length}
            </span>
          </div>
          <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{activeStep.summary}</p>

          <div className="mt-3 p-3.5 bg-slate-950 text-teal-200 rounded-md overflow-x-auto">
            <div className="text-[11px] text-slate-400 mb-1">Operasi Kriptografi</div>
            <code className="text-xs font-mono whitespace-pre">{activeStep.formula}</code>
          </div>

          <p className="text-xs text-teal-900 mt-2.5 font-medium">
            Jaminan Keamanan: <span className="font-normal text-slate-700">{activeStep.securityProperty}</span>
          </p>
        </div>

        {/* 3-party state inspection grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {renderPartyColumn(activeStep.initiator, false)}
          {renderPartyColumn(activeStep.server, true)}
          {renderPartyColumn(activeStep.responder, false)}
        </div>
      </div>
    </section>
  );
}
