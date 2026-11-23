import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { AkuAiEmblem } from './AkuAiEmblem';
import {
  AKU_AI_QUICK_PROMPTS,
  type AkuAiMessage,
} from '../../utils/akuAiHelpers';

interface AkuAiWorkspaceProps {
  userName: string;
  activeConversationName?: string;
  initialPrompt?: string | null;
  onConsumeInitialPrompt: () => void;
  onClose: () => void;
  onCopyToChat?: (text: string) => void;
}

function nowClock(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AkuAiWorkspace({
  userName,
  activeConversationName,
  initialPrompt,
  onConsumeInitialPrompt,
  onClose,
  onCopyToChat,
}: AkuAiWorkspaceProps) {
  const [messages, setMessages] = useState<AkuAiMessage[]>([
    {
      id: 'aku-ai-welcome',
      role: 'assistant',
      text: `Halo ${userName}! Saya Aku AI, asisten cerdas di dalam Handrawina. Tanyakan apa saja—mulai dari menyusun balasan pesan, merangkum topik obrolan, membuat pengumuman komunitas, hingga ide pembaruan Status.`,
      timestamp: nowClock(),
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<AkuAiMessage[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  const sendPrompt = useCallback(
    async (rawText: string) => {
      const cleaned = rawText.trim();
      if (!cleaned || busy) return;

      const userMsg: AkuAiMessage = {
        id: `aku-user-${Date.now()}`,
        role: 'user',
        text: cleaned,
        timestamp: nowClock(),
      };

      const historyPayload = messagesRef.current
        .filter((m) => !m.isError && m.id !== 'aku-ai-welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setBusy(true);
      setLastError(null);

      try {
        const res = await fetch('/api/aku-ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: cleaned,
            history: historyPayload,
            activeConversationName,
          }),
        });
        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok || !data.reply) {
          const errText =
            data.error ?? 'Aku AI sedang mengalami kendala saat memproses permintaan Anda.';
          setLastError(errText);
          setMessages((prev) => [
            ...prev,
            {
              id: `aku-err-${Date.now()}`,
              role: 'assistant',
              text: errText,
              timestamp: nowClock(),
              isError: true,
            },
          ]);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `aku-bot-${Date.now()}`,
            role: 'assistant',
            text: data.reply!,
            timestamp: nowClock(),
          },
        ]);
      } catch {
        const errText = 'Tidak dapat terhubung ke layanan Aku AI. Periksa koneksi lalu coba lagi.';
        setLastError(errText);
        setMessages((prev) => [
          ...prev,
          {
            id: `aku-net-${Date.now()}`,
            role: 'assistant',
            text: errText,
            timestamp: nowClock(),
            isError: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [activeConversationName, busy]
  );

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      const promptToSend = initialPrompt.trim();
      onConsumeInitialPrompt();
      void sendPrompt(promptToSend);
    }
  }, [initialPrompt, onConsumeInitialPrompt, sendPrompt]);

  const handleReset = () => {
    setLastError(null);
    setMessages([
      {
        id: 'aku-ai-welcome',
        role: 'assistant',
        text: `Sesi baru dimulai. Halo ${userName}, ada yang bisa Aku AI bantu hari ini?`,
        timestamp: nowClock(),
      },
    ]);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore clipboard unavailability in restricted environments
    }
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1800);
  };

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#071329]/45"
      data-testid="aku-ai-workspace"
    >
      {/* Header */}
      <header className="px-4 sm:px-5 py-3 bg-[#0B1D3A]/90 backdrop-blur-md border-b border-[#FDBA74]/22 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Kembali ke obrolan"
            className="lg:hidden p-2 -ml-2 text-stone-200 hover:bg-white/10 rounded-full min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <AkuAiEmblem size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-display font-bold text-white truncate">
                Aku AI
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-[#3A2B14]/90 text-[#FDBA74] border border-[#FDBA74]/35">
                <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
                Asisten
              </span>
            </div>
            <p className="text-xs text-slate-300 truncate">
              Asisten cerdas Handrawina · Siap membantu kapan saja
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            aria-label="Mulai ulang sesi Aku AI"
            title="Sesi Baru"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-100 bg-[#102A54]/90 hover:bg-[#173668] border border-amber-200/20 rounded-full transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FDBA74]" aria-hidden="true" />
            <span className="hidden sm:inline">Sesi Baru</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Aku AI"
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Starter Prompt Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#071329]/72 border-b border-amber-200/12 flex items-center gap-2 overflow-x-auto shrink-0">
        <span className="text-[11px] font-medium text-[#FDBA74] whitespace-nowrap shrink-0">
          Saran cepat:
        </span>
        {AKU_AI_QUICK_PROMPTS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => void sendPrompt(item.prompt)}
            className="px-3 py-1 text-xs text-stone-100 bg-[#102A54]/85 hover:bg-[#3B2318]/90 border border-amber-300/22 hover:border-[#FDBA74]/50 rounded-full whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && <AkuAiEmblem size="md" className="mt-0.5" />}

              <div
                className={`max-w-[85%] sm:max-w-[74%] rounded-2xl px-4 py-3 border shadow-lg ${
                  isUser
                    ? 'bg-gradient-to-br from-[#3B2318]/94 to-[#291812]/94 text-stone-50 border-[#FDBA74]/28 rounded-tr-sm'
                    : msg.isError
                    ? 'bg-red-950/75 text-red-100 border-red-400/35 rounded-tl-sm'
                    : 'bg-[#0B1D3A]/92 text-stone-100 border-amber-300/22 rounded-tl-sm'
                }`}
              >
                {!isUser && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FDBA74] mb-1">
                    {msg.isError && <AlertCircle className="w-3.5 h-3.5 text-red-300" />}
                    <span>Aku AI</span>
                  </div>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.text}
                </p>

                <div className="flex items-center justify-between gap-4 mt-2 text-[11px] text-slate-300/85">
                  <div className="flex items-center gap-2">
                    {!isUser && !msg.isError && msg.id !== 'aku-ai-welcome' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopy(msg.id, msg.text)}
                          className="inline-flex items-center gap-1 text-amber-200/90 hover:text-amber-100 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-[#FDBA74]" />
                              Disalin
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Salin
                            </>
                          )}
                        </button>
                        {onCopyToChat && activeConversationName && (
                          <button
                            type="button"
                            onClick={() => onCopyToChat(msg.text)}
                            className="inline-flex items-center gap-1 text-[#FDBA74] hover:text-[#FFEDD5] cursor-pointer"
                          >
                            Pakai di {activeConversationName}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex items-start gap-2.5 justify-start">
            <AkuAiEmblem size="md" className="mt-0.5" />
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#0B1D3A]/92 border border-amber-300/22 text-sm text-slate-300 inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#FDBA74]" />
              <span>Aku AI sedang menyiapkan jawaban...</span>
            </div>
          </div>
        )}

        {lastError && !busy && (
          <div className="text-xs text-red-200/90 bg-red-950/50 border border-red-400/25 rounded-xl px-3.5 py-2">
            {lastError}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <footer className="px-4 py-3 bg-[#0B1D3A]/92 backdrop-blur-md border-t border-[#FDBA74]/20 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendPrompt(input);
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="aku-ai-composer" className="sr-only">
            Tulis pertanyaan untuk Aku AI
          </label>
          <input
            id="aku-ai-composer"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanya Aku AI apa saja..."
            disabled={busy}
            className="flex-1 min-w-0 px-4 py-2.5 text-sm bg-[#102A54]/90 border border-amber-300/25 rounded-full text-stone-100 placeholder:text-slate-400 focus:outline-none focus:border-[#FDBA74]/70 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Kirim ke Aku AI"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 disabled:opacity-40 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Tanya</span>
          </button>
        </form>
      </footer>
    </div>
  );
}
