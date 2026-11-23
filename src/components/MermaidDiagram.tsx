import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { Check, Code2, Copy, Eye, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

let mermaidInitialized = false;

function ensureMermaidInit() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      fontFamily: '"Public Sans", system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      primaryColor: '#F0FDFA',
      primaryTextColor: '#0F172A',
      primaryBorderColor: '#0F766E',
      secondaryColor: '#F8FAFC',
      secondaryTextColor: '#0F172A',
      secondaryBorderColor: '#CBD5E1',
      tertiaryColor: '#FFFFFF',
      tertiaryTextColor: '#334155',
      tertiaryBorderColor: '#E2E8F0',
      lineColor: '#475569',
      actorBkg: '#F0FDFA',
      actorBorder: '#0F766E',
      actorTextColor: '#0F172A',
      actorLineColor: '#94A3B8',
      signalColor: '#1E293B',
      signalTextColor: '#0F172A',
      noteBkgColor: '#FEF9C3',
      noteBorderColor: '#CA8A04',
      noteTextColor: '#422006',
      clusterBkg: '#F8FAFC',
      clusterBorder: '#CBD5E1',
      edgeLabelBackground: '#FFFFFF',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 16,
    },
    sequence: {
      mirrorActors: false,
      messageMargin: 36,
      boxMargin: 12,
      actorMargin: 56,
    },
    er: {
      layoutDirection: 'TB',
    },
  });
  mermaidInitialized = true;
}

interface MermaidDiagramProps {
  title: string;
  caption: string;
  code: string;
  diagramKey: string;
}

export function MermaidDiagram({ title, caption, code, diagramKey }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, '');
  const [viewMode, setViewMode] = useState<'visual' | 'source'>('visual');
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    ensureMermaidInit();

    async function renderGraph() {
      try {
        setRenderError(null);
        const uniqueId = `mmd-${diagramKey}-${reactId}-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueId, code);
        if (active) {
          setSvgMarkup(svg);
        }
      } catch (err) {
        if (active) {
          setRenderError(
            err instanceof Error ? err.message : 'Gagal merender diagram Mermaid.'
          );
        }
      }
    }

    renderGraph();
    return () => {
      active = false;
    };
  }, [code, diagramKey, reactId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="my-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{caption}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label={`Mode tampilan ${title}`}
            className="inline-flex items-center p-0.5 bg-slate-200/80 rounded-md"
          >
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'visual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              Diagram Visual
            </button>
            <button
              type="button"
              onClick={() => setViewMode('source')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'source'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
              Kode Mermaid
            </button>
          </div>

          {viewMode === 'visual' && (
            <div className="inline-flex items-center border border-slate-200 bg-white rounded-md">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(70, z - 15))}
                aria-label={`Perkecil diagram ${title}`}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono tabular-nums text-slate-700 border-x border-slate-200">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(160, z + 15))}
                aria-label={`Perbesar diagram ${title}`}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {zoom !== 100 && (
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  aria-label={`Reset zoom diagram ${title}`}
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-l border-slate-200 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Salin Mermaid
              </>
            )}
          </button>
        </div>
      </div>

      {viewMode === 'visual' ? (
        <div
          className="p-5 overflow-auto max-h-[640px] bg-white min-h-[260px]"
          data-testid={`mermaid-visual-${diagramKey}`}
        >
          {renderError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              <p className="font-medium">Gagal merender diagram secara visual</p>
              <p className="text-xs mt-1 font-mono">{renderError}</p>
            </div>
          ) : !svgMarkup ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-slate-500">
              Merender diagram arsitektur...
            </div>
          ) : (
            <div
              className="mermaid-canvas origin-top-left transition-transform duration-150"
              style={{
                width: `${zoom}%`,
                minWidth: '100%',
              }}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          )}
        </div>
      ) : (
        <div
          className="p-5 bg-slate-950 text-slate-100 overflow-x-auto"
          data-testid={`mermaid-source-${diagramKey}`}
        >
          <pre className="text-xs leading-relaxed font-mono whitespace-pre">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </figure>
  );
}
