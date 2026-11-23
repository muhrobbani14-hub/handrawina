import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  KeyRound,
  Megaphone,
  MessageSquare,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Community, Conversation } from '../../types/handrawina';
import type { JoinBarcodeMode } from './JoinBarcodeModal';
import {
  computeCommunityStats,
  filterCommunities,
  validateCommunityInput,
} from '../../utils/statusAndCommunities';

interface CommunitiesWorkspaceProps {
  communities: Community[];
  conversations: Conversation[];
  onCreateCommunity: (params: {
    name: string;
    description: string;
    category: string;
    initialGroupName?: string;
  }) => Promise<{ ok: boolean; error?: string; communityId?: string }>;
  onPostAnnouncement: (
    communityId: string,
    text: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onAddSubGroup: (
    communityId: string,
    params: { name: string; description?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onJoinSubGroup: (
    communityId: string,
    groupId: string
  ) => Promise<{ ok: boolean; conversationId?: string }>;
  onOpenGroupChat: (conversationId: string) => void;
  onRotateGroupEpoch: (conversationId: string) => Promise<void>;
  onStartGroupCall: (conv: Conversation, mode: 'audio' | 'video') => void;
  onOpenJoinBarcode: (mode: JoinBarcodeMode) => void;
}

const COMMUNITY_CATEGORIES = [
  'Teknologi & Keamanan',
  'Produk & Desain',
  'Eksekutif & Bisnis',
  'Komunitas Umum',
];

export function CommunitiesWorkspace({
  communities,
  conversations,
  onCreateCommunity,
  onPostAnnouncement,
  onAddSubGroup,
  onJoinSubGroup,
  onOpenGroupChat,
  onRotateGroupEpoch,
  onStartGroupCall,
  onOpenJoinBarcode,
}: CommunitiesWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(communities[0]?.id ?? '');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Create Community Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [newCommCategory, setNewCommCategory] = useState(COMMUNITY_CATEGORIES[0]);
  const [newCommInitialGroup, setNewCommInitialGroup] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingComm, setCreatingComm] = useState(false);

  // Announcement form
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [postingAnn, setPostingAnn] = useState(false);

  // Add Sub-Group inline form
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [subGroupName, setSubGroupName] = useState('');
  const [subGroupDesc, setSubGroupDesc] = useState('');
  const [subGroupError, setSubGroupError] = useState<string | null>(null);
  const [addingSubGroup, setAddingSubGroup] = useState(false);

  // Busy tracking
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [rotatingConvId, setRotatingConvId] = useState<string | null>(null);

  const filteredCommunities = useMemo(
    () => filterCommunities(communities, searchQuery),
    [communities, searchQuery]
  );

  const activeCommunity = useMemo(
    () => communities.find((c) => c.id === selectedId) ?? communities[0] ?? null,
    [communities, selectedId]
  );

  const allGroupConversations = useMemo(
    () => conversations.filter((c) => c.kind === 'group'),
    [conversations]
  );

  const convById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations]
  );

  const activeStats = useMemo(
    () => (activeCommunity ? computeCommunityStats(activeCommunity, conversations) : null),
    [activeCommunity, conversations]
  );

  const handleCreateCommunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = validateCommunityInput({
      name: newCommName,
      description: newCommDesc,
      category: newCommCategory,
    });
    if (!checked.valid) {
      setCreateError(checked.error ?? 'Data komunitas belum lengkap.');
      return;
    }

