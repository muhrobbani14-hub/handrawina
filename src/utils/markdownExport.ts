import { DATABASE_ENGINES, MERMAID_DIAGRAMS, SYSTEM_TARGETS, TECH_STACK_MATRIX } from '../data/tddContent';
import { calculateGroupFanoutMetrics } from './architectureCalc';

/**
 * Generates a complete, standalone Technical Design Document in Markdown format
 * with all Mermaid.js diagrams, DDL schemas, and cryptographic handshake specifications.
 */
export function generateFullTddMarkdown(): string {
  const scale1500 = calculateGroupFanoutMetrics({
    participants: 1500,
    avgDevicesPerUser: 2,
    messageSizeKb: 4,
  });

  const targetRows = SYSTEM_TARGETS.map(
    (m) => `| ${m.label} | **${m.value}** | ${m.detail} |`
  ).join('\n');

  const stackRows = TECH_STACK_MATRIX.map(
    (s) => `| ${s.layer} | ${s.technology} | ${s.rationale} |`
  ).join('\n');

  const ddlSections = DATABASE_ENGINES.map(
    (engine) => `### ${engine.name}
- **Peran:** ${engine.role}
- **Konsistensi:** ${engine.consistency}
- **Strategi Sharding:** ${engine.shardingStrategy}
- **Kebijakan Retensi:** ${engine.retentionPolicy}

\`\`\`sql
${engine.ddl}
\`\`\``
  ).join('\n\n');

  return `# Technical Design Document (TDD): Handrawina
**Arsitektur Sistem Perpesanan Instan & Panggilan Suara/Video Terenkripsi Ujung-ke-Ujung (E2EE) Skala Global**

---

## 1. Ringkasan Eksekutif & Arsitektur Global

Handrawina dirancang dengan prinsip **Zero-Knowledge Server**: seluruh pesan teks, pesan suara, media, panggilan audio/video, dan cadangan cloud dienkripsi di sisi klien sebelum menyentuh infrastruktur server. Server hanya memproses metadata perutean minimum dan menghapus ciphertext secara permanen segera setelah menerima konfirmasi pengiriman (*Zero-Retention Post-ACK*).

### Target Kapasitas & SLA
| Metrik | Target | Keterangan |
| :--- | :--- | :--- |
${targetRows}

### Matriks Pilihan Teknologi
| Lapisan | Teknologi | Rasional Arsitektur |
| :--- | :--- | :--- |
${stackRows}

### Diagram Arsitektur Global (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.globalArchitecture}
\`\`\`

---

## 2. Keamanan & Enkripsi Ujung-ke-Ujung (Signal Protocol)

### 2.1 X3DH (Extended Triple Diffie-Hellman) & Prekeys
Setiap perangkat membangkitkan dan menyimpan kunci privat secara permanen di *Secure Enclave / Android Keystore*:
- **Identity Key Pair (IK):** Kunci Curve25519/Ed25519 jangka panjang untuk autentikasi perangkat.
- **Signed Prekey (SPK):** Kunci jangka menengah yang ditandatangani oleh \`IK_priv\` dan dirotasi setiap 7 hari.
- **One-Time Prekeys (OPK):** Kolam 100 kunci sekali pakai yang dihapus atomik dari server begitu diambil untuk menjamin *Forward Secrecy* sejak paket pertama.

### 2.2 Double Ratchet Algorithm
Setelah Shared Secret (\`SK\`) diturunkan dari \`DH1..DH4\`, sesi diinisialisasi menggunakan **Double Ratchet** yang memadukan *Diffie-Hellman Ratchet* (setiap pergantian arah percakapan) dan *Symmetric-Key KDF Chain* (setiap pesan beruntun). Hal ini menjamin *Forward Secrecy* dan *Post-Compromise Security (Self-Healing)*.

### 2.3 Enkripsi Media & Panggilan
- **Media (Foto, Video, Voice Note, Dokumen):** Klien membangkitkan kunci acak 256-bit (\`MediaKey\`), mengenkripsi berkas lokal menggunakan \`AES-256-GCM\`, mengunggah ciphertext ke S3/CDN, lalu mengirim URL + \`MediaKey\` + \`SHA-256\` di dalam pesan Signal E2EE.
- **Panggilan Suara/Video:** Kunci master SRTP/SFrame dinegosiasikan melalui sesi Signal E2EE yang sudah terverifikasi.

### Alur Pertukaran Kunci Enkripsi / Handshake (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.x3dhHandshake}
\`\`\`

---

## 3. Grup Besar (Sender Keys 1.500 Peserta) & Multi-Device

### 3.1 Mekanisme Sender Keys
Pada grup beranggotakan **1.500 peserta** (mis. rata-rata 2 perangkat/pengguna = **${scale1500.totalRecipientDevices} perangkat tujuan**):
- **Pairwise Signal:** Klien harus melakukan **${scale1500.pairwiseEncryptions} operasi enkripsi** dan mengunggah **${scale1500.pairwiseClientUploadKb} KB** per pesan 4 KB.
- **Sender Keys:** Klien cukup melakukan **1 operasi enkripsi ($O(1)$)** dan mengunggah **${scale1500.senderKeyClientUploadKb} KB** — menghemat **${scale1500.encryptionReductionPct}%** operasi enkripsi (${scale1500.bandwidthSavingsFactor}x lebih hemat bandwidth unggah).
- **Rotasi Otomatis:** Setiap kali anggota keluar atau dikeluarkan, \`epoch_version\` grup dinaikkan. Semua klien memusnahkan Sender Key lama dan mendistribusikan SKDM baru hanya ke anggota aktif tersisa.

### 3.2 Arsitektur Multi-Device Independen
- Setiap perangkat tertaut (Desktop/Web, maks 4 companion) memiliki pasangan kunci identitas Signal sendiri dan terdaftar dalam **Account Device Verification (ADV) Signed Device List** yang ditandatangani oleh \`IK_Primary\`.
- Ponsel utama **tidak perlu online** agar perangkat companion dapat mengirim/menerima pesan karena sesi kriptografi berjalan langsung antar-perangkat (*client-side fan-out*).
- Sinkronisasi riwayat awal saat menautkan perangkat dilakukan melalui blob terenkripsi sementara di S3 (TTL 24 jam) menggunakan kunci sekali pakai dari pemindaian kode QR.

### Diagram Sender Keys & Multi-Device (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.senderKeysMultiDevice}
\`\`\`

---

## 4. Infrastruktur Real-Time & Panggilan WebRTC

### 4.1 Messaging Server Berlatensi Rendah
- **Edge Gateway (Rust):** Terminasi TLS 1.3 + Noise_XX pada soket WebSocket/TCP persisten dengan framing biner XMPP/Protobuf kustom untuk meminimalkan overhead header.
- **Messaging Core (Erlang/Elixir BEAM):** 1 aktor BEAM per sesi perangkat aktif. Status *Sent*, *Delivered*, dan *Read* diproses melalui *acknowledgement frame* terstruktur, sementara indikator *Typing* dikirim secara ephemeral via Redis Cluster (TTL 5 detik, tanpa penulisan disk).

### 4.2 Arsitektur WebRTC (STUN/TURN & SFU Terenkripsi SFrame)
- **1-on-1 Call:** Direct P2P melalui ICE/STUN, dengan fallback *Coturn Anycast Relay* jika diblokir Symmetric NAT.
- **Group Call:** Menggunakan **SFU (Selective Forwarding Unit)** dengan enkripsi ganda: *hop-by-hop DTLS-SRTP* untuk transportasi simulcast, dan **SFrame E2EE** pada payload frame audio/video agar SFU dapat memilih kualitas video tanpa mampu melihat isi media.

### Diagram Real-Time & WebRTC (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.realtimeWebrtc}
\`\`\`

---

## 5. Manajemen Akun, Cloud Backup HSM, & Platform Business

### 5.1 Migrasi / Ganti Nomor Telepon Tanpa Kehilangan Data
Identitas kriptografi dan keanggotaan grup ditambatkan ke \`account_id\` (UUID permanen), bukan nomor telepon. Migrasi membutuhkan verifikasi OTP ganda (nomor lama + nomor baru) serta tanda tangan kriptografi dari \`IK_Primary\`. Seluruh keanggotaan grup tetap utuh dan kontak aktif menerima event pembaruan perutean otomatis.

### 5.2 Cloud Backup E2EE Berbasis HSM Key Vault
Cadangan riwayat obrolan dienkripsi di perangkat menggunakan 256-bit \`Root Backup Key\`. Jika pengguna memilih kata sandi, perangkat mendaftarkannya melalui protokol **OPAQUE (PAKE)** ke klaster **HSM (FIPS 140-3)** yang membatasi percobaan salah maksimal **5 kali** di level perangkat keras sebelum memusnahkan slot kunci secara permanen.

### 5.3 Pemisahan Jalur API Consumer vs Business
- **Jalur Consumer:** Koneksi biner stateful persisten ke Edge Gateway Rust/BEAM.
- **Jalur Business:** API Gateway stateless terpisah (REST/GraphQL, mTLS/OAuth2, rate-limiter per-tenant), mengelola **Katalog Produk**, **Balasan Otomatis**, **Label Pelanggan**, serta **Webhook Dispatcher** berbasis Kafka dengan penandatanganan payload \`HMAC-SHA256\`, *exponential backoff*, dan *Dead-Letter Queue (DLQ)*.

### Diagram Migrasi Akun, HSM Backup & Business API (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.accountHsmBusiness}
\`\`\`

---

## 6. Skema Database Utama

### Entity Relationship Diagram (Mermaid.js)
\`\`\`mermaid
${MERMAID_DIAGRAMS.databaseErd}
\`\`\`

${ddlSections}
`;
}
