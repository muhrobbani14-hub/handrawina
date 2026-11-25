import type { Conversation } from '../types/handrawina';
import {
  clampStr,
  deriveInitials,
  resolvePeerPerspective,
  type FirestoreConversationRecord,
} from './multiUserChat';

export const PHONE_AUTH_DOMAIN = 'phone.handrawina.app';

export interface CountryDialOption {
  code: string;
  label: string;
  flag: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '+62', label: 'Indonesia (+62)', flag: 'ID' },
  { code: '+60', label: 'Malaysia (+60)', flag: 'MY' },
  { code: '+65', label: 'Singapura (+65)', flag: 'SG' },
  { code: '+61', label: 'Australia (+61)', flag: 'AU' },
  { code: '+81', label: 'Jepang (+81)', flag: 'JP' },
  { code: '+1', label: 'Amerika Serikat (+1)', flag: 'US' },
  { code: '+44', label: 'Inggris (+44)', flag: 'GB' },
];

export interface NormalizedPhoneIdentity {
  e164: string;
  phoneKey: string;
  formatted: string;
  authEmail: string;
}

export interface SavedContactRecord {
  contactUid: string;
  ownerUid: string;
  contactName: string;
  profileName: string;
  phoneNumber: string;
  phoneKey: string;
  initials: string;
  aboutText: string;
  fingerprintHex: string;
  publicKeyJwkX: string;
  publicKeyJwkY: string;
}

export interface UserDirectoryProfile {
  uid: string;
  displayName: string;
  initials: string;
}

export interface PhoneDirectoryRecord {
  phoneKey: string;
  phoneNumber: string;
  uid: string;
  displayName: string;
  initials: string;
  aboutText: string;
  fingerprintHex: string;
  publicKeyJwkX: string;
  publicKeyJwkY: string;
  online: boolean;
}

/**
 * Formats an E.164 or digit-only phone number into a readable WhatsApp-style label.
 * Example: '6281234567890' -> '+62 812-3456-7890'
 */
export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('62') && digits.length >= 10) {
    const local = digits.slice(2);
    if (local.length <= 7) {
      return `+62 ${local.slice(0, 3)}-${local.slice(3)}`;
    }
    if (local.length <= 10) {
      return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
    }
    return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7, 11)}${
      local.length > 11 ? `-${local.slice(11)}` : ''
    }`;
  }

  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length > 6) {
    const cc = digits.slice(0, 2);
    const rest = digits.slice(2);
    const groups = rest.match(/.{1,4}/g) ?? [rest];
    return `+${cc} ${groups.join('-')}`;
  }

  return `+${digits}`;
}

/**
 * Normalizes any local or international phone input into a canonical phoneKey (digits only),
 * E.164 string, readable display format, and virtual Firebase Auth email identity.
 */
export function normalizePhoneForAuth(
  rawInput: string,
  defaultCountryCode = '+62'
): { ok: true; identity: NormalizedPhoneIdentity } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: 'Masukkan nomor telepon terlebih dahulu.' };
  }

  const ccDigits = defaultCountryCode.replace(/\D/g, '') || '62';
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return { ok: false, error: 'Nomor telepon hanya boleh berisi angka.' };
  }

  if (hasPlus) {
    // International format already includes country code
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `${ccDigits}${digits.slice(1)}`;
  } else if (digits.startsWith(ccDigits) && digits.length >= ccDigits.length + 7) {
    // Already starts with country code digits (e.g. 62812...)
  } else {
    digits = `${ccDigits}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return {
      ok: false,
      error: 'Panjang nomor telepon harus antara 8 hingga 15 digit termasuk kode negara.',
    };
  }

  const e164 = `+${digits}`;
  return {
    ok: true,
    identity: {
      e164,
      phoneKey: digits,
      formatted: formatPhoneDisplay(digits),
      authEmail: `${digits}@${PHONE_AUTH_DOMAIN}`,
    },
  };
}

/**
 * Extracts phone identity from our internal phone auth email (`628xxx@phone.handrawina.app`).
 */
export function extractPhoneFromAuthEmail(
  email: string | null | undefined
): NormalizedPhoneIdentity | null {
  if (!email) return null;
  const match = email.trim().toLowerCase().match(/^([0-9]{8,15})@phone\.handrawina\.app$/);
  if (!match) return null;
  const phoneKey = match[1];
  return {
    e164: `+${phoneKey}`,
    phoneKey,
    formatted: formatPhoneDisplay(phoneKey),
    authEmail: `${phoneKey}@${PHONE_AUTH_DOMAIN}`,
  };
}

