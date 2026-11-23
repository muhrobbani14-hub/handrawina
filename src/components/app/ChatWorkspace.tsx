import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Code2,
  Image as ImageIcon,
  Lock,
  MessageSquarePlus,
  Mic,
  Paperclip,
  PhoneOutgoing,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Square,
  Star,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { AkuAiEmblem } from './AkuAiEmblem';
import { AkuAiWorkspace } from './AkuAiWorkspace';
import type { JoinBarcodeMode } from './JoinBarcodeModal';
import { WhatsAppContactModal, type ContactModalView } from './WhatsAppContactModal';
import type { UnsavedPeerInfo } from '../../hooks/useFirebaseHandrawina';
import type {
  AccountProfile,
  BusinessProduct,
  ChatMessage,
  Conversation,
  ConversationKind,
} from '../../types/handrawina';
import type {
  PhoneDirectoryRecord,
  SavedContactRecord,
} from '../../utils/phoneAuthAndContacts';
import { computeSafetyNumber } from '../../crypto/e2eeEngine';
import {
  filterConversations,
  formatDuration,
  formatIdr,
  getTotalUnreadCount,
  type ChatFilterKind,
} from '../../utils/handrawinaState';

interface ChatWorkspaceProps {
  account: AccountProfile;
  localFingerprint: string;
  conversations: Conversation[];
  messagesByConv: Record<string, ChatMessage[]>;
  activeConvId: string;
  onSelectConversation: (id: string) => void;
  onToggleFavorite?: (conversationId: string) => Promise<void>;
  onSendMessage: (params: {
    conversationId: string;
    plaintext: string;
    kind?: ChatMessage['kind'];
    voiceDurationSec?: number;
    mediaLabel?: string;
    mediaSizeKb?: number;
    product?: ChatMessage['product'];
  }) => Promise<void>;
  onCreateConversation: (params: {
    name: string;
    kind: ConversationKind;
    participantCount?: number;
    memberUids?: string[];
  }) => Promise<void>;
  onRotateGroupEpoch: (conversationId: string) => Promise<void>;
  onTypingChange: (conversationId: string, isTyping: boolean) => void;
  typingByConv: Record<string, string | null>;
  onStartCall: (conversation: Conversation, mode: 'audio' | 'video') => void;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
  onOpenBackdropSettings: () => void;
  businessProducts: BusinessProduct[];
  contacts?: SavedContactRecord[];
  unsavedPeer?: UnsavedPeerInfo | null;
  onLookupPhone: (
    phoneInput: string,
    countryCode?: string
  ) => Promise<
    | { ok: true; found: true; entry: PhoneDirectoryRecord }
    | { ok: true; found: false; normalizedFormatted: string; phoneKey: string }
    | { ok: false; error: string }
  >;
  onSaveContactAndChat?: (params: {
    peer: PhoneDirectoryRecord;
    contactName: string;
  }) => Promise<{ ok: boolean; conversationId?: string; message: string }>;
  onOpenChatWithContact?: (
    contact: SavedContactRecord
  ) => Promise<{ ok: boolean; conversationId?: string; message: string }>;
  onSaveUnsavedPeer?: (
    conversationId: string,
    contactName: string
  ) => Promise<{ ok: boolean; message: string }>;
  onDeleteContact?: (contactUid: string) => Promise<void>;
  akuAiOpen: boolean;
  akuAiInitialPrompt: string | null;
  onOpenAkuAi: (initialPrompt?: string) => void;
  onCloseAkuAi: () => void;
  onConsumeAkuAiPrompt: () => void;
}

function getAvatarTone(conv: Conversation): string {
  if (conv.kind === 'group') {
    return 'bg-gradient-to-br from-[#102A54] to-[#071329] text-sky-200 border-sky-300/35';
  }
  if (conv.kind === 'business') {
    return 'bg-gradient-to-br from-[#3A2B14] to-[#161109] text-amber-200 border-amber-300/35';
  }
  return 'bg-gradient-to-br from-[#3B2318] to-[#140C0A] text-[#FFEDD5] border-[#FDBA74]/30';
}

