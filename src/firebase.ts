import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  normalizePhoneForAuth,
  validatePhonePin,
  type NormalizedPhoneIdentity,
} from './utils/phoneAuthAndContacts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied on test/connection still confirms live server reachability
    return true;
  }
}

function mapPhoneAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'Penyedia login belum diaktifkan di Firebase Console. Buka Firebase Console → Authentication → Sign-in method → aktifkan "Email/Password", lalu coba masuk lagi.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'Nomor telepon ini sudah terdaftar di Handrawina. Silakan pindah ke tab "Masuk" dan masukkan PIN Anda.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential')
  ) {
    return 'Nomor telepon atau PIN salah. Jika belum pernah mendaftar dengan nomor ini, silakan pilih tab "Daftar Baru".';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'PIN / kata sandi terlalu pendek. Gunakan minimal 6 karakter.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Koneksi internet terputus. Periksa jaringan Anda lalu coba lagi.';
  }
  return msg || 'Gagal memproses autentikasi nomor telepon.';
}

/**
 * Registers a brand-new Handrawina account using only Phone Number + PIN (Option A).
 * Internally maps the normalized E.164 phone number to Firebase Email/Password auth
 * so users never enter or see any Gmail address.
 */
export async function registerWithPhoneAndPin(params: {
  phoneInput: string;
  countryCode: string;
  pin: string;
  displayName: string;
}): Promise<{ user: User; phone: NormalizedPhoneIdentity }> {
  const phoneRes = normalizePhoneForAuth(params.phoneInput, params.countryCode);
  if (!phoneRes.ok) {
    throw new Error(phoneRes.error);
  }
  const pinRes = validatePhonePin(params.pin);
  if (!pinRes.ok) {
    throw new Error(pinRes.error);
  }
  const cleanName = params.displayName.trim().slice(0, 80);
  if (!cleanName) {
    throw new Error('Masukkan nama tampilan Anda untuk mendaftar.');
  }

  try {
    const cred = await createUserWithEmailAndPassword(
      auth,
      phoneRes.identity.authEmail,
      params.pin.trim()
    );
    await updateProfile(cred.user, { displayName: cleanName });
    return { user: cred.user, phone: phoneRes.identity };
  } catch (err) {
    throw new Error(mapPhoneAuthError(err));
  }
}

/**
 * Signs in an existing Handrawina account using Phone Number + PIN.
 */
export async function signInWithPhoneAndPin(params: {
  phoneInput: string;
  countryCode: string;
  pin: string;
}): Promise<{ user: User; phone: NormalizedPhoneIdentity }> {
  const phoneRes = normalizePhoneForAuth(params.phoneInput, params.countryCode);
  if (!phoneRes.ok) {
    throw new Error(phoneRes.error);
  }
  const pinRes = validatePhonePin(params.pin);
  if (!pinRes.ok) {
    throw new Error(pinRes.error);
  }

  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      phoneRes.identity.authEmail,
      params.pin.trim()
    );
    return { user: cred.user, phone: phoneRes.identity };
  } catch (err) {
    throw new Error(mapPhoneAuthError(err));
  }
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutHandrawina(): Promise<void> {
  await signOut(auth);
}