export function validatePhonePin(pin: string): { ok: true } | { ok: false; error: string } {
  const trimmed = pin.trim();
  if (trimmed.length < 6) {
    return { ok: false, error: 'PIN / kata sandi minimal 6 karakter agar akun terlindungi.' };
  }
  if (trimmed.length > 64) {
    return { ok: false, error: 'PIN / kata sandi maksimal 64 karakter.' };
  }
  return { ok: true };
}

export function validateContactNickname(name: string): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = clampStr(name, 80, '');
  if (!cleaned) {
    return { ok: false, error: 'Nama kontak tidak boleh kosong.' };
  }
  return { ok: true, value: cleaned };
}

export interface WhatsAppConversationMeta {
  conversation: Conversation;
  peerUid: string;
  peerPhone: string;
  peerProfileName: string;
  isSavedContact: boolean;
}

/**
 * Maps a Firestore conversation into WhatsApp-style display metadata using the user's
 * personal saved contacts book:
 * - Saved peer -> displays the user's chosen contact name + formatted phone number.
 * - Unsaved peer -> displays the sender's phone number + `~ProfileName` (just like WhatsApp)
 *   and flags `isSavedContact = false` so the chat header offers "Simpan ke Kontak".
 */
export function resolveWhatsAppConversationMeta(
  doc: FirestoreConversationRecord,
  currentUid: string,
  unreadCount: number,
  contactsByUid: Record<string, SavedContactRecord>
): WhatsAppConversationMeta {
  const peer = resolvePeerPerspective(doc, currentUid);
  const isDirect = doc.kind === 'direct';
  const saved = isDirect && peer.peerUid ? contactsByUid[peer.peerUid] : undefined;

  const peerPhone = saved?.phoneNumber || peer.peerPhone || '';
  const peerProfileName = peer.peerName || saved?.profileName || 'Pengguna Handrawina';

  let displayName = doc.name;
  let displayHandle = doc.handle;
  let displayInitials = doc.initials;
  const labels: string[] = [];

  if (isDirect) {
    if (saved) {
      displayName = saved.contactName;
      displayHandle = peerPhone
        ? `${peerPhone} · E2EE Terverifikasi`
        : `E2EE Terverifikasi · ${peer.peerFingerprint.slice(0, 8).toUpperCase()}`;
      displayInitials = deriveInitials(saved.contactName);
      labels.push('Kontak');
    } else if (peerPhone) {
      displayName = peerPhone;
      displayHandle = `~${peerProfileName} · Belum di kontak`;
      displayInitials = peer.peerInitials || deriveInitials(peerProfileName);
      labels.push('Nomor Baru');
    } else {
      displayName = peerProfileName;
      displayHandle = peer.peerUid
        ? `E2EE Terverifikasi · ${peer.peerFingerprint.slice(0, 8).toUpperCase()}`
        : doc.handle;
      displayInitials = peer.peerInitials || deriveInitials(peerProfileName);
      labels.push('Terhubung');
    }
  } else {
    labels.push('Grup E2EE');
  }

  return {
    conversation: {
      id: doc.id,
      name: displayName,
      handle: displayHandle,
      kind: doc.kind,
      initials: displayInitials,
      unreadCount,
      lastActiveText: doc.lastActiveText || 'Aktif',
      online: true,
      participantCount: Math.max(doc.participantIds.length, isDirect ? 2 : 1),
      senderKeyEpoch: doc.senderKeyEpoch,
      peerPublicKeyFingerprint: peer.peerFingerprint || '0000000000000000',
      labels,
    },
    peerUid: peer.peerUid,
    peerPhone,
    peerProfileName,
    isSavedContact: !isDirect || Boolean(saved),
  };
}

export function filterSavedContacts(
  contacts: SavedContactRecord[],
  query: string
): SavedContactRecord[] {
  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, '');
  if (!q) {
    return [...contacts].sort((a, b) => a.contactName.localeCompare(b.contactName, 'id-ID'));
  }
  return contacts
    .filter((c) => {
      if (c.contactName.toLowerCase().includes(q)) return true;
      if (c.profileName.toLowerCase().includes(q)) return true;
      if (c.phoneNumber.toLowerCase().includes(q)) return true;
      if (qDigits && c.phoneKey.includes(qDigits)) return true;
      return false;
    })
    .sort((a, b) => a.contactName.localeCompare(b.contactName, 'id-ID'));
}
