import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  MessageSquare,
  Phone,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ConversationKind } from '../../types/handrawina';
import {
  COUNTRY_DIAL_OPTIONS,
  filterSavedContacts,
  normalizePhoneForAuth,
  type PhoneDirectoryRecord,
  type SavedContactRecord,
} from '../../utils/phoneAuthAndContacts';

export type ContactModalView = 'list' | 'new-contact' | 'new-group';

interface WhatsAppContactModalProps {
  open: boolean;
  initialView?: ContactModalView;
  currentUserPhone: string;
  contacts: SavedContactRecord[];
  onClose: () => void;
  onOpenQrOptional?: () => void;
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
  onDeleteContact?: (contactUid: string) => Promise<void>;
  onCreateConversation: (params: {
    name: string;
    kind: ConversationKind;
    memberUids?: string[];
  }) => Promise<void>;
  onSelectConversation?: (conversationId: string) => void;
}

export function WhatsAppContactModal({
  open,
  initialView = 'list',
  currentUserPhone,
  contacts,
  onClose,
  onOpenQrOptional,
  onLookupPhone,
  onSaveContactAndChat,
  onOpenChatWithContact,
  onDeleteContact,
  onCreateConversation,
  onSelectConversation,
}: WhatsAppContactModalProps) {
  const [view, setView] = useState<ContactModalView>(initialView);
  const [search, setSearch] = useState('');

  // New Contact form state
  const [contactName, setContactName] = useState('');
  const [countryCode, setCountryCode] = useState('+62');
  const [phoneInput, setPhoneInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundPeer, setFoundPeer] = useState<PhoneDirectoryRecord | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // New Group form state
  const [groupName, setGroupName] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setView(initialView);
      setSearch('');
      setContactName('');
      setPhoneInput('');
      setLookupError(null);
      setFoundPeer(null);
      setNotFoundPhone(null);
      setCopiedInvite(false);
      setGroupName('');
      setSelectedMemberUids([]);
      setGroupError(null);
    }
  }, [open, initialView]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const filteredContacts = useMemo(
    () => filterSavedContacts(contacts, search),
    [contacts, search]
  );

  if (!open) return null;

  const handleCheckPhone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLookupError(null);
    setFoundPeer(null);
    setNotFoundPhone(null);

    const norm = normalizePhoneForAuth(phoneInput, countryCode);
    if (!norm.ok) {
      setLookupError(norm.error);
      return;
    }

    setLookupBusy(true);
    try {
      const res = await onLookupPhone(phoneInput, countryCode);
      if (!res.ok) {
        setLookupError(res.error);
        return;
      }
      if (res.found) {
        setFoundPeer(res.entry);
        if (!contactName.trim()) {
          setContactName(res.entry.displayName);
        }
      } else {
        setNotFoundPhone(res.normalizedFormatted);
      }
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSaveAndChat = async () => {
    if (!foundPeer || !onSaveContactAndChat) return;
    const finalName = contactName.trim() || foundPeer.displayName;
    setSaveBusy(true);
    setLookupError(null);
    try {
      const res = await onSaveContactAndChat({
        peer: foundPeer,
        contactName: finalName,
      });
      if (!res.ok) {
        setLookupError(res.message);
        return;
      }
      if (res.conversationId) {
        onSelectConversation?.(res.conversationId);
      }
      onClose();
    } finally {
      setSaveBusy(false);
    }
  };

  const handleCopyInviteMessage = async () => {
    const inviteText = `Halo! Yuk chat terenkripsi di Handrawina dengan nomor ${notFoundPhone ?? ''}. Buka ${window.location.origin} lalu daftar memakai nomor HP Anda — nanti nomor saya (${currentUserPhone}) bisa langsung dihubungi.`;
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setCopiedInvite(false);
    }
  };

  const handlePickSavedContact = async (contact: SavedContactRecord) => {
    if (!onOpenChatWithContact) return;
    const res = await onOpenChatWithContact(contact);
    if (res.ok && res.conversationId) {
      onSelectConversation?.(res.conversationId);
      onClose();
    }
  };

  const toggleMember = (uid: string) => {
    setSelectedMemberUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = groupName.trim();
    if (!clean) {
      setGroupError('Masukkan nama grup terlebih dahulu.');
      return;
    }
    setGroupBusy(true);
    setGroupError(null);
    try {
      await onCreateConversation({
        name: clean,
        kind: 'group',
        memberUids: selectedMemberUids,
      });
      onClose();
    } finally {
      setGroupBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih Kontak dan Obrolan Baru Handrawina"
      data-testid="whatsapp-contact-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-stone-950/94 backdrop-blur-2xl border border-amber-200/20 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.85)] max-w-lg w-full overflow-hidden text-stone-100 flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0A1833]/90 border-b border-amber-200/15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {view !== 'list' && (
              <button
                type="button"
                onClick={() => {
                  setView('list');
                  setLookupError(null);
                  setGroupError(null);
                }}
                aria-label="Kembali ke daftar kontak"
                className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-display font-bold text-amber-50 truncate">
                {view === 'list'
                  ? 'Pilih Kontak'
                  : view === 'new-contact'
                  ? 'Kontak Baru'
                  : 'Grup Baru'}
              </h2>
              <p className="text-[11px] text-stone-300 truncate">
                {view === 'list'
                  ? `${contacts.length} kontak tersimpan di Handrawina`
                  : view === 'new-contact'
                  ? 'Tambahkan teman cukup dengan nomor teleponnya'
                  : 'Pilih anggota dari kontak tersimpan Anda'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela kontak"
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-white/5 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {view === 'list' && (
            <>
              {/* Search bar */}
              <div className="relative">
                <Search
                  className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau nomor telepon..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-stone-900/90 border border-amber-200/15 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                />
              </div>

              {/* WhatsApp-style top quick action rows */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  data-testid="wa-action-new-contact"
                  onClick={() => setView('new-contact')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#3A2B14]/65 hover:bg-[#3A2B14] border border-[#E5C17B]/25 transition-colors text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F7DC9C] to-[#E5A852] text-stone-950 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-amber-50">Kontak Baru</div>
                    <div className="text-xs text-stone-300">
                      Tambah teman lewat nomor telepon tanpa perlu QR
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="wa-action-new-group"
                  onClick={() => setView('new-group')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#102A54]/60 hover:bg-[#102A54] border border-sky-200/15 transition-colors text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-[#173A73] text-[#FDBA74] border border-[#FDBA74]/30 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-amber-50">Grup Baru</div>
                    <div className="text-xs text-stone-300">
                      Buat obrolan grup E2EE bersama beberapa kontak Anda
                    </div>
                  </div>
                </button>

                {onOpenQrOptional && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenQrOptional();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-900/60 hover:bg-stone-800/80 border border-stone-800 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#3B2318] text-[#FDBA74] flex items-center justify-center shrink-0">
                      <QrCode className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-stone-200">
                        Tampilkan / Pindai QR (Opsional)
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Saved Contacts Section */}
              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#FDBA74]/85">
                  Kontak di Handrawina ({filteredContacts.length})
                </div>

                {filteredContacts.length === 0 ? (
                  <div className="p-5 rounded-xl bg-stone-900/60 border border-stone-800 text-center space-y-2">
                    <Phone className="w-6 h-6 text-stone-500 mx-auto" aria-hidden="true" />
                    <p className="text-xs text-stone-400 leading-relaxed">
                      {contacts.length === 0
                        ? 'Belum ada kontak tersimpan. Ketuk "Kontak Baru" di atas lalu masukkan nomor telepon teman Anda yang sudah mendaftar di Handrawina.'
                        : 'Tidak ada kontak yang cocok dengan pencarian Anda.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact.contactUid}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-stone-900/70 hover:bg-[#102A54]/55 border border-stone-800/80 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => void handlePickSavedContact(contact)}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3B2318] to-[#140C0A] border border-[#FDBA74]/35 text-[#FFEDD5] flex items-center justify-center text-xs font-bold shrink-0">
                            {contact.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-amber-50 truncate">
                              {contact.contactName}
                            </div>
                            <div className="text-xs font-mono text-stone-300 truncate">
                              {contact.phoneNumber}
                            </div>
                            {contact.aboutText && (
                              <div className="text-[11px] text-stone-400 truncate">
                                {contact.aboutText}
                              </div>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handlePickSavedContact(contact)}
                            aria-label={`Chat dengan ${contact.contactName}`}
                            className="p-2 text-[#FDBA74] hover:bg-[#FDBA74]/15 rounded-lg cursor-pointer"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          {onDeleteContact && (
                            <button
                              type="button"
                              onClick={() => void onDeleteContact(contact.contactUid)}
                              aria-label={`Hapus kontak ${contact.contactName}`}
                              className="p-2 text-stone-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {view === 'new-contact' && (
            <form onSubmit={handleCheckPhone} className="space-y-4">
              <div>
                <label
                  htmlFor="wa-new-contact-name"
                  className="block text-xs font-medium text-stone-200 mb-1.5"
                >
                  Nama Kontak (Sesuai Keinginan Anda)
                </label>
                <input
                  id="wa-new-contact-name"
                  data-testid="wa-contact-name-input"
                  type="text"
                  maxLength={80}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contoh: Budi Kantor"
                  className="w-full px-3.5 py-2.5 text-sm bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                />
              </div>

              <div>
                <label
                  htmlFor="wa-new-contact-phone"
                  className="block text-xs font-medium text-stone-200 mb-1.5"
                >
                  Nomor Telepon Teman
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Kode negara kontak"
                    value={countryCode}
                    onChange={(e) => {
                      setCountryCode(e.target.value);
                      setFoundPeer(null);
                      setNotFoundPhone(null);
                    }}
                    className="w-[92px] shrink-0 px-2.5 py-2.5 text-xs font-mono bg-stone-900/90 border border-amber-200/20 rounded-xl text-amber-100 focus:outline-none focus:border-[#FDBA74]"
                  >
                    {COUNTRY_DIAL_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.flag} {opt.code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="wa-new-contact-phone"
                    data-testid="wa-contact-phone-input"
                    type="tel"
                    inputMode="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setFoundPeer(null);
                      setNotFoundPhone(null);
                      setLookupError(null);
                    }}
                    placeholder="0812-3456-7890"
                    className="flex-1 min-w-0 px-3.5 py-2.5 text-sm font-mono bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                  />
                </div>
                <p className="text-[11px] text-stone-400 mt-1.5">
                  Mendukung format lokal <span className="font-mono">0812...</span> maupun internasional <span className="font-mono">+62 812...</span>.
                </p>
              </div>

              {lookupError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-950/70 border border-red-400/35 text-xs text-red-200"
                >
                  {lookupError}
                </div>
              )}

              {/* Registered user found card */}
              {foundPeer && (
                <div
                  data-testid="wa-contact-found-card"
                  className="p-4 rounded-xl bg-[#102A54]/80 border border-[#FDBA74]/40 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F7DC9C]">
                    <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Nomor ini terdaftar di Handrawina</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FDBA74] to-[#B47A38] text-stone-950 flex items-center justify-center text-sm font-bold shrink-0">
                      {foundPeer.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-amber-50 truncate">
                        {foundPeer.displayName}
                      </div>
                      <div className="text-xs font-mono text-stone-200">
                        {foundPeer.phoneNumber}
                      </div>
                      {foundPeer.aboutText && (
                        <div className="text-[11px] text-stone-300 truncate mt-0.5">
                          {foundPeer.aboutText}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saveBusy}
                    data-testid="wa-save-and-chat-button"
                    onClick={() => void handleSaveAndChat()}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-stone-950 bg-gradient-to-r from-[#F7DC9C] via-[#FDBA74] to-[#E5A852] hover:brightness-105 disabled:opacity-50 rounded-xl transition-all cursor-pointer"
                  >
                    {saveBusy ? 'Menyimpan & Membuka Chat...' : 'Simpan & Mulai Chat'}
                  </button>
                </div>
              )}

              {/* Not registered card */}
              {notFoundPhone && (
                <div
                  data-testid="wa-contact-not-found-card"
                  className="p-4 rounded-xl bg-[#3B2318]/80 border border-[#FDBA74]/30 space-y-3"
                >
                  <div className="text-xs text-amber-100 leading-relaxed">
                    Nomor <span className="font-mono font-semibold">{notFoundPhone}</span> belum terdaftar di Handrawina. Minta teman Anda mendaftar dengan nomor tersebut agar bisa langsung terhubung.
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyInviteMessage()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-100 bg-stone-900/80 hover:bg-stone-800 border border-[#FDBA74]/35 rounded-lg cursor-pointer"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#FDBA74]" />
                        Pesan Undangan Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Salin Pesan Undangan
                      </>
                    )}
                  </button>
                </div>
              )}

              {!foundPeer && (
                <button
                  type="submit"
                  disabled={lookupBusy || !phoneInput.trim()}
                  data-testid="wa-check-phone-button"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-stone-950 bg-gradient-to-r from-[#F7DC9C] via-[#FDBA74] to-[#E5A852] hover:brightness-105 disabled:opacity-45 rounded-xl transition-all cursor-pointer"
                >
                  {lookupBusy ? 'Memeriksa Nomor...' : 'Cari Nomor di Handrawina'}
                </button>
              )}
            </form>
          )}

          {view === 'new-group' && (
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label
                  htmlFor="wa-new-group-name"
                  className="block text-xs font-medium text-stone-200 mb-1.5"
                >
                  Nama Grup
                </label>
                <input
                  id="wa-new-group-name"
                  data-testid="wa-group-name-input"
                  type="text"
                  required
                  maxLength={80}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Contoh: Keluarga Besar / Tim Proyek"
                  className="w-full px-3.5 py-2.5 text-sm bg-stone-900/90 border border-amber-200/20 rounded-xl text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#FDBA74]"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-300">
                  Pilih Anggota dari Kontak ({selectedMemberUids.length} dipilih)
                </div>
                {contacts.length === 0 ? (
                  <p className="text-xs text-stone-400 p-3 rounded-xl bg-stone-900/70 border border-stone-800">
                    Belum ada kontak tersimpan. Anda tetap bisa membuat grup sekarang atau tambahkan teman lewat menu Kontak Baru terlebih dahulu.
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {contacts.map((c) => {
                      const checked = selectedMemberUids.includes(c.contactUid);
                      return (
                        <label
                          key={c.contactUid}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                            checked
                              ? 'bg-[#3A2B14]/75 border-[#FDBA74]/45'
                              : 'bg-stone-900/70 border-stone-800 hover:bg-stone-800/70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMember(c.contactUid)}
                            className="accent-[#FDBA74] w-4 h-4"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-amber-50 truncate">
                              {c.contactName}
                            </div>
                            <div className="text-[11px] font-mono text-stone-400 truncate">
                              {c.phoneNumber}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {groupError && (
                <div role="alert" className="text-xs text-red-300">
                  {groupError}
                </div>
              )}

              <button
                type="submit"
                disabled={groupBusy || !groupName.trim()}
                data-testid="wa-create-group-button"
                className="w-full py-2.5 px-4 text-sm font-semibold text-stone-950 bg-gradient-to-r from-[#F7DC9C] via-[#FDBA74] to-[#E5A852] hover:brightness-105 disabled:opacity-45 rounded-xl transition-all cursor-pointer"
              >
                {groupBusy ? 'Membuat Grup...' : 'Buat Grup E2EE'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