export function ChatWorkspace({
  account,
  localFingerprint,
  conversations,
  messagesByConv,
  activeConvId,
  onSelectConversation,
  onToggleFavorite,
  onSendMessage,
  onCreateConversation,
  onRotateGroupEpoch,
  onTypingChange,
  typingByConv,
  onStartCall,
  onOpenJoinBarcode,
  onOpenBackdropSettings,
  businessProducts,
  contacts = [],
  unsavedPeer = null,
  onLookupPhone,
  onSaveContactAndChat,
  onOpenChatWithContact,
  onSaveUnsavedPeer,
  onDeleteContact,
  akuAiOpen,
  akuAiInitialPrompt,
  onOpenAkuAi,
  onCloseAkuAi,
  onConsumeAkuAiPrompt,
}: ChatWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<ChatFilterKind>('all');
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [inspectedMsgId, setInspectedMsgId] = useState<string | null>(null);

  // Voice recording state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSec, setVoiceSec] = useState(0);

  // Product picker popover (for business chats)
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Safety Number verification modal
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string>('');

  // WhatsApp-style Contacts / New Chat / New Group modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalView, setNewModalView] = useState<ContactModalView>('list');

  // Inline quick-save banner state for unsaved senders
  const [unsavedNameDraft, setUnsavedNameDraft] = useState('');
  const [savingUnsaved, setSavingUnsaved] = useState(false);
  const [unsavedFeedback, setUnsavedFeedback] = useState<string | null>(null);
  const [unsavedDismissedFor, setUnsavedDismissedFor] = useState<string | null>(null);

  // Rotating group sender key loading state
  const [rotatingEpoch, setRotatingEpoch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const filteredConversations = useMemo(
    () => filterConversations(conversations, { query: searchQuery, filter: filterKind }),
    [conversations, searchQuery, filterKind]
  );

  const totalUnread = useMemo(() => getTotalUnreadCount(conversations), [conversations]);

  const activeConv =
    conversations.find((c) => c.id === activeConvId) ?? conversations[0] ?? null;
  const activeMessages = activeConv ? messagesByConv[activeConv.id] ?? [] : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeConvId]);

  useEffect(() => {
    if (!recordingVoice) {
      setVoiceSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setVoiceSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordingVoice]);

  useEffect(() => {
    if (!showSafetyModal || !activeConv) return;
    let mounted = true;
    computeSafetyNumber(localFingerprint, activeConv.peerPublicKeyFingerprint).then((num) => {
      if (mounted) setSafetyNumber(num);
    });
    return () => {
      mounted = false;
    };
  }, [showSafetyModal, activeConv, localFingerprint]);

  useEffect(() => {
    setUnsavedNameDraft(unsavedPeer?.peerProfileName ?? '');
    setUnsavedFeedback(null);
  }, [activeConv?.id, unsavedPeer?.peerUid, unsavedPeer?.peerProfileName]);

  const handleOpenContactModal = (view: ContactModalView = 'list') => {
    setNewModalView(view);
    setShowNewModal(true);
  };

  const handleSelectConv = (id: string) => {
    onCloseAkuAi();
    onSelectConversation(id);
    setMobileShowThread(true);
    setShowProductPicker(false);
    setInspectedMsgId(null);
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !draftText.trim() || sending) return;
    const content = draftText.trim();
    setDraftText('');
    setSending(true);
    onTypingChange(activeConv.id, false);
    try {
      await onSendMessage({
        conversationId: activeConv.id,
        plaintext: content,
        kind: 'text',
      });
    } finally {
      setSending(false);
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!activeConv) return;
    const duration = Math.max(1, voiceSec);
    setRecordingVoice(false);
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Pesan suara terenkripsi Opus (${formatDuration(duration)})`,
      kind: 'voice',
      voiceDurationSec: duration,
    });
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Berkas terenkripsi AES-256-GCM: ${file.name} (${sizeKb} KB)`,
      kind: 'media',
      mediaLabel: file.name,
      mediaSizeKb: sizeKb,
    });
    e.target.value = '';
  };

  const handleSendProductCard = async (prod: BusinessProduct) => {
    if (!activeConv) return;
    setShowProductPicker(false);
    await onSendMessage({
      conversationId: activeConv.id,
      plaintext: `Katalog Produk: ${prod.title} (${formatIdr(prod.priceIdr)})`,
      kind: 'product',
      product: {
        productId: prod.id,
        sku: prod.sku,
        title: prod.title,
        priceIdr: prod.priceIdr,
        description: prod.description,
      },
    });
  };

  const handleSaveUnsavedBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !unsavedPeer || !onSaveUnsavedPeer || savingUnsaved) return;
    setSavingUnsaved(true);
    setUnsavedFeedback(null);
    try {
      const targetName = unsavedNameDraft.trim() || unsavedPeer.peerProfileName;
      const res = await onSaveUnsavedPeer(activeConv.id, targetName);
      if (!res.ok) {
        setUnsavedFeedback(res.message);
      }
    } finally {
      setSavingUnsaved(false);
    }
  };

  const handleRotateSenderKey = async () => {
    if (!activeConv || activeConv.kind !== 'group' || rotatingEpoch) return;
    setRotatingEpoch(true);
    try {
      await onRotateGroupEpoch(activeConv.id);
    } finally {
      setRotatingEpoch(false);
    }
  };

  const filterChips: { id: ChatFilterKind; label: string }[] = [
    { id: 'all', label: 'Semua' },
    {
      id: 'unread',
      label: totalUnread > 0 ? `Belum dibaca ${totalUnread}` : 'Belum dibaca',
    },
    { id: 'favorite', label: 'Favorit' },
    { id: 'group', label: 'Grup' },
  ];

  return (
    <div className="flex-1 flex min-h-0 bg-[#071329]/30 overflow-hidden">
      {/* LEFT PANE: 4-Color Luxury Workspace Over Cinematic Backdrop */}
      <aside
        aria-label="Daftar percakapan"
        className={`${
          mobileShowThread || akuAiOpen ? 'hidden lg:flex' : 'flex'
        } relative flex-col w-full lg:w-[368px] xl:w-[396px] shrink-0 border-r border-[#FDBA74]/18 bg-[#071329]/80 backdrop-blur-md min-h-0`}
      >
        {/* Top Search Pill ("Tanya Aku AI atau cari") + Horizontal Filter Chips */}
        <div className="px-3.5 pt-3 pb-2.5 space-y-2.5 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) {
                onOpenAkuAi(searchQuery.trim());
                setSearchQuery('');
              } else {
                onOpenAkuAi();
              }
            }}
            className="relative flex items-center"
          >
            <Search
              className="w-[18px] h-[18px] text-slate-400 absolute left-4 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="chat-search-input" className="sr-only">
              Tanya Aku AI atau cari percakapan
            </label>
            <input
              id="chat-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tanya Aku AI atau cari"
              className="w-full pl-11 pr-20 py-2.5 text-sm bg-[#0B1D3A]/90 border border-amber-200/18 rounded-full text-stone-100 placeholder:text-slate-400 focus:outline-none focus:bg-[#102A54] focus:border-[#FDBA74]/60 transition-colors"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                  className="p-1 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="submit"
                aria-label="Tanya Aku AI"
                title="Tanya Aku AI"
                className="p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <AkuAiEmblem size="sm" />
              </button>
            </div>
          </form>

          {/* Filter Chips: Semua, Belum dibaca N, Favorit, Grup */}
          <div
            role="tablist"
            aria-label="Filter percakapan"
            className="flex items-center gap-2 overflow-x-auto pb-0.5"
          >
            {filterChips.map((chip) => {
              const active = filterKind === chip.id;
              return (
                <button
                  key={chip.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setFilterKind(chip.id)}
                  className={`px-3.5 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#3A2B14]/95 text-[#FDBA74] border-[#FDBA74]/45 font-semibold'
                      : 'bg-[#0B1D3A]/85 text-slate-300 border-amber-200/15 hover:text-stone-50 hover:bg-[#102A54]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation List */}
        <div
          className="flex-1 overflow-y-auto pb-24"
          data-testid="conversation-list"
        >
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-sm font-medium text-stone-100">Tidak ada percakapan cocok</p>
              <p className="text-xs text-slate-400">
                Ubah kata kunci pencarian atau atur ulang filter untuk melihat seluruh percakapan.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterKind('all');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#FDBA74] border border-[#FDBA74]/40 bg-[#3A2B14]/85 rounded-full hover:bg-[#3A2B14] cursor-pointer"
                >
                  Reset Filter
                </button>
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const convMsgs = messagesByConv[conv.id] ?? [];
              const lastMsg = convMsgs[convMsgs.length - 1];
              const isSelected = activeConv?.id === conv.id;
              const hasUnread = conv.unreadCount > 0;
              const previewText = lastMsg
                ? conv.kind === 'group' && lastMsg.senderId !== 'system'
                  ? `~ ${lastMsg.senderName}: ${lastMsg.plaintext}`
                  : lastMsg.plaintext
                : conv.handle;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleSelectConv(conv.id)}
                  className={`w-full text-left px-3.5 py-3 flex items-center gap-3.5 transition-colors cursor-pointer min-h-[72px] ${
                    isSelected
                      ? 'bg-[#102A54]/75'
                      : 'bg-transparent hover:bg-[#0B1D3A]/60'
                  }`}
                >
                  {/* Circular Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-display font-bold border ${getAvatarTone(
                        conv
                      )}`}
                    >
                      {conv.initials}
                    </div>
                    {conv.online && conv.kind === 'direct' && (
                      <span
                        className="w-3 h-3 rounded-full bg-[#FB923C] border-2 border-[#071329] absolute bottom-0 right-0"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Conversation Info */}
                  <div className="min-w-0 flex-1 border-b border-amber-200/10 pb-3 -mb-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold text-stone-100 truncate">
                        {conv.name}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums shrink-0 ${
                          hasUnread ? 'text-[#FDBA74] font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {lastMsg?.timestamp ?? ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="flex items-center gap-1.5 min-w-0 text-[13px] text-slate-300/80">
                        {lastMsg?.kind === 'voice' && (
                          <Mic className="w-3.5 h-3.5 text-[#FDBA74] shrink-0" aria-hidden="true" />
                        )}
                        {lastMsg?.kind === 'media' && (
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        )}
                        <p className="truncate">{previewText}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {conv.pinned && (
                          <Star
                            className="w-3.5 h-3.5 text-amber-300/85 fill-amber-300/40"
                            aria-label="Obrolan favorit"
                          />
                        )}
                        {hasUnread && (
                          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] text-[#071329] text-[11px] font-bold flex items-center justify-center tabular-nums">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Floating Action Buttons: Aku AI (Sunflower Logo) + New Chat */}
        <div className="absolute right-4 bottom-4 z-20 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenAkuAi()}
            aria-label="Buka Aku AI"
            title="Tanya Aku AI"
            data-testid="fab-aku-ai"
            className={`w-12 h-12 rounded-2xl bg-[#0B1D3A]/95 hover:bg-[#102A54] border flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all active:scale-95 cursor-pointer ${
              akuAiOpen ? 'border-[#FDBA74] ring-2 ring-[#FDBA74]/40' : 'border-amber-300/35'
            }`}
          >
            <AkuAiEmblem size="md" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenContactModal('list')}
            aria-label="Buat obrolan atau grup baru"
            title="Obrolan Baru & Kontak"
            data-testid="fab-new-chat"
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 text-[#071329] flex items-center justify-center shadow-[0_10px_28px_rgba(251,146,60,0.38)] transition-all active:scale-95 cursor-pointer"
          >
            <MessageSquarePlus className="w-6 h-6" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* RIGHT PANE: Aku AI Workspace OR Active E2EE Thread */}
      <section
        aria-label={akuAiOpen ? 'Ruang asisten Aku AI' : 'Ruang percakapan aktif'}
        className={`${
          mobileShowThread || akuAiOpen ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col min-w-0 min-h-0 bg-[#071329]/24`}
      >
        {akuAiOpen ? (
          <AkuAiWorkspace
            userName={account.displayName}
            activeConversationName={activeConv?.name}
            initialPrompt={akuAiInitialPrompt}
            onConsumeInitialPrompt={onConsumeAkuAiPrompt}
            onClose={onCloseAkuAi}
            onCopyToChat={
              activeConv
                ? (text) => {
                    setDraftText(text);
                    onCloseAkuAi();
                    setMobileShowThread(true);
                  }
                : undefined
            }
          />
        ) : !activeConv ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-sm p-6 rounded-2xl bg-[#0B1D3A]/88 backdrop-blur-md border border-[#FDBA74]/25 space-y-3.5 shadow-xl">
              <p className="text-base font-display font-bold text-white">
                Mulai Obrolan dengan Nomor Telepon
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Tambahkan nomor telepon teman yang terdaftar di Handrawina untuk langsung membuka ruang obrolan real-time terenkripsi ECDH P-256 + AES-256-GCM.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleOpenContactModal('new-contact')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 rounded-xl cursor-pointer transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  Tambah Kontak Baru (Nomor HP)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenJoinBarcode('invite')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-amber-100 bg-[#102A54]/90 hover:bg-[#173668] border border-amber-200/20 rounded-xl cursor-pointer transition-colors"
                >
                  Tampilkan / Pindai QR (Opsional)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <header className="px-4 sm:px-5 py-3 bg-[#0B1D3A]/86 backdrop-blur-md border-b border-[#FDBA74]/18 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  aria-label="Kembali ke daftar obrolan"
                  className="lg:hidden p-2 -ml-2 text-stone-200 hover:bg-white/10 rounded-full min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div
                  className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-xs font-display font-bold border ${getAvatarTone(
                    activeConv
                  )}`}
                >
                  {activeConv.initials}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-stone-100 truncate">
                    {activeConv.name}
                  </h2>
                  <p className="text-xs text-slate-300/80 truncate">
                    {typingByConv[activeConv.id]
                      ? `${typingByConv[activeConv.id]} sedang mengetik...`
                      : activeConv.handle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeConv.kind === 'group' && (
                  <button
                    type="button"
                    onClick={handleRotateSenderKey}
                    disabled={rotatingEpoch}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-100 bg-[#102A54]/90 hover:bg-[#173668] border border-amber-200/20 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[#FDBA74] ${rotatingEpoch ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Rotasi Kunci
                  </button>
                )}

                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={() => void onToggleFavorite(activeConv.id)}
                    aria-label={
                      activeConv.pinned
                        ? `Hapus ${activeConv.name} dari Favorit`
                        : `Tandai ${activeConv.name} sebagai Favorit`
                    }
                    className={`p-2 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer ${
                      activeConv.pinned
                        ? 'text-amber-300 bg-amber-400/14'
                        : 'text-slate-300 hover:text-amber-200 hover:bg-white/8'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${activeConv.pinned ? 'fill-amber-300' : ''}`}
                    />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowSafetyModal(true)}
                  aria-label={`Verifikasi nomor keamanan ${activeConv.name}`}
                  className="p-2 text-slate-300 hover:text-[#FDBA74] hover:bg-white/8 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>

                {activeConv.kind === 'direct' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onStartCall(activeConv, 'audio')}
                      aria-label={`Mulai panggilan keluar dengan ${activeConv.name}`}
                      className="p-2 text-slate-300 hover:text-[#FDBA74] hover:bg-white/8 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                    >
                      <PhoneOutgoing className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartCall(activeConv, 'video')}
                      aria-label={`Mulai panggilan video dengan ${activeConv.name}`}
                      className="p-2 text-slate-300 hover:text-[#FDBA74] hover:bg-white/8 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* E2EE Status Strip */}
            <div className="px-4 sm:px-5 py-2 bg-[#071329]/68 border-b border-amber-200/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 shrink-0">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-[#FDBA74] shrink-0" aria-hidden="true" />
                <span>
                  {activeConv.kind === 'group'
                    ? `Enkripsi Sender Keys O(1) · ${activeConv.participantCount.toLocaleString('id-ID')} peserta · Epoch ${activeConv.senderKeyEpoch ?? 1}`
                    : activeConv.kind === 'business'
                    ? 'Enkripsi Signal E2EE hingga Business API Enclave · Auto-Reply aktif'
                    : 'Enkripsi Signal Protocol (X3DH + Double Ratchet AES-256-GCM)'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenBackdropSettings}
                  className="inline-flex items-center gap-1 text-amber-300 hover:text-[#FFEDD5] underline-offset-2 hover:underline cursor-pointer whitespace-nowrap"
                >
                  <ImageIcon className="w-3 h-3" aria-hidden="true" />
                  Latar &amp; Navbar
                </button>
              </div>
            </div>

            {/* WhatsApp-Style Unsaved Sender Quick-Save Banner */}
            {unsavedPeer &&
              onSaveUnsavedPeer &&
              unsavedDismissedFor !== activeConv.id && (
                <form
                  onSubmit={handleSaveUnsavedBanner}
                  data-testid="unsaved-contact-banner"
                  className="px-4 sm:px-5 py-2.5 bg-[#3A2B14]/85 border-b border-[#FDBA74]/30 flex flex-wrap items-center justify-between gap-2.5 shrink-0"
                >
                  <div className="flex items-center gap-2 min-w-0 text-xs text-amber-50">
                    <UserPlus className="w-4 h-4 text-[#FDBA74] shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      Pengirim ini belum tersimpan di kontak Anda (
                      <span className="font-mono font-semibold text-[#FDBA74]">
                        {unsavedPeer.peerPhone}
                      </span>
                      )
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="unsaved-contact-name" className="sr-only">
                      Simpan nama kontak
                    </label>
                    <input
                      id="unsaved-contact-name"
                      type="text"
                      value={unsavedNameDraft}
                      onChange={(e) => setUnsavedNameDraft(e.target.value)}
                      placeholder={unsavedPeer.peerProfileName}
                      className="w-40 sm:w-44 px-2.5 py-1.5 text-xs bg-[#071329]/90 border border-[#FDBA74]/35 rounded-lg text-white placeholder:text-slate-400 focus:outline-none focus:border-[#FDBA74]"
                    />
                    <button
                      type="submit"
                      disabled={savingUnsaved}
                      className="px-3 py-1.5 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      {savingUnsaved ? 'Menyimpan...' : 'Simpan ke Kontak'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnsavedDismissedFor(activeConv.id)}
                      aria-label="Tutup banner simpan kontak"
                      className="p-1 text-amber-200/75 hover:text-white rounded-full cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {unsavedFeedback && (
                    <p className="w-full text-[11px] text-red-300 font-medium">
                      {unsavedFeedback}
                    </p>
                  )}
                </form>
              )}

            {/* Message Feed */}
            <div
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3"
              data-testid="message-feed"
            >
              {activeMessages.map((msg) => {
                if (msg.kind === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <div className="max-w-xl text-center text-xs text-amber-100/90 bg-[#281E0F]/85 border border-amber-300/20 px-3.5 py-2 rounded-xl">
                        {msg.plaintext}
                      </div>
                    </div>
                  );
                }

                const isSelf = msg.senderId === 'self' || msg.senderId === account.accountId;
                const isInspected = inspectedMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[86%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 border shadow-lg ${
                        isSelf
                          ? 'bg-gradient-to-br from-[#3B2318]/94 to-[#291812]/94 text-stone-50 border-[#FDBA74]/28 rounded-tr-sm'
                          : 'bg-[#0B1D3A]/90 text-stone-100 border-sky-200/16 rounded-tl-sm'
                      }`}
                    >
                      {!isSelf && (
                        <div className="text-[11px] font-semibold text-[#FDBA74] mb-1">
                          {msg.senderName}
                        </div>
                      )}

                      {msg.kind === 'product' && msg.product ? (
                        <div
                          className={`p-3 rounded-xl mb-1.5 border ${
                            isSelf
                              ? 'bg-[#140C0A]/55 border-[#FDBA74]/28 text-stone-50'
                              : 'bg-[#071329]/75 border-amber-200/18 text-stone-100'
                          }`}
                        >
                          <div className="text-[11px] font-mono text-amber-300">
                            Katalog · {msg.product.sku}
                          </div>
                          <div className="text-sm font-semibold mt-0.5">{msg.product.title}</div>
                          <div className="text-xs text-slate-300 mt-1">
                            {msg.product.description}
                          </div>
                          <div className="text-sm font-mono font-bold tabular-nums text-[#FDBA74] mt-2">
                            {formatIdr(msg.product.priceIdr)}
                          </div>
                        </div>
                      ) : msg.kind === 'voice' ? (
                        <div className="flex items-center gap-3 py-1">
                          <Mic className="w-4 h-4 shrink-0 text-[#FDBA74]" aria-hidden="true" />
                          <div className="flex-1 min-w-[140px]">
                            <div className="flex items-center gap-0.5 h-4">
                              {[35, 70, 50, 90, 45, 80, 60, 100, 55, 75, 40, 65].map((h, i) => (
                                <span
                                  key={i}
                                  className="w-1 rounded-xs bg-[#FDBA74]/90"
                                  style={{ height: `${h}%` }}
                                />
                              ))}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums mt-1 text-slate-300">
                              Opus E2EE · {formatDuration(msg.voiceDurationSec ?? 12)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.plaintext}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-4 mt-1.5 text-[11px] text-stone-300/80">
                        <div className="flex items-center gap-2">
                          {msg.envelope && (
                            <button
                              type="button"
                              onClick={() => setInspectedMsgId(isInspected ? null : msg.id)}
                              className="inline-flex items-center gap-1 text-amber-200/90 hover:text-[#FFEDD5] underline-offset-2 hover:underline cursor-pointer"
                            >
                              <Code2 className="w-3 h-3" aria-hidden="true" />
                              {isInspected ? 'Tutup Ciphertext' : 'Inspeksi E2EE'}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                          <span>{msg.timestamp}</span>
                          {isSelf && (
                            <span aria-label={`Status pesan: ${msg.status}`}>
                              {msg.status === 'read' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-[#FDBA74]" />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                              ) : (
                                <Check className="w-3.5 h-3.5 opacity-80" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isInspected && msg.envelope && (
                      <div
                        className="mt-1.5 max-w-[86%] sm:max-w-[70%] p-3 bg-[#071329]/95 border border-[#FDBA74]/35 text-stone-100 rounded-xl text-[11px] font-mono space-y-1 overflow-x-auto"
                        data-testid="ciphertext-inspector"
                      >
                        <div className="text-[#FDBA74] font-semibold">
                          Amplop Ciphertext Zero-Knowledge ({msg.envelope.protocol})
                        </div>
                        <div>
                          Algoritma: {msg.envelope.algorithm} · Ratchet #{msg.envelope.ratchetStep}
                          {msg.envelope.senderKeyEpoch
                            ? ` · Epoch ${msg.envelope.senderKeyEpoch}`
                            : ''}
                        </div>
                        <div>IV (96-bit): {msg.envelope.ivBase64}</div>
                        <div className="break-all text-slate-300">
                          Ciphertext: {msg.envelope.ciphertextBase64}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Product Picker Popover for Business Chats */}
            {showProductPicker && activeConv.kind === 'business' && (
              <div className="px-4 py-3 bg-[#0B1D3A]/94 border-t border-[#FDBA74]/18 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    Kirim Kartu Produk dari Katalog Bisnis
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowProductPicker(false)}
                    aria-label="Tutup pemilih katalog"
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {businessProducts
                    .filter((p) => p.active)
                    .map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSendProductCard(prod)}
                        className="text-left p-2.5 bg-[#102A54]/85 hover:bg-[#3A2B14]/90 border border-amber-200/15 hover:border-[#FDBA74]/45 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-stone-100 truncate">
                          {prod.title}
                        </div>
                        <div className="text-[11px] font-mono text-[#FDBA74] mt-0.5 tabular-nums">
                          {formatIdr(prod.priceIdr)}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Composer Footer */}
            <footer className="px-4 py-3 bg-[#0B1D3A]/90 backdrop-blur-md border-t border-[#FDBA74]/18 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleAttachFile}
                className="hidden"
                aria-label="Unggah berkas media terenkripsi"
              />

              {recordingVoice ? (
                <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#102A54]/92 border border-amber-200/20 rounded-full">
                  <div className="flex items-center gap-2 text-xs font-mono text-white tabular-nums">
                    <Mic className="w-4 h-4 text-red-400" aria-hidden="true" />
                    <span>Merekam Pesan Suara Opus... {formatDuration(voiceSec)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRecordingVoice(false)}
                      className="px-3 py-1.5 text-xs font-medium text-stone-200 bg-white/10 rounded-full hover:bg-white/15 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndSendVoice}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 rounded-full cursor-pointer"
                    >
                      <Square className="w-3 h-3" aria-hidden="true" />
                      Kirim Suara
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitText} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Lampirkan berkas terenkripsi"
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {activeConv.kind === 'business' && (
                    <button
                      type="button"
                      onClick={() => setShowProductPicker((v) => !v)}
                      aria-label="Lampirkan kartu produk bisnis"
                      className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                    </button>
                  )}

                  <label htmlFor="message-composer-input" className="sr-only">
                    Tulis pesan terenkripsi
                  </label>
                  <input
                    id="message-composer-input"
                    type="text"
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value);
                      onTypingChange(activeConv.id, e.target.value.length > 0);
                    }}
                    placeholder={
                      activeConv.kind === 'business'
                        ? 'Ketik "harga" atau "katalog" untuk uji Auto-Reply...'
                        : 'Ketik pesan terenkripsi...'
                    }
                    className="flex-1 min-w-0 px-4 py-2.5 text-sm bg-[#102A54]/92 border border-amber-200/20 rounded-full text-stone-100 placeholder:text-slate-400 focus:outline-none focus:border-[#FDBA74]/65 transition-colors"
                  />

                  <button
                    type="button"
                    onClick={() => setRecordingVoice(true)}
                    aria-label="Rekam pesan suara"
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    disabled={!draftText.trim() || sending}
                    aria-label="Kirim pesan"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 disabled:opacity-40 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Kirim</span>
                  </button>
                </form>
              )}
            </footer>
          </>
        )}
      </section>

      {/* Safety Number Verification Modal */}
      {showSafetyModal && activeConv && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verifikasi Nomor Keamanan E2EE"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div className="bg-[#0B1D3A]/96 backdrop-blur-md border border-[#FDBA74]/25 rounded-2xl max-w-md w-full p-6 space-y-4 text-stone-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  Verifikasi Nomor Keamanan
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Bandingkan 60 digit sidik jari kriptografi SHA-256 ini dengan perangkat milik{' '}
                  <strong className="text-[#FDBA74]">{activeConv.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                aria-label="Tutup modal nomor keamanan"
                className="p-1.5 text-slate-400 hover:text-white rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="p-4 bg-[#071329] border border-[#FDBA74]/25 rounded-xl font-mono text-sm tracking-wider text-center text-[#FDBA74] leading-loose tabular-nums"
              data-testid="safety-number-value"
            >
              {safetyNumber || 'Menghitung sidik jari SHA-256...'}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Jika angka di atas identik di kedua perangkat, sesi Signal Protocol Anda bebas dari serangan Man-in-the-Middle.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#071329] bg-gradient-to-r from-[#FFEDD5] via-[#FDBA74] to-[#FB923C] hover:brightness-105 rounded-full cursor-pointer"
              >
                Selesai Verifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp-Style Contacts, Add Friend by Phone & New Group Modal */}
      <WhatsAppContactModal
        open={showNewModal}
        initialView={newModalView}
        currentUserPhone={account.phoneNumber}
        contacts={contacts}
        onClose={() => setShowNewModal(false)}
        onOpenQrOptional={() => {
          setShowNewModal(false);
          onOpenJoinBarcode('invite');
        }}
        onLookupPhone={onLookupPhone}
        onSaveContactAndChat={onSaveContactAndChat}
        onOpenChatWithContact={onOpenChatWithContact}
        onDeleteContact={onDeleteContact}
        onCreateConversation={async (params) => {
          await onCreateConversation(params);
          setMobileShowThread(true);
        }}
        onSelectConversation={(conversationId) => {
          handleSelectConv(conversationId);
        }}
      />
    </div>
  );
}
