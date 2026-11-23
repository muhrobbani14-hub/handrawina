export interface GroupFanoutInput {
  participants: number;
  avgDevicesPerUser: number;
  messageSizeKb: number;
}

export interface GroupFanoutMetrics {
  participants: number;
  avgDevicesPerUser: number;
  messageSizeKb: number;
  totalRecipientDevices: number;
  pairwiseEncryptions: number;
  senderKeyEncryptions: number;
  encryptionReductionPct: number;
  pairwiseClientUploadKb: number;
  senderKeyClientUploadKb: number;
  bandwidthSavingsFactor: number;
  rotationSkdmMessages: number;
  estimatedServerFanoutMs: number;
}

/**
 * Pure calculation for comparing O(N*D) Pairwise Signal encryption
 * against O(1) Sender Keys encryption for large groups (up to 1,500 participants).
 */
export function calculateGroupFanoutMetrics(input: GroupFanoutInput): GroupFanoutMetrics {
  const participants = Math.max(2, Math.min(1500, Math.round(input.participants)));
  const avgDevicesPerUser = Math.max(1, Math.min(5, Math.round(input.avgDevicesPerUser)));
  const messageSizeKb = Math.max(1, Math.min(512, Number(input.messageSizeKb) || 1));

  // Recipients exclude the sender's own active device, while including sender's companion devices for self-sync
  const totalRecipientDevices = participants * avgDevicesPerUser - 1;

  // Pairwise Signal Protocol: client must encrypt individually for every target device
  const pairwiseEncryptions = totalRecipientDevices;
  // Sender Keys Protocol: client encrypts payload exactly once (O(1))
  const senderKeyEncryptions = 1;

  const encryptionReductionPct =
    pairwiseEncryptions > 0
      ? Number((((pairwiseEncryptions - senderKeyEncryptions) / pairwiseEncryptions) * 100).toFixed(2))
      : 0;

  // Signal ciphertext overhead (~0.18 KB header/MAC per ciphertext)
  const perCiphertextOverheadKb = 0.18;
  const pairwiseClientUploadKb = Number(
    (pairwiseEncryptions * (messageSizeKb + perCiphertextOverheadKb)).toFixed(2)
  );
  // Sender Keys uploads 1 ciphertext + Ed25519 signature (64B) + routing header (~0.25 KB)
  const senderKeyClientUploadKb = Number((messageSizeKb + 0.25).toFixed(2));

  const bandwidthSavingsFactor = Number(
    (pairwiseClientUploadKb / Math.max(0.01, senderKeyClientUploadKb)).toFixed(1)
  );

  // On member leave/eviction, sender rotates Sender Key and sends SKDM (~0.22 KB) via pairwise sessions
  const rotationSkdmMessages = totalRecipientDevices;

  // Server BEAM actor fan-out model: ~0.015 ms per parallel mailbox dispatch + 8 ms base ingress
  const estimatedServerFanoutMs = Number((8 + totalRecipientDevices * 0.015).toFixed(1));

  return {
    participants,
    avgDevicesPerUser,
    messageSizeKb,
    totalRecipientDevices,
    pairwiseEncryptions,
    senderKeyEncryptions,
    encryptionReductionPct,
    pairwiseClientUploadKb,
    senderKeyClientUploadKb,
    bandwidthSavingsFactor,
    rotationSkdmMessages,
    estimatedServerFanoutMs,
  };
}

export type HandshakeScenarioId = 'x3dh-ratchet' | 'sender-keys' | 'hsm-backup';

export interface HandshakePartyState {
  roleLabel: string;
  items: { key: string; value: string; sensitivity: 'private' | 'public' | 'ephemeral' | 'zero-knowledge' }[];
}

export interface HandshakeStep {
  stepNumber: number;
  title: string;
  summary: string;
  formula: string;
  securityProperty: string;
  initiator: HandshakePartyState;
  server: HandshakePartyState;
  responder: HandshakePartyState;
}

