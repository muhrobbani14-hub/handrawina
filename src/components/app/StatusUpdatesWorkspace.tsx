import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AccountProfile,
  StatusAudience,
  StatusTheme,
  StatusUpdate,
} from '../../types/handrawina';
import {
  STATUS_THEMES,
  groupStatusesByViewed,
  validateStatusDraft,
} from '../../utils/statusAndCommunities';

interface StatusUpdatesWorkspaceProps {
  account: AccountProfile;
  statuses: StatusUpdate[];
  onCreateStatus: (params: {
    text: string;
    theme: StatusTheme;
    audience: StatusAudience;
    captionTag?: string;
  }) => Promise<{ ok: boolean; error?: string; createdId?: string }>;
  onMarkViewed: (statusId: string) => Promise<void>;
  onDeleteStatus: (statusId: string) => Promise<void>;
  onReplyToStatus: (params: {
    status: StatusUpdate;
    replyText: string;
  }) => Promise<void>;
  onOpenChat: (conversationId: string) => void;
}

const AUDIENCE_LABELS: Record<StatusAudience, string> = {
  'all-contacts': 'Semua Kontak Terverifikasi',
  'close-circle': 'Lingkaran Dekat Saja',
  'selected-groups': 'Anggota Grup & Komunitas',
};

export function StatusUpdatesWorkspace({
  account,
  statuses,
  onCreateStatus,
  onMarkViewed,
  onDeleteStatus,
  onReplyToStatus,
  onOpenChat,
}: StatusUpdatesWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(statuses[0]?.id ?? null);
  const [composing, setComposing] = useState<boolean>(false);
  const [mobileShowDetail, setMobileShowDetail] = useState<boolean>(false);

  // Composer form state
  const [draftText, setDraftText] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [draftTheme, setDraftTheme] = useState<StatusTheme>('champagne');
  const [draftAudience, setDraftAudience] = useState<StatusAudience>('all-contacts');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  const isOwnStatus = (authorId: string) =>
    authorId === 'self' || authorId === account.accountId;

  const grouped = useMemo(
    () =>
      groupStatusesByViewed(
        statuses.map((s) => (isOwnStatus(s.authorId) ? { ...s, authorId: 'self' } : s)),
        'self'
      ),
    [statuses, account.accountId]
  );

  const orderedStatuses = useMemo(
    () => [...grouped.mine, ...grouped.unviewedContacts, ...grouped.viewedContacts],
    [grouped]
  );

  const activeStatus = useMemo(() => {
    if (!orderedStatuses.length) return null;
    return orderedStatuses.find((s) => s.id === selectedId) ?? orderedStatuses[0];
  }, [orderedStatuses, selectedId]);

  const activeIndex = activeStatus
    ? orderedStatuses.findIndex((s) => s.id === activeStatus.id)
    : -1;

  // Automatically mark a contact's status as viewed when opened on the stage
  useEffect(() => {
    if (!composing && activeStatus && !isOwnStatus(activeStatus.authorId) && !activeStatus.viewedByMe) {
      onMarkViewed(activeStatus.id).catch(() => {
        // Ignore transient network errors
      });
    }
  }, [composing, activeStatus, onMarkViewed, account.accountId]);

  const handleSelectStatus = (id: string) => {
    setSelectedId(id);
    setComposing(false);
    setMobileShowDetail(true);
    setReplyFeedback(null);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateStatusDraft({
      text: draftText,
      theme: draftTheme,
      audience: draftAudience,
      captionTag: draftTag,
    });
    if (!check.valid) {
      setComposerError(check.error ?? 'Status tidak valid.');
      return;
    }

    setPublishing(true);
    setComposerError(null);
    try {
      const res = await onCreateStatus({
        text: check.cleanText,
        theme: check.theme,
        audience: check.audience,
        captionTag: check.captionTag,
      });
      if (!res.ok) {
        setComposerError(res.error ?? 'Gagal menerbitkan status.');
        return;
      }
      setDraftText('');
      setDraftTag('');
      setComposing(false);
      if (res.createdId) {
        setSelectedId(res.createdId);
      }
      setMobileShowDetail(true);
    } finally {
      setPublishing(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStatus || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    setReplyFeedback(null);
    try {
      await onReplyToStatus({ status: activeStatus, replyText: replyText.trim() });
      setReplyText('');
      setReplyFeedback(`Balasan terenkripsi E2EE terkirim ke ${activeStatus.authorName}.`);
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!activeStatus || activeStatus.authorId !== 'self') return;
    const nextCandidate = orderedStatuses.find((s) => s.id !== activeStatus.id)?.id ?? null;
    await onDeleteStatus(activeStatus.id);
    setSelectedId(nextCandidate);
  };

  const activeThemeMeta =
    STATUS_THEMES.find((t) => t.id === (composing ? draftTheme : activeStatus?.theme)) ??
    STATUS_THEMES[1];

  return (
    <div className="flex-1 flex min-h-0 bg-stone-950/24 overflow-hidden">
      {/* LEFT PANE: My Status + Recent & Viewed Contact Updates */}
      <aside
        aria-label="Daftar pembaruan dan status kontak"
        className={`${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        } flex-col w-full lg:w-[340px] xl:w-[376px] shrink-0 border-r border-amber-200/15 bg-stone-950/72 backdrop-blur-md min-h-0`}
      >
        <div className="p-4 border-b border-amber-200/12 bg-stone-950/50 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-display font-bold text-amber-50 truncate">
              Pembaruan &amp; Status
            </h1>
            <p className="text-xs text-stone-400 truncate">
              Terenkripsi E2EE · Otomatis hilang dalam 24 jam
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setComposerError(null);
              setMobileShowDetail(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Buat Status
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-amber-200/10">
          {/* Status Saya */}
          <section className="p-3.5 space-y-2" aria-label="Status saya">
            <div className="px-1 text-[11px] font-semibold text-amber-200/80">
              Status Saya ({grouped.mine.length})
            </div>
            {grouped.mine.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setComposing(true);
                  setMobileShowDetail(true);
                }}
                className="w-full text-left p-3 rounded-lg border border-dashed border-amber-300/30 bg-stone-900/50 hover:bg-stone-900/80 transition-colors flex items-center gap-3 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-amber-400/15 border border-amber-300/40 text-amber-200 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-100">
                    Bagikan Pembaruan Pertama Anda
                  </div>
                  <div className="text-[11px] text-stone-400 truncate">
                    Kirim catatan teks terenkripsi berdurasi 24 jam
                  </div>
                </div>
              </button>
            ) : (
              grouped.mine.map((item) => {
                const isSelected = !composing && activeStatus?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectStatus(item.id)}
                    className={`w-full text-left p-2.5 rounded-lg flex items-center gap-3 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-400/14 border-amber-300/35'
                        : 'bg-transparent border-transparent hover:bg-stone-900/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full p-[2px] border-2 border-amber-400 shrink-0">
                      <div className="w-full h-full rounded-full bg-stone-900 text-amber-200 text-xs font-display font-bold flex items-center justify-center">
                        {item.authorInitials}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-100 truncate">
                          {account.displayName}
                        </span>
                        <span className="text-[10px] font-mono text-stone-400 shrink-0">
                          {item.createdAt}
                        </span>
                      </div>
                      <p className="text-xs text-stone-300 truncate mt-0.5">{item.text}</p>
                      <div className="text-[11px] text-amber-300/90 mt-0.5 tabular-nums">
                        {item.viewerNames.length} kali dilihat · {item.expiresInLabel}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </section>

          {/* Pembaruan Terbaru (Belum Dilihat) */}
          <section className="p-3.5 space-y-2" aria-label="Pembaruan terbaru">
            <div className="px-1 text-[11px] font-semibold text-amber-200/80">
              Pembaruan Terbaru ({grouped.unviewedContacts.length})
            </div>
            {grouped.unviewedContacts.length === 0 ? (
              <p className="px-1 text-xs text-stone-400 py-2">
                Semua pembaruan kontak terbaru sudah Anda lihat.
              </p>
            ) : (
              grouped.unviewedContacts.map((item) => {
                const isSelected = !composing && activeStatus?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectStatus(item.id)}
                    className={`w-full text-left p-2.5 rounded-lg flex items-center gap-3 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-400/14 border-amber-300/35'
                        : 'bg-transparent border-transparent hover:bg-stone-900/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full p-[2px] border-2 border-amber-400 shrink-0">
                      <div className="w-full h-full rounded-full bg-stone-900 text-amber-100 text-xs font-display font-bold flex items-center justify-center">
                        {item.authorInitials}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-100 truncate">
                          {item.authorName}
                        </span>
                        <span className="text-[10px] font-mono text-amber-300 shrink-0">
                          Baru
                        </span>
                      </div>
                      <p className="text-xs text-stone-300 truncate mt-0.5">{item.text}</p>
                      <div className="text-[11px] text-stone-400 mt-0.5">
                        {item.createdAt}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </section>

          {/* Pembaruan Sudah Dilihat */}
          {grouped.viewedContacts.length > 0 && (
            <section className="p-3.5 space-y-2" aria-label="Pembaruan sudah dilihat">
              <div className="px-1 text-[11px] font-semibold text-stone-400">
                Sudah Dilihat ({grouped.viewedContacts.length})
              </div>
              {grouped.viewedContacts.map((item) => {
                const isSelected = !composing && activeStatus?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectStatus(item.id)}
                    className={`w-full text-left p-2.5 rounded-lg flex items-center gap-3 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-400/12 border-amber-300/30'
                        : 'bg-transparent border-transparent hover:bg-stone-900/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full p-[2px] border border-stone-600 shrink-0">
                      <div className="w-full h-full rounded-full bg-stone-900/90 text-stone-300 text-xs font-display font-bold flex items-center justify-center">
                        {item.authorInitials}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-200 truncate">
                          {item.authorName}
                        </span>
                        <span className="text-[10px] font-mono text-stone-500 shrink-0">
                          {item.createdAt}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 truncate mt-0.5">{item.text}</p>
                    </div>
                  </button>
                );
              })}
            </section>
          )}
        </div>
      </aside>

      {/* RIGHT PANE: Status Composer OR Luxury Status Stage */}
      <section
        aria-label={composing ? 'Buat pembaruan status baru' : 'Pratinjau pembaruan status aktif'}
        className={`${
          mobileShowDetail ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col min-w-0 min-h-0 overflow-y-auto px-5 sm:px-8 py-6`}
      >
        {composing ? (
          <div className="max-w-2xl w-full mx-auto space-y-5 my-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false);
                    setMobileShowDetail(false);
                  }}
                  aria-label="Kembali ke daftar status"
                  className="lg:hidden p-1.5 text-stone-300 hover:bg-stone-900/70 rounded-md cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-display font-bold text-amber-50">
                    Buat Pembaruan Status (24 Jam)
                  </h2>
                  <p className="text-xs text-stone-300">
                    Status dienkripsi ujung-ke-ujung dengan kunci Sender Keys khusus pemirsa Anda.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposing(false)}
                aria-label="Tutup editor status"
                className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-900/70 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Editorial Preview Card */}
            <div
              className={`rounded-xl border p-7 sm:p-9 min-h-[200px] flex flex-col justify-between shadow-2xl ${activeThemeMeta.surfaceClass} ${
                activeThemeMeta.isLight ? 'border-orange-950/20' : 'border-amber-200/25'
              }`}
            >
              <div className={`flex items-center justify-between gap-3 text-xs ${activeThemeMeta.mutedTextClass}`}>
                <span className={`font-semibold ${activeThemeMeta.accentClass}`}>
                  {draftTag.trim() || 'Pembaruan Handrawina'}
                </span>
                <span className="font-mono text-[11px]">
                  {AUDIENCE_LABELS[draftAudience]}
                </span>
              </div>
              <p className={`text-lg sm:text-xl font-display font-semibold leading-relaxed my-6 break-words ${activeThemeMeta.textClass}`}>
                {draftText.trim() || 'Pratinjau teks status Anda akan tampil elegan di sini...'}
              </p>
              <div className={`flex items-center justify-between text-[11px] font-mono ${activeThemeMeta.mutedTextClass}`}>
                <span>{account.displayName}</span>
                <span>Terenkripsi E2EE · 24 Jam</span>
              </div>
            </div>

            <form
              onSubmit={handlePublish}
              className="bg-stone-950/80 backdrop-blur-md border border-amber-200/15 rounded-xl p-5 space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="status-draft-text" className="text-xs font-medium text-stone-200">
                    Isi Pembaruan Status
                  </label>
                  <span className="text-[11px] font-mono text-stone-400 tabular-nums">
                    {draftText.length} / 420
                  </span>
                </div>
                <textarea
                  id="status-draft-text"
                  rows={3}
                  maxLength={420}
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    setComposerError(null);
                  }}
                  placeholder="Bagikan kabar terkini, progres proyek, atau catatan singkat kepada kontak Anda..."
                  className="w-full px-3.5 py-2.5 text-sm bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="status-draft-tag" className="block text-xs font-medium text-stone-200 mb-1">
                    Label Topik (Opsional)
                  </label>
                  <input
                    id="status-draft-tag"
                    type="text"
                    maxLength={40}
                    value={draftTag}
                    onChange={(e) => setDraftTag(e.target.value)}
                    placeholder="Mis. Rilis Produk, Agenda Hari Ini"
                    className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                  />
                </div>
                <div>
                  <label htmlFor="status-draft-audience" className="block text-xs font-medium text-stone-200 mb-1">
                    Privasi Pemirsa Status
                  </label>
                  <select
                    id="status-draft-audience"
                    value={draftAudience}
                    onChange={(e) => setDraftAudience(e.target.value as StatusAudience)}
                    className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 focus:outline-none focus:border-amber-400/75"
                  >
                    <option value="all-contacts">Semua Kontak Terverifikasi</option>
                    <option value="close-circle">Lingkaran Dekat Saja</option>
                    <option value="selected-groups">Anggota Grup &amp; Komunitas</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-stone-200 mb-2">
                  Nuansa Latar Kartu Status
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STATUS_THEMES.map((theme) => {
                    const selected = draftTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setDraftTheme(theme.id)}
                        aria-pressed={selected}
                        className={`px-3 py-2 rounded-md border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${theme.surfaceClass} ${
                          theme.isLight
                            ? selected
                              ? 'border-stone-950 ring-2 ring-amber-300/70 text-stone-950'
                              : 'border-orange-950/25 text-stone-950 hover:border-stone-950/60'
                            : selected
                            ? 'border-amber-400 text-amber-100'
                            : 'border-amber-200/20 text-stone-100 hover:border-amber-200/50'
                        }`}
                      >
                        <span className="truncate">{theme.label}</span>
                        {selected && (
                          <Check
                            className={`w-3.5 h-3.5 shrink-0 ${
                              theme.isLight ? 'text-stone-950' : 'text-amber-300'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {composerError && (
                <p
                  className="text-xs text-red-300 font-medium"
                  data-testid="status-composer-error"
                >
                  {composerError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-amber-200/10">
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-300 hover:text-stone-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  {publishing ? 'Menerbitkan...' : 'Terbitkan Status'}
                </button>
              </div>
            </form>
          </div>
        ) : activeStatus ? (
          <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center space-y-5">
            {/* Mobile Back + Story Progress Strip */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMobileShowDetail(false)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-xs font-medium text-amber-200 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Daftar Status
                </button>
                <div className="text-[11px] font-mono text-stone-400 ml-auto tabular-nums">
                  Pembaruan {activeIndex + 1} dari {orderedStatuses.length}
                </div>
              </div>

              <div className="flex items-center gap-1.5" aria-hidden="true">
                {orderedStatuses.map((st, idx) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStatus(st.id)}
                    className={`h-1 flex-1 rounded-full transition-colors cursor-pointer ${
                      idx === activeIndex
                        ? 'bg-amber-400'
                        : idx < activeIndex
                        ? 'bg-amber-200/45'
                        : 'bg-stone-700/80'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Active Editorial Status Stage */}
            <div
              data-testid="active-status-stage"
              className={`rounded-2xl border shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden ${activeThemeMeta.surfaceClass} ${
                activeThemeMeta.isLight ? 'border-orange-950/20' : 'border-amber-200/20'
              }`}
            >
              {/* Stage Header */}
              <div
                className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${
                  activeThemeMeta.isLight
                    ? 'border-stone-950/15 bg-white/25'
                    : 'border-amber-200/12 bg-black/25'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full border text-xs font-display font-bold flex items-center justify-center shrink-0 ${
                      activeThemeMeta.isLight
                        ? 'bg-stone-950/90 border-stone-950/30 text-orange-100'
                        : 'bg-stone-900 border-amber-300/40 text-amber-100'
                    }`}
                  >
                    {activeStatus.authorInitials}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-display font-bold truncate ${activeThemeMeta.textClass}`}
                    >
                      {activeStatus.authorName}
                    </div>
                    <div
                      className={`text-xs flex items-center gap-2 truncate ${activeThemeMeta.mutedTextClass}`}
                    >
                      <span>{activeStatus.authorRole ?? 'Kontak Handrawina'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeStatus.createdAt}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={activeIndex <= 0}
                    onClick={() =>
                      activeIndex > 0 && handleSelectStatus(orderedStatuses[activeIndex - 1].id)
                    }
                    aria-label="Status sebelumnya"
                    className={`p-2 disabled:opacity-30 rounded-md cursor-pointer ${
                      activeThemeMeta.isLight
                        ? 'text-stone-900 hover:bg-stone-950/10'
                        : 'text-stone-300 hover:text-amber-200 hover:bg-white/5'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex >= orderedStatuses.length - 1}
                    onClick={() =>
                      activeIndex < orderedStatuses.length - 1 &&
                      handleSelectStatus(orderedStatuses[activeIndex + 1].id)
                    }
                    aria-label="Status berikutnya"
                    className={`p-2 disabled:opacity-30 rounded-md cursor-pointer ${
                      activeThemeMeta.isLight
                        ? 'text-stone-900 hover:bg-stone-950/10'
                        : 'text-stone-300 hover:text-amber-200 hover:bg-white/5'
                    }`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {activeStatus.authorId === 'self' && (
                    <button
                      type="button"
                      onClick={handleDeleteCurrent}
                      aria-label="Hapus status ini"
                      className={`p-2 rounded-md cursor-pointer ${
                        activeThemeMeta.isLight
                          ? 'text-stone-900 hover:text-red-800 hover:bg-red-950/15'
                          : 'text-stone-300 hover:text-red-300 hover:bg-red-950/50'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Editorial Status Body */}
              <div className="px-7 sm:px-10 py-10 sm:py-14 space-y-5">
                {activeStatus.captionTag && (
                  <div className={`text-xs font-mono font-semibold tracking-wide ${activeThemeMeta.accentClass}`}>
                    {activeStatus.captionTag}
                  </div>
                )}
                <p
                  className={`text-xl sm:text-2xl font-display font-semibold leading-relaxed break-words ${activeThemeMeta.textClass}`}
                >
                  {activeStatus.text}
                </p>
                <div className={`pt-3 flex flex-wrap items-center gap-4 text-xs ${activeThemeMeta.mutedTextClass}`}>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Lock className={`w-3.5 h-3.5 ${activeThemeMeta.accentClass}`} aria-hidden="true" />
                    Terenkripsi E2EE
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
                    {activeStatus.expiresInLabel}
                  </span>
                  <span>
                    {AUDIENCE_LABELS[activeStatus.audience]}
                  </span>
                </div>
              </div>

              {/* Stage Footer: Reactions + Viewers / Quick Reply */}
              <div className="px-6 py-4 border-t border-amber-200/12 bg-stone-950/75 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {activeStatus.conversationId && activeStatus.authorId !== 'self' && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(activeStatus.conversationId!)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 hover:underline cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      Buka Obrolan
                    </button>
                  )}
                </div>

                {activeStatus.authorId === 'self' ? (
                  <div className="flex items-center justify-between gap-3 text-xs text-stone-300 pt-2 border-t border-stone-800">
                    <div className="flex items-center gap-2 min-w-0">
                      <Eye className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {activeStatus.viewerNames.length > 0
                          ? `Dilihat oleh ${activeStatus.viewerNames.join(', ')}`
                          : 'Belum ada kontak yang melihat pembaruan ini.'}
                      </span>
                    </div>
                    <span className="font-mono text-stone-400 shrink-0 tabular-nums">
                      {activeStatus.viewerNames.length} pemirsa
                    </span>
                  </div>
                ) : (
                  <form onSubmit={handleReplySubmit} className="space-y-2 pt-2 border-t border-stone-800">
                    <div className="flex items-center gap-2">
                      <label htmlFor="status-quick-reply" className="sr-only">
                        Balas status {activeStatus.authorName}
                      </label>
                      <input
                        id="status-quick-reply"
                        type="text"
                        value={replyText}
                        onChange={(e) => {
                          setReplyText(e.target.value);
                          setReplyFeedback(null);
                        }}
                        placeholder={`Balas status ${activeStatus.authorName} secara pribadi (E2EE)...`}
                        className="flex-1 min-w-0 px-3.5 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-400/70"
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim() || sendingReply}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        Balas
                      </button>
                    </div>
                    {replyFeedback && (
                      <p className="text-xs text-[#FDBA74]" data-testid="status-reply-feedback">
                        {replyFeedback}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
            <h2 className="text-lg font-display font-bold text-amber-50">
              Belum Ada Pembaruan Status Aktif
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              Buat pembaruan status terenkripsi ujung-ke-ujung yang tampil selama 24 jam untuk seluruh kontak tepercaya Anda.
            </p>
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Buat Status Pertama
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
