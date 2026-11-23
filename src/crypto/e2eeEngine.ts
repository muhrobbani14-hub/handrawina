import type { EncryptedEnvelope } from '../types/handrawina';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSubtle(): SubtleCrypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto SubtleCrypto API tidak tersedia di lingkungan ini.');
  }
  return cryptoApi.subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface IdentityKeyBundle {
  keyPair: CryptoKeyPair;
  publicKeyJwk: JsonWebKey;
  fingerprintHex: string;
}

/**
 * Generates an ECDH P-256 Identity / Prekey pair using real Web Crypto API.
 */
export async function generateEcdhKeyBundle(): Promise<IdentityKeyBundle> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const rawPub = await subtle.exportKey('raw', keyPair.publicKey);
  const digest = await subtle.digest('SHA-256', rawPub);
  const fingerprintHex = bytesToHex(new Uint8Array(digest)).slice(0, 32);

  return { keyPair, publicKeyJwk, fingerprintHex };
}

/**
 * Derives an AES-256-GCM session key using ECDH shared secret + HKDF-SHA256.
 */
export async function deriveSessionAesKey(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
  infoLabel: string
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: remotePublicKey },
    localPrivateKey,
    256
  );
  const hkdfBase = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEncoder.encode('Handrawina-Signal-X3DH-v1'),
      info: textEncoder.encode(infoLabel),
    },
    hkdfBase,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a deterministic conversation/session AES-256-GCM key from a shared room secret
 * or ratchet chain seed (used for multi-tab WebSocket E2EE rooms and Sender Keys).
 */
export async function deriveConversationKey(
  secretSeed: string,
  epoch: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const seedHash = await subtle.digest(
    'SHA-256',
    textEncoder.encode(`Handrawina-E2EE::${secretSeed}::epoch-${epoch}`)
  );
  return subtle.importKey('raw', seedHash, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypts plaintext into an authenticated AES-256-GCM envelope.
 */
export async function encryptE2eePayload(params: {
  key: CryptoKey;
  plaintext: string;
  aad: string;
  protocol: EncryptedEnvelope['protocol'];
  ratchetStep: number;
  senderKeyEpoch?: number;
}): Promise<EncryptedEnvelope> {
  const subtle = getSubtle();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: textEncoder.encode(params.aad),
    },
    params.key,
    textEncoder.encode(params.plaintext)
  );

  return {
    algorithm: 'AES-256-GCM',
    protocol: params.protocol,
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(encrypted)),
    ratchetStep: params.ratchetStep,
    senderKeyEpoch: params.senderKeyEpoch,
    aad: params.aad,
  };
}

/**
 * Decrypts and authenticates an AES-256-GCM envelope. Throws if tampered.
 */
export async function decryptE2eePayload(
  key: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<string> {
  const subtle = getSubtle();
  const iv = base64ToBytes(envelope.ivBase64);
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);

  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: textEncoder.encode(envelope.aad),
    },
    key,
    ciphertext as BufferSource
  );
  return textDecoder.decode(decrypted);
}

/**
 * Computes a Signal-style 60-digit Safety Number (12 groups of 5 digits)
 * from two parties' public key fingerprints (sorted canonically so both sides match).
 */
export async function computeSafetyNumber(
  localFingerprint: string,
  remoteFingerprint: string
): Promise<string> {
  const subtle = getSubtle();
  const ordered = [localFingerprint.toLowerCase(), remoteFingerprint.toLowerCase()].sort();
  const digest = await subtle.digest(
    'SHA-256',
    textEncoder.encode(`HandrawinaSafetyV1::${ordered[0]}::${ordered[1]}`)
  );
  const bytes = new Uint8Array(digest);
  const groups: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const offset = (i * 2) % (bytes.length - 2);
    const val = ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) % 100000;
    groups.push(String(val).padStart(5, '0'));
  }
  return groups.join(' ');
}

/**
 * Generates a 64-character hexadecimal (256-bit) Root Backup Key.
 */
export function generate64DigitRecoveryKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes).toUpperCase();
}

/**
 * Encrypts a JSON backup snapshot using PBKDF2-SHA256 + AES-256-GCM so the cloud
 * server only receives opaque ciphertext.
 */
export async function encryptCloudBackup(
  snapshotJson: string,
  secretPassphrase: string
): Promise<{ saltBase64: string; ivBase64: string; ciphertextBase64: string }> {
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await subtle.importKey(
    'raw',
    textEncoder.encode(secretPassphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    textEncoder.encode(snapshotJson)
  );

  return {
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts a previously encrypted cloud backup blob using the user's passphrase/key.
 */
export async function decryptCloudBackup(
  payload: { saltBase64: string; ivBase64: string; ciphertextBase64: string },
  secretPassphrase: string
): Promise<string> {
  const subtle = getSubtle();
  const salt = base64ToBytes(payload.saltBase64);
  const iv = base64ToBytes(payload.ivBase64);
  const ciphertext = base64ToBytes(payload.ciphertextBase64);

  const keyMaterial = await subtle.importKey(
    'raw',
    textEncoder.encode(secretPassphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    ciphertext as BufferSource
  );
  return textDecoder.decode(decrypted);
}
