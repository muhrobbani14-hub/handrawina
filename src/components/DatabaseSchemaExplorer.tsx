import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { DATABASE_ENGINES, type DatabaseEngineSpec } from '../data/tddContent';

export function DatabaseSchemaExplorer() {
  const [activeEngineId, setActiveEngineId] = useState<DatabaseEngineSpec['id']>('postgres');
  const [copied, setCopied] = useState<boolean>(false);

  const engine = DATABASE_ENGINES.find((e) => e.id === activeEngineId) ?? DATABASE_ENGINES[0];

  const handleCopyDdl = async () => {
    try {
      await navigator.clipboard.writeText(engine.ddl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="Penjelajah Skema Database Multi-Engine"
      className="my-8 bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Spesifikasi Penyimpanan Multi-Engine & Skrip DDL
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Pilih mesin penyimpanan untuk memeriksa tabel, kunci partisi, kebijakan retensi zero-knowledge, dan skrip DDL.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Pilih mesin database"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-md"
        >
          {DATABASE_ENGINES.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={item.id === activeEngineId}
              onClick={() => {
                setActiveEngineId(item.id);
                setCopied(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                item.id === activeEngineId
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-6" data-testid={`db-engine-${engine.id}`}>
        {/* Engine operational metadata */}
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-xs">
          <div>
            <dt className="text-slate-500 font-medium">Model Konsistensi</dt>
            <dd className="text-slate-900 mt-1 leading-relaxed">{engine.consistency}</dd>
          </div>
          <div>
            <dt className="text-slate-500 font-medium">Strategi Partisi & Sharding</dt>
            <dd className="text-slate-900 mt-1 leading-relaxed">{engine.shardingStrategy}</dd>
          </div>
          <div>
            <dt className="text-slate-500 font-medium">Kebijakan Retensi & TTL</dt>
            <dd className="text-slate-900 mt-1 leading-relaxed">{engine.retentionPolicy}</dd>
          </div>
        </dl>

        {/* Entity summary table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Tabel / Keyspace</th>
                <th className="py-2.5 pr-4 font-medium">Fungsi Utama</th>
                <th className="py-2.5 pr-4 font-medium">Partition Key</th>
                <th className="py-2.5 font-medium">Catatan Keamanan & Performa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {engine.tables.map((tbl) => (
                <tr key={tbl.name} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 pr-4 font-mono font-medium text-teal-900 whitespace-nowrap">
                    {tbl.name}
                  </td>
                  <td className="py-3 pr-4 text-slate-800">{tbl.purpose}</td>
                  <td className="py-3 pr-4 font-mono text-slate-700 whitespace-nowrap">
                    {tbl.partitionKey}
                  </td>
                  <td className="py-3 text-slate-600">{tbl.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* DDL Code Viewer */}
        <div className="rounded-md overflow-hidden border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900">
            <span className="text-xs font-mono text-slate-300">
              {engine.name} — Skrip Definisi Skema
            </span>
            <button
              type="button"
              onClick={handleCopyDdl}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Salin DDL
                </>
              )}
            </button>
          </div>
          <div className="p-4 overflow-x-auto">
            <pre className="text-xs leading-relaxed font-mono text-slate-100 whitespace-pre">
              <code>{engine.ddl}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
