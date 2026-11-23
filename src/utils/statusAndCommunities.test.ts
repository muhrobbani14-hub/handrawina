import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_THEMES,
  computeCommunityStats,
  filterCommunities,
  groupStatusesByViewed,
  validateCommunityInput,
  validateStatusDraft,
} from './statusAndCommunities';
import type { Community, Conversation, StatusUpdate } from '../types/handrawina';

test('validateStatusDraft rejects empty or overly long status text and validates enums', () => {
  assert.deepEqual(
    STATUS_THEMES.map((t) => t.label),
    ['Biru Dongker', 'Emas Sampanye', 'Orange Light', 'Perunggu Senja']
  );

  const emptyRes = validateStatusDraft({ text: '   ' });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error);

  const tooLongRes = validateStatusDraft({ text: 'a'.repeat(425) });
  assert.equal(tooLongRes.valid, false);

  const okRes = validateStatusDraft({
    text: 'Rilis enkripsi Sender Keys v4 berjalan mulus.',
    theme: 'orange-light',
    audience: 'close-circle',
    captionTag: 'Rilis Keamanan',
  });
  assert.equal(okRes.valid, true);
  assert.equal(okRes.theme, 'orange-light');
  assert.equal(okRes.audience, 'close-circle');
  assert.equal(okRes.captionTag, 'Rilis Keamanan');

  const navyRes = validateStatusDraft({
    text: 'Pembaruan biru dongker.',
    theme: 'navy',
  });
  assert.equal(navyRes.valid, true);
  assert.equal(navyRes.theme, 'navy');

  const fallbackEnum = validateStatusDraft({
    text: 'Pembaruan sore ini.',
    theme: 'invalid-theme',
    audience: 'invalid-audience',
  });
  assert.equal(fallbackEnum.valid, true);
  assert.equal(fallbackEnum.theme, 'champagne');
  assert.equal(fallbackEnum.audience, 'all-contacts');
});

test('groupStatusesByViewed cleanly separates own, unviewed, and viewed statuses', () => {
  const sample: StatusUpdate[] = [
    {
      id: 'st-1',
      authorId: 'self',
      authorName: 'Bima Santoso',
      authorInitials: 'BS',
      text: 'Status saya',
      theme: 'champagne',
      audience: 'all-contacts',
      createdAt: '09:00',
      expiresInLabel: '23 jam tersisa',
      viewedByMe: true,
      viewerNames: ['Raka Pratama'],
      reactions: [],
    },
    {
      id: 'st-2',
      authorId: 'peer-raka',
      authorName: 'Raka Pratama',
      authorInitials: 'RP',
      text: 'Status belum dilihat',
      theme: 'navy',
      audience: 'all-contacts',
      createdAt: '10:00',
      expiresInLabel: '22 jam tersisa',
      viewedByMe: false,
      viewerNames: [],
      reactions: [],
    },
    {
      id: 'st-3',
      authorId: 'peer-nadia',
      authorName: 'Nadia Kusuma',
      authorInitials: 'NK',
      text: 'Status sudah dilihat',
      theme: 'orange-light',
      audience: 'all-contacts',
      createdAt: '08:30',
      expiresInLabel: '20 jam tersisa',
      viewedByMe: true,
      viewerNames: ['Bima Santoso'],
      reactions: [],
    },
  ];

  const grouped = groupStatusesByViewed(sample, 'self');
  assert.equal(grouped.mine.length, 1);
  assert.equal(grouped.unviewedContacts.length, 1);
  assert.equal(grouped.viewedContacts.length, 1);
  assert.equal(grouped.unviewedContacts[0].id, 'st-2');
});

test('validateCommunityInput enforces name and description rules', () => {
  assert.equal(validateCommunityInput({ name: 'AB', description: 'Deskripsi lengkap' }).valid, false);
  assert.equal(validateCommunityInput({ name: 'Komunitas Baru', description: 'Pendek' }).valid, true);
  assert.equal(validateCommunityInput({ name: 'Komunitas Baru', description: '123' }).valid, false);

  const ok = validateCommunityInput({
    name: 'Lingkar Kriptografi',
    description: 'Diskusi protokol keamanan E2EE dan audit terbuka.',
    category: 'Teknologi & Keamanan',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.category, 'Teknologi & Keamanan');
});

test('filterCommunities and computeCommunityStats work accurately with live conversations', () => {
  const communities: Community[] = [
    {
      id: 'comm-1',
      name: 'Komunitas Keamanan Siber',
      initials: 'KS',
      category: 'Teknologi & Keamanan',
      description: 'Forum arsitektur keamanan E2EE.',
      memberCount: 1520,
      adminName: 'Raka Pratama',
      subGroups: [
        {
          id: 'sg-1',
          conversationId: 'conv-eng-1500',
          name: 'Arsitektur & Keamanan Nasional',
          description: 'Diskusi utama',
          participantCount: 1482,
          senderKeyEpoch: 42,
          joined: true,
        },
        {
          id: 'sg-2',
          name: 'Respon Insiden SOC',
          description: 'Koordinasi cepat',
          participantCount: 110,
          senderKeyEpoch: 9,
          joined: false,
        },
      ],
      announcements: [],
    },
  ];

  const convs: Conversation[] = [
    {
      id: 'conv-eng-1500',
      name: 'Arsitektur & Keamanan Nasional',
      handle: 'Grup E2EE',
      kind: 'group',
      initials: 'AK',
      unreadCount: 0,
      lastActiveText: 'Online',
      online: true,
      participantCount: 1490,
      peerPublicKeyFingerprint: 'abc',
      labels: [],
    },
  ];

  assert.equal(filterCommunities(communities, 'soc').length, 1);
  assert.equal(filterCommunities(communities, 'kuliner').length, 0);

  const stats = computeCommunityStats(communities[0], convs);
  assert.equal(stats.totalSubGroups, 2);
  assert.equal(stats.joinedSubGroups, 1);
  assert.equal(stats.totalMembers, 1600);
});
