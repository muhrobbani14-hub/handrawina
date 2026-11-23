import { useMemo, useState } from 'react';
import { PhoneOutgoing, Search, Users, Video, X } from 'lucide-react';
import type { Conversation } from '../../types/handrawina';

export interface OutgoingCallLaunchParams {
  mode: 'audio' | 'video';
  conversation: Conversation;
}

interface OutgoingCallModalProps {
  open: boolean;
  conversations: Conversation[];
  onClose: () => void;
  onLaunchOutgoingCall: (params: OutgoingCallLaunchParams) => void;
}

export function OutgoingCallModal({
  open,
  conversations,
  onClose,
  onLaunchOutgoingCall,
}: OutgoingCallModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const directConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter(
      (conversation) =>
        conversation.kind === 'direct' &&
        (!query ||
          conversation.name.toLowerCase().includes(query) ||
          conversation.handle.toLowerCase().includes(query))
    );
  }, [conversations, searchQuery]);

  if (!open) return null;

  const launch = (conversation: Conversation, mode: 'audio' | 'video') => {
    onLaunchOutgoingCall({ conversation, mode });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mulai panggilan dengan kontak Handrawina"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="outgoing-call-modal"
    >
      <div className="bg-stone-950/92 backdrop-blur-2xl border border-amber-200/20 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] max-w-lg w-full overflow-hidden text-stone-100">
        <div className="px-5 py-4 border-b border-amber-200/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <PhoneOutgoing className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-display font-bold text-stone-100 truncate">
                Panggilan Keluar
              </h2>
              <p className="text-xs text-stone-400 truncate">
                Pilih kontak Handrawina untuk memulai panggilan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela panggilan keluar"
            className="p-2 text-stone-400 hover:text-stone-100 hover:bg-white/5 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="outgoing-contact-search" className="sr-only">
              Cari kontak untuk panggilan keluar
            </label>
            <input
              id="outgoing-contact-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari kontak..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-900/80 border border-stone-700/80 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-300/60"
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-stone-800/80 border border-amber-200/15 bg-stone-900/50 rounded-md">
            {directConversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-400">
                Tidak ada kontak Handrawina yang cocok untuk dipanggil.
              </div>
            ) : (
              directConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-stone-800 border border-amber-200/20 text-amber-100 font-display font-bold text-xs flex items-center justify-center shrink-0">
                      {conversation.kind === 'group' ? (
                        <Users className="w-4 h-4 text-amber-300" aria-hidden="true" />
                      ) : (
                        conversation.initials
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-stone-100 truncate">
                        {conversation.name}
                      </div>
                      <div className="text-[11px] text-stone-400 truncate">
                        {conversation.handle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => launch(conversation, 'audio')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-200 bg-stone-900/85 border border-stone-700/80 hover:bg-stone-800 hover:text-white rounded-md transition-colors cursor-pointer"
                    >
                      <PhoneOutgoing className="w-3.5 h-3.5" aria-hidden="true" />
                      Suara
                    </button>
                    <button
                      type="button"
                      onClick={() => launch(conversation, 'video')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" aria-hidden="true" />
                      Video
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