    setCreatingComm(true);
    setCreateError(null);
    try {
      const res = await onCreateCommunity({
        name: checked.cleanName,
        description: checked.cleanDescription,
        category: checked.category,
        initialGroupName: newCommInitialGroup.trim() || undefined,
      });
      if (!res.ok) {
        setCreateError(res.error ?? 'Gagal membuat komunitas.');
        return;
      }
      setNewCommName('');
      setNewCommDesc('');
      setNewCommInitialGroup('');
      setShowCreateModal(false);
      if (res.communityId) {
        setSelectedId(res.communityId);
        setMobileShowDetail(true);
      }
    } finally {
      setCreatingComm(false);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommunity) return;
    if (announcementText.trim().length < 3) {
      setAnnouncementError('Tulis isi pengumuman minimal 3 karakter.');
      return;
    }
    setPostingAnn(true);
    setAnnouncementError(null);
    try {
      const res = await onPostAnnouncement(activeCommunity.id, announcementText.trim());
      if (!res.ok) {
        setAnnouncementError(res.error ?? 'Gagal mengirim pengumuman.');
        return;
      }
      setAnnouncementText('');
    } finally {
      setPostingAnn(false);
    }
  };

  const handleAddSubGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommunity) return;
    if (subGroupName.trim().length < 3) {
      setSubGroupError('Nama sub-grup minimal 3 karakter.');
      return;
    }
    setAddingSubGroup(true);
    setSubGroupError(null);
    try {
      const res = await onAddSubGroup(activeCommunity.id, {
        name: subGroupName.trim(),
        description: subGroupDesc.trim() || undefined,
      });
      if (!res.ok) {
        setSubGroupError(res.error ?? 'Gagal menambah sub-grup.');
        return;
      }
      setSubGroupName('');
      setSubGroupDesc('');
      setShowAddGroup(false);
    } finally {
      setAddingSubGroup(false);
    }
  };

  const handleJoinGroup = async (communityId: string, groupId: string) => {
    setJoiningGroupId(groupId);
    try {
      await onJoinSubGroup(communityId, groupId);
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handleRotateEpoch = async (conversationId: string) => {
    setRotatingConvId(conversationId);
    try {
      await onRotateGroupEpoch(conversationId);
    } finally {
      setRotatingConvId(null);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 bg-stone-950/24 overflow-hidden">
      {/* LEFT PANE: Communities & Active E2EE Groups Directory */}
      <aside
        aria-label="Direktori komunitas dan grup"
        className={`${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        } flex-col w-full lg:w-[340px] xl:w-[376px] shrink-0 border-r border-amber-200/15 bg-stone-950/72 backdrop-blur-md min-h-0`}
      >
        <div className="p-4 border-b border-amber-200/12 bg-stone-950/50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base font-display font-bold text-amber-50 truncate">
                Komunitas &amp; Grup
              </h1>
              <p className="text-xs text-stone-400 truncate">
                Sender Keys E2EE · Hingga 1.500 peserta/grup
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Komunitas
            </button>
          </div>

          <div className="relative">
            <Search
              className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="community-search-input" className="sr-only">
              Cari komunitas atau sub-grup
            </label>
            <input
              id="community-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari komunitas atau sub-grup..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-900/75 border border-amber-200/15 rounded-md text-stone-100 placeholder:text-stone-400 focus:outline-none focus:bg-stone-900 focus:border-amber-400/70 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-amber-200/10">
          {/* Communities List */}
          <section className="p-3.5 space-y-2" aria-label="Komunitas terdaftar">
            <div className="px-1 text-[11px] font-semibold text-amber-200/80">
              Komunitas Anda ({filteredCommunities.length})
            </div>
            {filteredCommunities.length === 0 ? (
              <p className="px-1 py-4 text-xs text-stone-400 text-center">
                Tidak ada komunitas yang cocok dengan pencarian Anda.
              </p>
            ) : (
              filteredCommunities.map((comm) => {
                const isSelected = activeCommunity?.id === comm.id;
                const stats = computeCommunityStats(comm, conversations);
                return (
                  <button
                    key={comm.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(comm.id);
                      setShowAddGroup(false);
                      setMobileShowDetail(true);
                    }}
                    className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-400/14 border-amber-300/35'
                        : 'bg-transparent border-transparent hover:bg-stone-900/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-stone-900 border border-amber-300/30 text-amber-200 text-xs font-display font-bold flex items-center justify-center shrink-0">
                      {comm.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-stone-100 truncate">
                        {comm.name}
                      </div>
                      <div className="text-[11px] text-amber-300/85 mt-0.5 truncate">
                        {comm.category}
                      </div>
                      <div className="text-[11px] text-stone-400 mt-1 font-mono tabular-nums">
                        {stats.totalSubGroups} grup · {stats.totalMembers.toLocaleString('id-ID')} anggota
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </section>

          {/* Direct Shortcut to All Joined Groups */}
          <section className="p-3.5 space-y-2" aria-label="Semua grup aktif di obrolan">
            <div className="px-1 text-[11px] font-semibold text-stone-400">
              Grup E2EE Aktif ({allGroupConversations.length})
            </div>
            {allGroupConversations.map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => onOpenGroupChat(grp.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-stone-900/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-stone-900 border border-stone-700 text-stone-200 text-[11px] font-display font-bold flex items-center justify-center shrink-0">
                    {grp.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-stone-100 truncate">{grp.name}</div>
                    <div className="text-[11px] text-stone-400 font-mono tabular-nums">
                      {grp.participantCount.toLocaleString('id-ID')} peserta · Epoch {grp.senderKeyEpoch ?? 1}
                    </div>
                  </div>
                </div>
                <MessageSquare className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </section>
        </div>
      </aside>

      {/* RIGHT PANE: Active Community Detail, Announcements & Sub-Groups */}
      <section
        aria-label="Detail komunitas dan daftar sub-grup"
        className={`${
          mobileShowDetail ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col min-w-0 min-h-0 overflow-y-auto px-5 sm:px-8 py-6`}
      >
        {activeCommunity && activeStats ? (
          <div className="max-w-4xl w-full mx-auto space-y-6">
            <button
              type="button"
              onClick={() => setMobileShowDetail(false)}
              className="lg:hidden inline-flex items-center gap-1.5 text-xs font-medium text-amber-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Daftar Komunitas
            </button>

            {/* Community Overview Header Card */}
            <header className="bg-stone-950/76 backdrop-blur-md border border-amber-200/18 rounded-xl p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-amber-400/15 border border-amber-300/35 text-amber-200 text-base font-display font-bold flex items-center justify-center shrink-0">
                    {activeCommunity.initials}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-mono text-amber-300">
                      {activeCommunity.category} · Admin: {activeCommunity.adminName}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-display font-bold text-amber-50">
                      {activeCommunity.name}
                    </h2>
                    <p className="text-sm text-stone-300 leading-relaxed max-w-2xl">
                      {activeCommunity.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenJoinBarcode('invite')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-300/25 rounded-md transition-colors cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    Undang Barcode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddGroup((v) => !v);
                      setSubGroupError(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Tambah Sub-Grup
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-amber-200/12 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="text-stone-400">Total Anggota</div>
                  <div className="text-base font-display font-bold text-stone-100 font-mono tabular-nums mt-0.5">
                    {activeStats.totalMembers.toLocaleString('id-ID')}
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Sub-Grup Terhubung</div>
                  <div className="text-base font-display font-bold text-stone-100 font-mono tabular-nums mt-0.5">
                    {activeStats.joinedSubGroups} / {activeStats.totalSubGroups} diikuti
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Protokol Grup</div>
                  <div className="text-base font-display font-bold text-amber-200 mt-0.5">
                    Sender Keys O(1)
                  </div>
                </div>
              </div>
            </header>

            {/* Optional Inline Form to Add a Sub-Group */}
            {showAddGroup && (
              <form
                onSubmit={handleAddSubGroupSubmit}
                className="bg-stone-950/82 backdrop-blur-md border border-amber-300/30 rounded-xl p-5 space-y-3.5"
                data-testid="add-subgroup-form"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold text-amber-100">
                    Tambah Sub-Grup E2EE Baru ke {activeCommunity.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddGroup(false)}
                    aria-label="Tutup form sub-grup"
                    className="p-1 text-stone-400 hover:text-stone-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="subgroup-name-input" className="block text-xs font-medium text-stone-200 mb-1">
                      Nama Sub-Grup
                    </label>
                    <input
                      id="subgroup-name-input"
                      type="text"
                      value={subGroupName}
                      onChange={(e) => {
                        setSubGroupName(e.target.value);
                        setSubGroupError(null);
                      }}
                      placeholder="Mis. Audit Protokol & QA"
                      className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                    />
                  </div>
                  <div>
                    <label htmlFor="subgroup-desc-input" className="block text-xs font-medium text-stone-200 mb-1">
                      Topik Singkat (Opsional)
                    </label>
                    <input
                      id="subgroup-desc-input"
                      type="text"
                      value={subGroupDesc}
                      onChange={(e) => setSubGroupDesc(e.target.value)}
                      placeholder="Tujuan atau aturan diskusi sub-grup"
                      className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                    />
                  </div>
                </div>

                {subGroupError && <p className="text-xs text-red-300">{subGroupError}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddGroup(false)}
                    className="px-3.5 py-2 text-xs text-stone-300 hover:text-stone-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={addingSubGroup}
                    className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md cursor-pointer"
                  >
                    {addingSubGroup ? 'Membuat...' : 'Buat Sub-Grup'}
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Groups Section */}
            <section className="space-y-3" aria-label="Daftar sub-grup komunitas">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-amber-50 flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-300" aria-hidden="true" />
                  Grup dalam Komunitas ({activeCommunity.subGroups.length})
                </h3>
                <span className="text-xs text-stone-400">
                  Terhubung langsung ke ruang Obrolan &amp; Telepon SFU
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {activeCommunity.subGroups.map((sg) => {
                  const liveConv = sg.conversationId ? convById.get(sg.conversationId) : undefined;
                  const memberCount = liveConv ? liveConv.participantCount : sg.participantCount;
                  const epoch = liveConv?.senderKeyEpoch ?? sg.senderKeyEpoch;

                  return (
                    <div
                      key={sg.id}
                      data-testid={`subgroup-card-${sg.id}`}
                      className="bg-stone-950/72 backdrop-blur-md border border-amber-200/15 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-stone-100">{sg.name}</h4>
                          <span className="text-[11px] font-mono text-amber-300">
                            {sg.joined ? 'Anggota Aktif' : 'Terbuka untuk Anggota'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-300 leading-relaxed">{sg.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-stone-400 pt-0.5 tabular-nums">
                          <span>{memberCount.toLocaleString('id-ID')} / 1.500 peserta</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-stone-300">
                            <Shield className="w-3 h-3 text-amber-300" aria-hidden="true" />
                            Sender Keys Epoch {epoch}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {sg.joined && liveConv ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRotateEpoch(liveConv.id)}
                              disabled={rotatingConvId === liveConv.id}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-200 bg-stone-900/85 border border-stone-700/80 hover:bg-stone-800 rounded-md transition-colors cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                              {rotatingConvId === liveConv.id ? 'Merotasi...' : 'Rotasi Epoch'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartGroupCall(liveConv, 'video')}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-200 bg-stone-900/85 border border-stone-700/80 hover:bg-stone-800 rounded-md transition-colors cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                              Panggilan
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenGroupChat(liveConv.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                              Buka Obrolan
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={joiningGroupId === sg.id}
                            onClick={() => handleJoinGroup(activeCommunity.id, sg.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md transition-colors cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                            {joiningGroupId === sg.id ? 'Bergabung...' : 'Gabung Grup'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Announcements Channel Section */}
            <section
              aria-label="Saluran pengumuman komunitas"
              className="bg-stone-950/74 backdrop-blur-md border border-amber-200/15 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-display font-bold text-amber-50 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-300" aria-hidden="true" />
                  Saluran Pengumuman Komunitas
                </h3>
                <span className="text-[11px] font-mono text-stone-400">
                  Siaran Terenkripsi ke Seluruh Anggota
                </span>
              </div>

              <form onSubmit={handlePostAnnouncement} className="space-y-2">
                <div className="flex gap-2">
                  <label htmlFor="community-announcement-input" className="sr-only">
                    Tulis pengumuman komunitas
                  </label>
                  <input
                    id="community-announcement-input"
                    type="text"
                    value={announcementText}
                    onChange={(e) => {
                      setAnnouncementText(e.target.value);
                      setAnnouncementError(null);
                    }}
                    placeholder="Kirim pengumuman resmi ke seluruh sub-grup komunitas..."
                    className="flex-1 min-w-0 px-3.5 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-400/75"
                  />
                  <button
                    type="submit"
                    disabled={postingAnn}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    Kirim
                  </button>
                </div>
                {announcementError && (
                  <p className="text-xs text-red-300" data-testid="announcement-error">
                    {announcementError}
                  </p>
                )}
              </form>

              <div className="divide-y divide-amber-200/10" data-testid="community-announcements-list">
                {activeCommunity.announcements.map((ann) => (
                  <div key={ann.id} className="py-3.5 first:pt-1 last:pb-0 space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-amber-200">
                        {ann.authorName}
                      </span>
                      <span className="text-[11px] font-mono text-stone-400 shrink-0">
                        {ann.timestamp}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">{ann.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
            <h2 className="text-lg font-display font-bold text-amber-50">
              Belum Ada Komunitas
            </h2>
            <p className="text-xs text-stone-300">
              Buat komunitas baru untuk menyatukan beberapa grup E2EE dan mengirim pengumuman resmi.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer"
            >
              Buat Komunitas Pertama
            </button>
          </div>
        )}
      </section>

      {/* Create Community Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buat Komunitas Baru"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-stone-950/92 backdrop-blur-2xl border border-amber-200/20 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] max-w-lg w-full overflow-hidden text-stone-100">
            <div className="px-5 py-4 border-b border-amber-200/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-300" aria-hidden="true" />
                <h2 className="text-base font-display font-bold text-stone-100">
                  Buat Komunitas &amp; Grup Baru
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Tutup dialog buat komunitas"
                className="p-1.5 text-stone-400 hover:text-stone-100 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCommunitySubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="new-comm-name" className="block text-xs font-medium text-stone-200 mb-1">
                  Nama Komunitas
                </label>
                <input
                  id="new-comm-name"
                  type="text"
                  value={newCommName}
                  onChange={(e) => {
                    setNewCommName(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="Mis. Komunitas Arsitek Cloud Indonesia"
                  className="w-full px-3 py-2 text-sm bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                />
              </div>

              <div>
                <label htmlFor="new-comm-category" className="block text-xs font-medium text-stone-200 mb-1">
                  Kategori Komunitas
                </label>
                <select
                  id="new-comm-category"
                  value={newCommCategory}
                  onChange={(e) => setNewCommCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 focus:outline-none focus:border-amber-400/75"
                >
                  {COMMUNITY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-comm-desc" className="block text-xs font-medium text-stone-200 mb-1">
                  Deskripsi Komunitas
                </label>
                <textarea
                  id="new-comm-desc"
                  rows={3}
                  value={newCommDesc}
                  onChange={(e) => {
                    setNewCommDesc(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="Jelaskan fokus diskusi dan tujuan komunitas ini..."
                  className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                />
              </div>

              <div>
                <label htmlFor="new-comm-first-group" className="block text-xs font-medium text-stone-200 mb-1">
                  Nama Sub-Grup Awal (Opsional)
                </label>
                <input
                  id="new-comm-first-group"
                  type="text"
                  value={newCommInitialGroup}
                  onChange={(e) => setNewCommInitialGroup(e.target.value)}
                  placeholder="Otomatis dibuat dan dihubungkan ke tab Obrolan"
                  className="w-full px-3 py-2 text-xs bg-stone-900/85 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/75"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-300 font-medium" data-testid="create-community-error">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/15">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-stone-300 hover:text-stone-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingComm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {creatingComm ? 'Membuat...' : 'Buat Komunitas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
