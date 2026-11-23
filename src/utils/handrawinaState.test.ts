import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterConversations,
  formatDuration,
  formatIdr,
  getTotalUnreadCount,
  upsertMessageIdempotent,
} from './handrawinaState';
import type { ChatMessage, Conversation } from '../types/handrawina';

const sampleConversations: Conversation[] = [
  {
    id: 'c1',
    name: 'Raka Pratama',
    handle: 'Direct',
    kind: 'direct',
    initials: 'RP',
    unreadCount: 0,
    lastActiveText: 'Online',
    online: true,
    participantCount: 2,
    peerPublicKeyFingerprint: 'abc',
    labels: [],
    pinned: true,
  },
  {
    id: 'c2',
    name: 'Grup Nasional',
    handle: 'Grup 1.500',
    kind: 'group',
    initials: 'GN',
    unreadCount: 3,
    lastActiveText: '1.500 peserta',
    online: true,
    participantCount: 1500,
    peerPublicKeyFingerprint: 'def',
    labels: [],
  },
  {
    id: 'c3',
    name: 'Nusantara Coffee',
    handle: 'Bisnis',
    kind: 'business',
    initials: 'NC',
    unreadCount: 1,
    lastActiveText: 'Aktif',
    online: true,
    participantCount: 2,
    peerPublicKeyFingerprint: 'ghi',
    labels: ['VIP'],
  },
];

test('filterConversations filters accurately by kind, unread, label, and search query', () => {
  assert.equal(filterConversations(sampleConversations, { query: '', filter: 'all' }).length, 3);
  assert.equal(filterConversations(sampleConversations, { query: '', filter: 'unread' }).length, 2);
  assert.equal(filterConversations(sampleConversations, { query: '', filter: 'group' }).length, 1);
  assert.equal(
    filterConversations(sampleConversations, { query: 'coffee', filter: 'business', label: 'VIP' }).length,
    1
  );
  assert.equal(
    filterConversations(sampleConversations, { query: 'tidak-ada', filter: 'all' }).length,
    0
  );
  const favs = filterConversations(sampleConversations, { query: '', filter: 'favorite' });
  assert.equal(favs.length, 1);
  assert.equal(favs[0].id, 'c1');
  assert.equal(getTotalUnreadCount(sampleConversations), 4);
});

test('upsertMessageIdempotent avoids duplicates and updates delivery status in place', () => {
  const m1: ChatMessage = {
    id: 'm-1',
    conversationId: 'c1',
    senderId: 'self',
    senderName: 'Bima',
    senderDeviceId: 'dev-1',
    kind: 'text',
    plaintext: 'Halo',
    timestamp: '10:00',
    status: 'sending',
  };

  const step1 = upsertMessageIdempotent([], m1);
  assert.equal(step1.length, 1);

  const step2 = upsertMessageIdempotent(step1, { ...m1, status: 'delivered' });
  assert.equal(step2.length, 1);
  assert.equal(step2[0].status, 'delivered');
});

test('formatting helpers format Rupiah and call durations cleanly', () => {
  assert.equal(formatIdr(115000), 'Rp 115.000');
  assert.equal(formatDuration(125), '02:05');
});
