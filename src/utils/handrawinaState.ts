import type { ChatMessage, Conversation } from '../types/handrawina';

export type ChatFilterKind = 'all' | 'unread' | 'favorite' | 'group' | 'business';

/**
 * Filters conversations by search query, tab filter, and optional business customer label.
 */
export function filterConversations(
  conversations: Conversation[],
  options: { query: string; filter: ChatFilterKind; label?: string | null }
): Conversation[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return conversations.filter((conv) => {
    if (options.filter === 'unread' && conv.unreadCount <= 0) return false;
    if (options.filter === 'favorite' && !conv.pinned) return false;
    if (options.filter === 'group' && conv.kind !== 'group') return false;
    if (options.filter === 'business' && conv.kind !== 'business') return false;
    if (options.label && !conv.labels.includes(options.label)) return false;

    if (normalizedQuery) {
      const haystack = `${conv.name} ${conv.handle} ${conv.labels.join(' ')}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

/**
 * Computes total unread message badge count across all conversations.
 */
export function getTotalUnreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, conv) => sum + Math.max(0, conv.unreadCount), 0);
}

/**
 * Idempotent message insertion (prevents duplicates during WebSocket reconnects or optimistic sends).
 */
export function upsertMessageIdempotent(
  existing: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] {
  const idx = existing.findIndex((m) => m.id === incoming.id);
  if (idx === -1) {
    return [...existing, incoming];
  }
  const updated = [...existing];
  updated[idx] = { ...updated[idx], ...incoming };
  return updated;
}

/**
 * Formats Indonesian Rupiah cleanly for Business catalog items.
 */
export function formatIdr(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

/**
 * Formats call duration seconds into mm:ss.
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