export interface HandshakeScenario {
  id: HandshakeScenarioId;
  title: string;
  shortLabel: string;
  description: string;
  steps: HandshakeStep[];
}

export const HANDSHAKE_SCENARIOS: HandshakeScenario[] = [
  {
    id: 'x3dh-ratchet',
    title: 'X3DH Key Agreement & Double Ratchet (1-on-1)',
    shortLabel: 'X3DH + Double Ratchet',
    description:
      'Simulasi pertukaran kunci asinkron Signal Protocol saat penerima sedang offline, dilanjutkan evolusi kunci Double Ratchet per pesan.',
    steps: [
      {
        stepNumber: 1,
        title: 'Registrasi Prekey Bundle Bob',
        summary:
          'Saat registrasi, perangkat Bob membuat pasangan kunci di Secure Enclave / Keystore dan hanya mengunggah komponen kunci publiknya ke Key Distribution Server.',
        formula: 'Sig_SPK = Ed25519_Sign(IK_B_priv, SPK_B_pub)',
        securityProperty: 'Private Key Isolation — Kunci privat tidak pernah keluar dari perangkat Bob.',
        initiator: {
          roleLabel: 'Perangkat Alice (Inisiator)',
          items: [
            { key: 'IK_A_priv / pub', value: 'Tersimpan di Keychain lokal', sensitivity: 'private' },
            { key: 'Sesi Bob', value: 'Belum terbentuk', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'Key Server (Zero-Knowledge)',
          items: [
            { key: 'Bob IK_B_pub', value: '0x9f2a...41c8 (Publik)', sensitivity: 'public' },
            { key: 'Bob SPK_B_pub + Sig', value: 'Rotasi tiap 7 hari', sensitivity: 'public' },
            { key: 'Kolam OPK_B', value: '100 kunci publik siap pakai', sensitivity: 'public' },
            { key: 'Kunci Privat', value: 'TIDAK PERNAH ADA DI SERVER', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob (Offline)',
          items: [
            { key: 'IK_B_priv', value: 'Terkunci di Secure Enclave', sensitivity: 'private' },
            { key: 'SPK_B_priv', value: 'Terkunci di Secure Enclave', sensitivity: 'private' },
            { key: 'OPK_B1..100_priv', value: 'Terkunci di DB terenkripsi lokal', sensitivity: 'private' },
          ],
        },
      },
      {
        stepNumber: 2,
        title: 'Pengambilan Prekey Bundle & Verifikasi Tanda Tangan',
        summary:
          'Alice meminta Prekey Bundle milik Bob. Server mengambil satu OPK_B1 secara atomik lalu langsung menghapusnya dari database agar tidak dipakai dua kali.',
        formula: 'Verify(IK_B_pub, SPK_B_pub, Sig_SPK) == TRUE',
        securityProperty: 'Replay Prevention — Penghapusan atomik OPK mencegah penggunaan ulang kunci.',
        initiator: {
          roleLabel: 'Perangkat Alice (Inisiator)',
          items: [
            { key: 'Bundle Bob', value: 'IK_B_pub, SPK_B_pub, OPK_B1_pub', sensitivity: 'public' },
            { key: 'Verifikasi Sig_SPK', value: 'Valid (Anti-MITM Server)', sensitivity: 'public' },
            { key: 'EK_A (Ephemeral)', value: 'Dibangkitkan baru (Curve25519)', sensitivity: 'ephemeral' },
          ],
        },
        server: {
          roleLabel: 'Key Server (Zero-Knowledge)',
          items: [
            { key: 'Aksi Atomik', value: 'DELETE OPK_B1 RETURNING pub_key', sensitivity: 'public' },
            { key: 'Sisa Kolam OPK_B', value: '99 kunci (trigger refill jika < 20)', sensitivity: 'public' },
            { key: 'Plaintext / SK', value: 'Tidak diketahui server', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob (Masih Offline)',
          items: [
            { key: 'Status Koneksi', value: 'Offline (Tidak perlu hadir)', sensitivity: 'public' },
            { key: 'OPK_B1_priv', value: 'Masih tersimpan menunggu pesan awal', sensitivity: 'private' },
          ],
        },
      },
      {
        stepNumber: 3,
        title: 'Kalkulasi 4x Diffie-Hellman (X3DH) & Shared Secret SK',
        summary:
          'Alice menghitung empat operasi Curve25519 DH yang menggabungkan kunci identitas jangka panjang dengan kunci ephemeral untuk menghasilkan Master Shared Secret (SK).',
        formula: 'SK = HKDF(DH(IK_A,SPK_B) || DH(EK_A,IK_B) || DH(EK_A,SPK_B) || DH(EK_A,OPK_B1))',
        securityProperty: 'Mutual Authentication & Forward Secrecy sejak paket pertama.',
        initiator: {
          roleLabel: 'Perangkat Alice (Inisiator)',
          items: [
            { key: 'DH1 + DH2', value: 'Autentikasi timbal balik (IK <-> SPK/EK)', sensitivity: 'ephemeral' },
            { key: 'DH3 + DH4', value: 'Forward Secrecy (EK <-> SPK/OPK)', sensitivity: 'ephemeral' },
            { key: 'Root Key RK_0', value: '0x7c11...e904 (Diturunkan via HKDF)', sensitivity: 'private' },
          ],
        },
        server: {
          roleLabel: 'Key Server (Zero-Knowledge)',
          items: [
            { key: 'Visibilitas DH', value: '0% (Operasi penuh di perangkat Alice)', sensitivity: 'zero-knowledge' },
            { key: 'Status', value: 'Menunggu ciphertext masuk', sensitivity: 'public' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob (Masih Offline)',
          items: [
            { key: 'Root Key RK_0', value: 'Belum dihitung (menunggu header pesan)', sensitivity: 'public' },
          ],
        },
      },
      {
        stepNumber: 4,
        title: 'Pengiriman Ciphertext Awal & Symmetric KDF Chain',
        summary:
          'Alice menurunkan Message Key MK_1 dari Sending Chain Key, mengenkripsi pesan dengan AES-256-GCM/CBC + HMAC, lalu menghapus MK_1 dan EK_A_priv dari RAM.',
        formula: '(CK_1, MK_1) = KDF_CK(CK_0);  CT_1 = AEAD_Enc(MK_1, Plaintext, AD=IK_A||IK_B)',
        securityProperty: 'Ephemeral Key Zeroization — MK_1 dihapus segera setelah enkripsi.',
        initiator: {
          roleLabel: 'Perangkat Alice (Inisiator)',
          items: [
            { key: 'Chain Key', value: 'Maju ke CK_1 (CK_0 & MK_1 dihapus)', sensitivity: 'private' },
            { key: 'Payload Keluar', value: 'CT_1 + Header(IK_A_pub, EK_A_pub, OPK_B1_id)', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'Messaging Core (ScyllaDB Queue)',
          items: [
            { key: 'Data Disimpan', value: 'CT_1 (Ciphertext buram) + Routing UUID', sensitivity: 'zero-knowledge' },
            { key: 'Isi Pesan', value: 'Tidak dapat dibaca server', sensitivity: 'zero-knowledge' },
            { key: 'Push Wakeup', value: 'Kirim silent push ke perangkat Bob', sensitivity: 'public' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob (Mulai Online)',
          items: [
            { key: 'Status', value: 'Menerima notifikasi push & membuka koneksi WS', sensitivity: 'public' },
          ],
        },
      },
      {
        stepNumber: 5,
        title: 'Bob Menghitung Ulang X3DH, Dekripsi & Hapus OPK_B1',
        summary:
          'Bob menerima paket awal, merekonstruksi DH1..DH4 menggunakan kunci privat lokalnya, mendekripsi pesan, mengirim ACK ke server (memicu penghapusan di ScyllaDB), dan memusnahkan OPK_B1_priv.',
        formula: 'SK_Bob = HKDF(DH1..DH4) == SK_Alice;  Zeroize(OPK_B1_priv)',
        securityProperty: 'Zero-Retention Server & Immediate Forward Secrecy.',
        initiator: {
          roleLabel: 'Perangkat Alice (Inisiator)',
          items: [
            { key: 'Status Pesan', value: 'Delivered (Centang dua abu-abu)', sensitivity: 'public' },
            { key: 'Safety Number', value: 'SHA-512(IK_A_pub || IK_B_pub) terverifikasi', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'Messaging Core (Post-ACK)',
          items: [
            { key: 'Antrean ScyllaDB', value: 'DIHAPUS SEGERA setelah ACK Bob', sensitivity: 'zero-knowledge' },
            { key: 'Retensi Ciphertext', value: '0 detik tersisa', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob (Online)',
          items: [
            { key: 'Plaintext', value: 'Terekstrak lokal di RAM Bob', sensitivity: 'private' },
            { key: 'OPK_B1_priv', value: 'DIMUSNAHKAN secara permanen', sensitivity: 'ephemeral' },
            { key: 'Root Key RK_0', value: 'Sinkron identik dengan Alice', sensitivity: 'private' },
          ],
        },
      },
      {
        stepNumber: 6,
        title: 'Double Ratchet Step (Self-Healing Post-Compromise)',
        summary:
          'Saat Bob membalas, ia membuat pasangan DH Ratchet Key baru dan memutar Root Key. Bahkan jika kunci sesi sebelumnya bocor, sesi akan pulih sendiri (Post-Compromise Security).',
        formula: '(RK_1, CK_send_B) = KDF_RK(RK_0, DH(DR_B_new, DR_A_pub))',
        securityProperty: 'Post-Compromise Security (Break-in Recovery) di setiap putaran balasan.',
        initiator: {
          roleLabel: 'Perangkat Alice',
          items: [
            { key: 'Root Key Baru', value: 'RK_1 (sinkron saat terima balasan Bob)', sensitivity: 'private' },
            { key: 'Kunci Lama RK_0', value: 'Dihapus; pesan lama tidak dapat didekripsi lagi', sensitivity: 'ephemeral' },
          ],
        },
        server: {
          roleLabel: 'Messaging Core (Relay)',
          items: [
            { key: 'Relay', value: 'Ciphertext CT_2 + DR_B_new_pub', sensitivity: 'zero-knowledge' },
            { key: 'Pengetahuan Kunci', value: 'Nol (Tidak dapat menurunkan RK_1)', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'Perangkat Bob',
          items: [
            { key: 'DR_B_new_priv', value: 'Kunci Ratchet Ephemeral Baru', sensitivity: 'ephemeral' },
            { key: 'Root Key Baru', value: 'RK_1 + Sending Chain baru', sensitivity: 'private' },
          ],
        },
      },
    ],
  },
  {
    id: 'sender-keys',
    title: 'Protokol Sender Keys (Grup hingga 1.500 Peserta)',
    shortLabel: 'Sender Keys (Grup 1.500)',
    description:
      'Mekanisme enkripsi grup berkinerja O(1) yang menghilangkan beban enkripsi pairwise berulang sembari mempertahankan forward secrecy saat keanggotaan berubah.',
    steps: [
      {
        stepNumber: 1,
        title: 'Pembangkitan Sender Key Lokal Pengirim',
        summary:
          'Sebelum mengirim pesan pertama ke grup beranggotakan 1.500 orang, Alice membangkitkan sepasang 32-byte Chain Key acak dan Signing Key Ed25519 khusus untuk grup tersebut.',
        formula: 'SenderKey_A = { ChainKey_0 (32B), SignKey_Priv/Pub (Ed25519) }',
        securityProperty: 'Source Authentication — Tanda tangan Ed25519 mencegah pemalsuan pengirim di grup.',
        initiator: {
          roleLabel: 'Perangkat Alice (Pengirim)',
          items: [
            { key: 'ChainKey_A0', value: 'Dibangkitkan lokal (CSPRNG 256-bit)', sensitivity: 'private' },
            { key: 'SignKey_A_priv', value: 'Hanya tersimpan di perangkat Alice', sensitivity: 'private' },
          ],
        },
        server: {
          roleLabel: 'Group Routing Server',
          items: [
            { key: 'Status Grup', value: '1.500 anggota, epoch_version = 42', sensitivity: 'public' },
            { key: 'SenderKey_A', value: 'TIDAK PERNAH TERLIHAT SERVER', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: '1.499 Peserta Lain (+ Companion)',
          items: [
            { key: 'State Grup', value: 'Belum memiliki SenderKey_A', sensitivity: 'public' },
          ],
        },
      },
      {
        stepNumber: 2,
        title: 'Distribusi SKDM via Sesi Pairwise Signal',
        summary:
          'Alice membungkus (ChainKey_A0 + SignKey_A_pub) menjadi Sender Key Distribution Message (SKDM) lalu mengenkripsinya satu per satu melalui sesi Signal 1-on-1 untuk setiap perangkat penerima.',
        formula: 'SKDM_i = Signal_Pairwise_Enc(Session_A_to_i, ChainKey_A0 || SignKey_A_pub)',
        securityProperty: 'Confidential Distribution — Hanya anggota sah yang bisa membuka SKDM.',
        initiator: {
          roleLabel: 'Perangkat Alice (Pengirim)',
          items: [
            { key: 'SKDM Batch', value: 'Terenkripsi pairwise ke seluruh perangkat target', sensitivity: 'ephemeral' },
            { key: 'Frekuensi', value: 'Hanya 1x sampai ada anggota keluar/rotasi', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'Group Routing Server',
          items: [
            { key: 'Fan-out SKDM', value: 'Salurkan tiap SKDM_i ke inbox perangkat masing-masing', sensitivity: 'zero-knowledge' },
            { key: 'Prioritas', value: 'Antrean pending_skdm_queue dikirim sebelum pesan grup', sensitivity: 'public' },
          ],
        },
        responder: {
          roleLabel: '1.499 Peserta Lain',
          items: [
            { key: 'Dekripsi SKDM', value: 'Setiap perangkat menyimpan (ChainKey_A0, SignKey_A_pub)', sensitivity: 'private' },
          ],
        },
      },
      {
        stepNumber: 3,
        title: 'Enkripsi Pesan Tunggal O(1) & Server Fan-Out',
        summary:
          'Untuk pesan ini dan ratusan pesan berikutnya, Alice cukup menurunkan MessageKey dari ChainKey, mengenkripsi payload SATU KALI, menandatanganinya dengan SignKey_A_priv, lalu server menduplikasi ciphertext yang sama ke 1.499 peserta.',
        formula: '(CK_n+1, MK_n) = HMAC-SHA256(CK_n);  Packet = AES_Enc(MK_n, Msg) || Ed25519_Sign(SignKey_A)',
        securityProperty: 'O(1) Client Complexity — Penghematan >99,9% CPU & bandwidth unggah klien.',
        initiator: {
          roleLabel: 'Perangkat Alice',
          items: [
            { key: 'Enkripsi Klien', value: '1 operasi AES-256 + 1 tanda tangan Ed25519', sensitivity: 'ephemeral' },
            { key: 'Ratchet Lokal', value: 'CK_0 dihapus, maju ke CK_1 (Forward Secrecy)', sensitivity: 'private' },
          ],
        },
        server: {
          roleLabel: 'BEAM Fan-Out Cluster',
          items: [
            { key: 'Fan-Out', value: 'Salin 1 ciphertext identik ke seluruh soket aktif / ScyllaDB', sensitivity: 'zero-knowledge' },
            { key: 'Latensi P99', value: '< 45 ms untuk 1.500 peserta', sensitivity: 'public' },
          ],
        },
        responder: {
          roleLabel: '1.499 Peserta Lain',
          items: [
            { key: 'Verifikasi', value: 'Cek Ed25519_Verify(SignKey_A_pub) -> Turunkan MK_n -> Dekripsi', sensitivity: 'private' },
          ],
        },
      },
      {
        stepNumber: 4,
        title: 'Eviksi Anggota & Rotasi Otomatis (Epoch Bump)',
        summary:
          'Ketika seorang anggota keluar atau dikeluarkan admin, server menaikkan epoch_version grup. Seluruh klien otomatis menandai Sender Key lama tidak valid dan membuat Sender Key baru sebelum pesan berikutnya dikirim.',
        formula: 'OnMemberLeave: epoch_version++ -> Invalidate(Old_SenderKey) -> New_SKDM(Remaining_Members)',
        securityProperty: 'Post-Removal Secrecy — Mantan anggota tidak dapat mendekripsi satu pun pesan baru.',
        initiator: {
          roleLabel: 'Perangkat Alice',
          items: [
            { key: 'Kunci Lama', value: 'ChainKey lama dimusnahkan seketika', sensitivity: 'ephemeral' },
            { key: 'SenderKey Baru', value: 'Dibagikan ulang HANYA ke 1.498 anggota aktif', sensitivity: 'private' },
          ],
        },
        server: {
          roleLabel: 'Group Routing Server',
          items: [
            { key: 'Epoch Check', value: 'Tolak ciphertext yang masih memakai epoch_version lama', sensitivity: 'public' },
            { key: 'Keanggotaan', value: 'Mantan anggota dihapus dari daftar fan-out', sensitivity: 'public' },
          ],
        },
        responder: {
          roleLabel: 'Anggota Tersisa vs Mantan Anggota',
          items: [
            { key: '1.498 Anggota Sah', value: 'Menerima SKDM baru & lanjut membaca lancar', sensitivity: 'private' },
            { key: 'Mantan Anggota', value: 'Tidak mendapat SKDM baru & akses pesan terputus', sensitivity: 'zero-knowledge' },
          ],
        },
      },
    ],
  },
  {
    id: 'hsm-backup',
    title: 'Cloud Backup E2EE dengan HSM Key Vault (OPAQUE)',
    shortLabel: 'HSM Cloud Backup',
    description:
      'Bagaimana cadangan riwayat obrolan di server cloud tetap terenkripsi ujung-ke-ujung meski diproteksi kata sandi manusia yang pendek, tanpa bisa di-brute-force oleh server.',
    steps: [
      {
        stepNumber: 1,
        title: 'Pembangkitan 256-bit Root Backup Key di Perangkat',
        summary:
          'Perangkat pengguna membangkitkan Root Backup Key acak 256-bit dan mengenkripsi arsip database obrolan lokal (SQLite + indeks media) dengan AES-256-GCM sebelum menyentuh jaringan.',
        formula: 'Backup_CT = AES-256-GCM(HKDF(RootKey_256), Nonce, Zstd(LocalDB))',
        securityProperty: 'Zero-Knowledge Storage — Penyedia cloud (S3/GDrive) hanya melihat blob acak.',
        initiator: {
          roleLabel: 'Perangkat Pengguna',
          items: [
            { key: 'RootKey_256', value: '256-bit entropi tinggi (atau kunci 64-digit)', sensitivity: 'private' },
            { key: 'Arsip Terenkripsi', value: 'Diunggah ke Object Storage S3', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'Cloud Object Storage (S3)',
          items: [
            { key: 'Payload', value: 'backup_v12.enc (Ciphertext penuh)', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'HSM Backup Key Vault Cluster',
          items: [
            { key: 'Status Slot', value: 'Menunggu registrasi OPAQUE', sensitivity: 'public' },
          ],
        },
      },
      {
        stepNumber: 2,
        title: 'Registrasi Kata Sandi via Protokol OPAQUE (PAKE)',
        summary:
          'Agar pengguna cukup mengingat kata sandi/PIN tanpa melemahkan entropi, perangkat membungkus RootKey_256 menggunakan protokol OPAQUE sehingga HSM tidak pernah mengetahui kata sandi mentah maupun RootKey mentah.',
        formula: 'ExportKey = OPAQUE_Register(Password, OPRF_Salt_HSM);  Envelope = AEAD(ExportKey, RootKey_256)',
        securityProperty: 'Password Never Leaves Device — HSM tidak pernah melihat plaintext password.',
        initiator: {
          roleLabel: 'Perangkat Pengguna',
          items: [
            { key: 'Password Pengguna', value: 'Diproses lokal via Argon2id + OPRF blinding', sensitivity: 'private' },
            { key: 'Envelope', value: 'RootKey_256 terbungkus dikirim ke HSM Vault', sensitivity: 'public' },
          ],
        },
        server: {
          roleLabel: 'API Gateway (Passthrough)',
          items: [
            { key: 'Traffic', value: 'mTLS terenkripsi langsung ke Enclave HSM', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'HSM Backup Key Vault (FIPS 140-3)',
          items: [
            { key: 'Penyimpanan', value: 'Simpan OPRF Seed + Envelope terenkripsi', sensitivity: 'private' },
            { key: 'Pengetahuan Kunci', value: 'Tidak bisa membuka Envelope tanpa bukti password', sensitivity: 'zero-knowledge' },
          ],
        },
      },
      {
        stepNumber: 3,
        title: 'Pemulihan Perangkat Baru & Hardware Rate-Limiting',
        summary:
          'Saat pengguna berpindah ponsel, autentikasi OPAQUE dilakukan terhadap klaster HSM. Modul perangkat keras menerapkan batas mutlak maksimal 5 kali salah percobaan sebelum menghapus slot permanen (anti offline brute-force).',
        formula: 'If failed_attempts >= 5 -> HSM_Zeroize(Slot_Account_ID) [Hardware Enforced]',
        securityProperty: 'Anti Brute-Force — Penyerang yang mencuri server tidak bisa menebak PIN secara offline.',
        initiator: {
          roleLabel: 'Perangkat Baru Pengguna',
          items: [
            { key: 'Input Pengguna', value: 'Masukkan kata sandi cadangan', sensitivity: 'private' },
            { key: 'Hasil', value: 'Memperoleh kembali RootKey_256 -> Dekripsi S3 blob', sensitivity: 'private' },
          ],
        },
        server: {
          roleLabel: 'Cloud Object Storage (S3)',
          items: [
            { key: 'Unduh Blob', value: 'Kirim backup_v12.enc ke perangkat baru', sensitivity: 'zero-knowledge' },
          ],
        },
        responder: {
          roleLabel: 'HSM Backup Key Vault',
          items: [
            { key: 'Penghitung Percobaan', value: '1 / 5 (Terkunci di memori anti-tamper HSM)', sensitivity: 'public' },
            { key: 'Audit', value: 'Attestation kriptografi diverifikasi oleh klien', sensitivity: 'public' },
          ],
        },
      },
    ],
  },
];

export function getHandshakeScenario(id: HandshakeScenarioId): HandshakeScenario {
  return HANDSHAKE_SCENARIOS.find((s) => s.id === id) ?? HANDSHAKE_SCENARIOS[0];
}

export function clampHandshakeStep(scenario: HandshakeScenario, stepIndex: number): number {
  if (scenario.steps.length === 0) return 0;
  return Math.max(0, Math.min(scenario.steps.length - 1, Math.floor(stepIndex)));
}
