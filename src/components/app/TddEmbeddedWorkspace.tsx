import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Download } from 'lucide-react';
import { TDD_SECTIONS, type SectionId } from '../../data/tddContent';
import { ActiveTddSection } from '../TddSections';
import { generateFullTddMarkdown } from '../../utils/markdownExport';

export function TddEmbeddedWorkspace() {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState(false);

  const currentIndex = useMemo(
    () => TDD_SECTIONS.findIndex((s) => s.id === activeSection),
    [activeSection]
  );
  const currentMeta = TDD_SECTIONS[currentIndex] ?? TDD_SECTIONS[0];
  const prevSection = currentIndex > 0 ? TDD_SECTIONS[currentIndex - 1] : null;
  const nextSection =
    currentIndex < TDD_SECTIONS.length - 1 ? TDD_SECTIONS[currentIndex + 1] : null;

  const handleDownloadMarkdown = () => {
    const content = generateFullTddMarkdown();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'handrawina-technical-design-document.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadedNotice(true);
    window.setTimeout(() => setDownloadedNotice(false), 2200);
  };

  const handleCopyFullMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(generateFullTddMarkdown());
      setCopiedMarkdown(true);
      window.setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      setCopiedMarkdown(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-stone-950/38 backdrop-blur-md">
      <aside
        aria-label="Daftar isi dokumen teknis"
        className="hidden lg:flex flex-col w-[264px] shrink-0 border-r border-amber-200/15 bg-stone-950/74 backdrop-blur-xl px-4 py-6 overflow-y-auto"
      >
        <div className="space-y-6">
          <div>
            <div className="px-3 text-xs font-semibold text-amber-200/75 mb-2">
              Dokumen Rancangan Teknis
            </div>
            <nav className="space-y-1">
              {TDD_SECTIONS.map((sec) => {
                const isActive = sec.id === activeSection;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSection(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-baseline gap-2.5 transition-colors cursor-pointer border ${
                      isActive
                        ? 'bg-amber-300/15 text-amber-100 border-amber-300/30 font-semibold'
                        : 'text-stone-300 border-transparent hover:bg-white/5 hover:text-stone-100'
                    }`}
                  >
                    <span
                      className={`font-mono text-xs tabular-nums shrink-0 ${
                        isActive ? 'text-amber-300' : 'text-stone-500'
                      }`}
                    >
                      {sec.number}.
                    </span>
                    <span className="truncate">{sec.shortTitle}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-5 border-t border-amber-200/15 px-3 space-y-2.5">
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
            >
              {downloadedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  TDD Diunduh
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Unduh Markdown (.md)
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyFullMarkdown}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-200 bg-stone-900/75 border border-stone-700/80 rounded-md hover:bg-stone-800/85 hover:text-white transition-colors cursor-pointer"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                  Markdown Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Salin Seluruh Dokumen
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-7 lg:px-10 py-6 sm:py-8">
        <article className="max-w-[1000px] mx-auto bg-[#FAF8F3]/95 backdrop-blur-md text-slate-900 rounded-xl border border-amber-200/25 shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-5 sm:p-8 lg:p-10">
          {/* Mobile chapter selector */}
          <div className="lg:hidden mb-5">
            <label htmlFor="mobile-tdd-chapter" className="block text-xs font-medium text-slate-600 mb-1">
              Pilih Bab Rancangan Teknis
            </label>
            <select
              id="mobile-tdd-chapter"
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value as SectionId)}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md text-slate-900 focus:outline-none focus:border-amber-600"
            >
              {TDD_SECTIONS.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.number}. {sec.shortTitle}
                </option>
              ))}
            </select>
          </div>

          <header className="pb-6 mb-8 border-b border-stone-200">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 font-mono tabular-nums mb-2">
              <span>Bab {currentMeta.number} dari 0{TDD_SECTIONS.length}</span>
              <span aria-hidden="true">·</span>
              <span>Technical Design Document Handrawina</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900">
              {currentMeta.number}. {currentMeta.title}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-3xl leading-relaxed">
              {currentMeta.subtitle}
            </p>
          </header>

          <ActiveTddSection sectionId={activeSection} />

          <nav
            aria-label="Navigasi antar bab TDD"
            className="mt-12 pt-6 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4"
          >
            {prevSection ? (
              <button
                type="button"
                onClick={() => setActiveSection(prevSection.id)}
                className="inline-flex items-center gap-2.5 px-4 py-2.5 text-left bg-white border border-stone-200 rounded-md hover:border-amber-600 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-[11px] text-slate-500">Bab Sebelumnya</div>
                  <div className="text-sm font-medium text-slate-900">
                    {prevSection.number}. {prevSection.shortTitle}
                  </div>
                </div>
              </button>
            ) : (
              <div />
            )}

            {nextSection && (
              <button
                type="button"
                onClick={() => setActiveSection(nextSection.id)}
                className="inline-flex items-center gap-2.5 px-4 py-2.5 text-right bg-white border border-stone-200 rounded-md hover:border-amber-600 transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-[11px] text-slate-500">Bab Berikutnya</div>
                  <div className="text-sm font-medium text-slate-900">
                    {nextSection.number}. {nextSection.shortTitle}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
              </button>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
