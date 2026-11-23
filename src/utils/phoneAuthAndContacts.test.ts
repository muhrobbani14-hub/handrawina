import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPhoneFromAuthEmail,
  filterSavedContacts,
  formatPhoneDisplay,
  normalizePhoneForAuth,
  resolveWhatsAppConversationMeta,
  validateContactNickname,
  validatePhonePin,
  type SavedContactRecord,
} from './phoneAuthAndContacts';
import type { FirestoreConversationRecord } from './multiUserChat';

test('normalizePhoneForAuth normalizes local Indonesian 08xx, bare 8xx, 628xx, and +62 inputs identically', () => {
  const inputs = ['0812-3456-7890', '812 3456 7890', '6281234567890', '+62 812-3456-7890'];
  for (const raw of inputs) {
    const res = normalizePhoneForAuth(raw, '+62');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.identity.phoneKey, '6281234567890');
      assert.equal(res.identity.e164, '+6281234567890');
      assert.equal(res.identity.authEmail, '6281234567890@phone.handrawina.app');
      assert.equal(res.identity.formatted, '+62 812-3456-7890');
    }
  }
});

test('normalizePhoneForAuth supports international numbers and rejects invalid lengths', () => {
  const intl = normalizePhoneForAuth('+65 9123 4567', '+62');
  assert.equal(intl.ok, true);
  if (intl.ok) {
    assert.equal(intl.identity.phoneKey, '6591234567');
    assert.equal(intl.identity.authEmail, '6591234567@phone.handrawina.app');
  }

  const tooShort = normalizePhoneForAuth('0812', '+62');
  assert.equal(tooShort.ok, false);

  const empty = normalizePhoneForAuth('   ', '+62');
  assert.equal(empty.ok, false);
});

test('extractPhoneFromAuthEmail reverses virtual phone email cleanly and ignores Gmail addresses', () => {
  const extracted = extractPhoneFromAuthEmail('6281234567890@phone.handrawina.app');
  assert.ok(extracted);
  assert.equal(extracted.phoneKey, '6281234567890');
  assert.equal(extracted.formatted, '+62 812-3456-7890');

  assert.equal(extractPhoneFromAuthEmail('someone@gmail.com'), null);
  assert.equal(extractPhoneFromAuthEmail(null), null);
});

test('validatePhonePin and validateContactNickname enforce boundaries', () => {
  assert.equal(validatePhonePin('12345').ok, false);
  assert.equal(validatePhonePin('123456').ok, true);
  assert.equal(validateContactNickname('   ').ok, false);
  assert.equal(validateContactNickname('Budi Kantor').ok, true);
  assert.equal(formatPhoneDisplay('6281190234410'), '+62 811-9023-4410');
});

test('resolveWhatsAppConversationMeta displays saved contact nickname or unsaved phone number + ~ProfileName', () => {
  const convDoc: FirestoreConversationRecord = {
    id: 'dm_uidA_uidB',
    kind: 'direct',
    name: 'Rina',
    handle: 'Obrolan E2EE',
    initials: 'RN',
    creatorUid: 'uidA',
    participantIds: ['uidA', 'uidB'],
    userAUid: 'uidA',
    userAName: 'Ahmad K',
    userAInitials: 'AK',
    userAPhone: '+62 812-1111-2222',
    userAFingerprint: '1111222233334444',
    userAPublicKeyX: 'xA',
    userAPublicKeyY: 'yA',
    userBUid: 'uidB',
    userBName: 'Rina Wijaya',
    userBInitials: 'RW',
    userBPhone: '+62 813-9999-8888',
    userBFingerprint: '5555666677778888',
    userBPublicKeyX: 'xB',
    userBPublicKeyY: 'yB',
    senderKeyEpoch: 1,
    lastMessageText: 'Halo!',
    lastMessageSenderUid: 'uidA',
    lastActiveText: '12:00',
    typingUid: '',
    typingName: '',
  };

  const savedByA: Record<string, SavedContactRecord> = {
    uidB: {
      contactUid: 'uidB',
      ownerUid: 'uidA',
      contactName: 'Rina Kantor',
      profileName: 'Rina Wijaya',
      phoneNumber: '+62 813-9999-8888',
      phoneKey: '6281399998888',
      initials: 'RK',
      aboutText: 'Tersedia',
      fingerprintHex: '5555666677778888',
      publicKeyJwkX: 'xB',
      publicKeyJwkY: 'yB',
    },
  };

  // User A saved User B as "Rina Kantor"
  const viewA = resolveWhatsAppConversationMeta(convDoc, 'uidA', 0, savedByA);
  assert.equal(viewA.isSavedContact, true);
  assert.equal(viewA.conversation.name, 'Rina Kantor');
  assert.equal(viewA.peerPhone, '+62 813-9999-8888');

  // User B has NOT saved User A yet -> sees phone number and ~Ahmad K (WhatsApp behavior)
  const viewB = resolveWhatsAppConversationMeta(convDoc, 'uidB', 2, {});
  assert.equal(viewB.isSavedContact, false);
  assert.equal(viewB.conversation.name, '+62 812-1111-2222');
  assert.ok(viewB.conversation.handle.includes('~Ahmad K'));
  assert.equal(viewB.conversation.unreadCount, 2);
});

test('filterSavedContacts searches by nickname, profile name, and phone digits', () => {
  const list: SavedContactRecord[] = [
    {
      contactUid: 'u1',
      ownerUid: 'me',
      contactName: 'Budi Teknisi',
      profileName: 'Budi Santoso',
      phoneNumber: '+62 812-7777-1234',
      phoneKey: '6281277771234',
      initials: 'BT',
      aboutText: '',
      fingerprintHex: '1111222233334444',
      publicKeyJwkX: '',
      publicKeyJwkY: '',
    },
    {
      contactUid: 'u2',
      ownerUid: 'me',
      contactName: 'Ani Keuangan',
      profileName: 'Ani Putri',
      phoneNumber: '+62 856-2222-9999',
      phoneKey: '6285622229999',
      initials: 'AK',
      aboutText: '',
      fingerprintHex: '2222333344445555',
      publicKeyJwkX: '',
      publicKeyJwkY: '',
    },
  ];

  assert.equal(filterSavedContacts(list, '')[0].contactName, 'Ani Keuangan');
  assert.equal(filterSavedContacts(list, '7777').length, 1);
  assert.equal(filterSavedContacts(list, '7777')[0].contactUid, 'u1');
  assert.equal(filterSavedContacts(list, 'putri')[0].contactUid, 'u2');
});
