export type SectionId =
  | 'overview'
  | 'e2ee'
  | 'group-multidevice'
  | 'realtime-webrtc'
  | 'account-business'
  | 'database';

export interface SectionMeta {
  id: SectionId;
  number: string;
  shortTitle: string;
  title: string;
  subtitle: string;
}

export const TDD_SECTIONS: SectionMeta[] = [
  {
    id: 'overview',
    number: '01',
    shortTitle: 'Ringkasan Arsitektur',
    title: 'Ringkasan Eksekutif & Arsitektur Global',
    subtitle:
      'Prinsip desain zero-knowledge, pemisahan domain Consumer dan Business, serta target kapasitas dan latensi lintas wilayah.',
  },
  {
    id: 'e2ee',
    number: '02',
    shortTitle: 'Enkripsi E2EE & Signal',
    title: 'Keamanan & Enkripsi Ujung-ke-Ujung (Signal Protocol)',
    subtitle:
      'Implementasi X3DH, Double Ratchet Algorithm, pengelolaan Prekeys, enkripsi media CDN, dan pertukaran kunci panggilan.',
  },
  {
    id: 'group-multidevice',
    number: '03',
    shortTitle: 'Grup 1.500 & Multi-Device',
    title: 'Sender Keys untuk Grup Besar & Arsitektur Multi-Device',
    subtitle:
      'Efisiensi enkripsi O(1) hingga 1.500 peserta, rotasi kunci saat eviksi, serta sinkronisasi multi-perangkat independen tanpa ponsel utama selalu online.',
  },
  {
    id: 'realtime-webrtc',
    number: '04',
    shortTitle: 'Real-Time & WebRTC',
    title: 'Infrastruktur Messaging Berlatensi Rendah & Panggilan WebRTC',
    subtitle:
      'Server aktor Erlang/Elixir dengan gateway Rust, framing biner XMPP/Noise, delivery receipts, serta topologi STUN/TURN dan SFU terenkripsi SFrame.',
  },
  {
    id: 'account-business',
    number: '05',
    shortTitle: 'Akun, Backup HSM & Bisnis',
    title: 'Migrasi Nomor, Cloud Backup E2EE (HSM), & Platform Business',
    subtitle:
      'Identitas terdekople dari nomor telepon, brankas kunci HSM berbasis OPAQUE, serta isolasi jalur API bisnis dengan katalog, auto-reply, dan webhook.',
  },
  {
    id: 'database',
    number: '06',
    shortTitle: 'Skema Database Utama',
    title: 'Skema Penyimpanan Multi-Engine, Sharding & Retensi',
    subtitle:
      'Rancangan ERD serta skrip DDL PostgreSQL/CockroachDB, ScyllaDB untuk antrean pesan offline, Redis Cluster, dan Object Storage terenkripsi.',
  },
];

export interface ArchitectureMetric {
  label: string;
  value: string;
  detail: string;
}

export const SYSTEM_TARGETS: ArchitectureMetric[] = [
  {
    label: 'Latensi Pesan P99 (Intra-Region)',
    value: '< 45 ms',
    detail: 'Koneksi persisten TLS 1.3 + Noise_XX ke Edge Gateway terdekat',
  },
  {
    label: 'Kapasitas Grup E2EE',
    value: '1.500 Peserta',
    detail: 'Kompleksitas enkripsi klien O(1) via protokol Sender Keys',
  },
  {
    label: 'Perangkat Tertaut per Akun',
    value: '1 + 4 Perangkat',
    detail: '1 ponsel utama + 4 companion independen tanpa ponsel wajib online',
  },
  {
    label: 'Retensi Pesan di Server',
    value: '0 Detik',
    detail: 'Ciphertext dihapus pasca-ACK; TTL maksimal 30 hari jika offline',
  },
];

export interface TechStackChoice {
  layer: string;
  technology: string;
  rationale: string;
  tradeoff: string;
}

export const TECH_STACK_MATRIX: TechStackChoice[] = [
  {
    layer: 'Edge Connection Gateway',
    technology: 'Rust (Tokio + Quinn/TLS 1.3)',
    rationale:
      'Terminasi jutaan soket TCP/WebSocket/QUIC secara deterministik tanpa garbage collection pause, menangani handshake Noise_XX dan proteksi DDoS lapis L4/L7.',
    tradeoff: 'Waktu kompilasi dan kurva belajar lebih tinggi dibanding Go.',
  },
  {
    layer: 'Stateful Messaging Core',
    technology: 'Erlang/OTP & Elixir (BEAM VM)',
    rationale:
      'Model aktor ringan (~2 KB/proses) ideal untuk memetakan 1 proses = 1 sesi perangkat aktif, fault tolerance berbasis supervision tree, dan hot code upgrade.',
    tradeoff: 'Komputasi CPU berat (mis. transkoding) harus didelegasikan ke layanan Rust/C++.',
  },
  {
    layer: 'Media & WebRTC SFU',
    technology: 'Rust / C++ (Mediasoup / Pion-derived SFU + Coturn)',
    rationale:
      'Forwarding paket RTP/SRTP berlatensi sub-20ms tanpa mendekripsi payload media berkat SFrame E2EE, serta klaster Coturn anycast global.',
    tradeoff: 'Membutuhkan tuning kernel Linux (UDP buffer, BBR congestion control).',
  },
  {
    layer: 'Metadata, Identity & Business DB',
    technology: 'CockroachDB / PostgreSQL Sharded',
    rationale:
      'Konsistensi ACID ketat untuk pemetaan account_uuid, daftar perangkat ADV, migrasi nomor telepon, katalog produk bisnis, dan log audit webhook.',
    tradeoff: 'Latensi tulis lintas wilayah lebih tinggi; gunakan multi-region survivability.',
  },
  {
    layer: 'Offline Queue & Fan-out Store',
    technology: 'ScyllaDB (C++ Cassandra-compatible)',
    rationale:
      'Throughput tulis jutaan operasi/detik dengan latensi P99 rendah, mendukung TTL per-kolom dan tombstoning efisien untuk penghapusan ciphertext pasca-ACK.',
    tradeoff: 'Model query terbatas pada partition key; tidak mendukung join relasional.',
  },
  {
    layer: 'Presence, Routing & Rate-Limit',
    technology: 'Redis Cluster (In-Memory)',
    rationale:
      'Tabel lokasi node BEAM tempat perangkat sedang terhubung, indikator mengetik ephemeral (TTL 5 detik), serta token bucket anti-spam.',
    tradeoff: 'Data volatil; harus selalu dapat direkonstruksi saat perangkat reconnect.',
  },
];

export const MERMAID_DIAGRAMS = {
  globalArchitecture: `flowchart TB
    subgraph Clients["Lapisan Klien (Zero-Trust Edge)"]
        M1["Ponsel Utama (iOS/Android)\\nSignal Store + Keychain"]
        M2["Companion (Desktop/Web)\\nDevice Keys Independen"]
        B1["Aplikasi & Integrasi Bisnis\\nCRM / ERP / Webhook Server"]
    end

    subgraph Edge["Jalur Ingress Terpisah (Strict Isolation)"]
        CGW["Consumer Edge Gateway (Rust)\\nNoise_XX + Binary XMPP/WS"]
        BGW["Business API Gateway (Go/Envoy)\\nREST/GraphQL + mTLS + OAuth2"]
        TURN["Global STUN/TURN & SFU Cluster\\nICE / DTLS-SRTP / SFrame"]
    end

    subgraph Core["Messaging & Real-Time Core (Erlang/Elixir BEAM)"]
        ROUTER["Session Registry & Presence\\n(Redis Cluster)"]
        CHAT["Chat Actor Cluster\\nRouting, Receipts & Fan-Out"]
        KEYSVC["Prekey & ADV Key Directory\\n(Public Keys Only)"]
        CALLSIG["Call Signaling Coordinator\\nOffer/Answer/ICE Relay"]
    end

    subgraph BusinessPlane["Domain Platform Business"]
        BIZSVC["Business Core Service\\nKatalog, Label, Auto-Reply"]
        KAFKA["Event Bus (Kafka)"]
        WH["Webhook Dispatcher\\nHMAC-SHA256 + Retry DLQ"]
    end

    subgraph Storage["Lapisan Penyimpanan & Keamanan"]
        PG["CockroachDB / PostgreSQL\\nAkun, Grup, Perangkat, Bisnis"]
        SCYLLA["ScyllaDB\\nOffline Ciphertext Queue"]
        S3["Object Storage + CDN\\nEncrypted Media & Backup Blobs"]
        HSM["HSM Backup Key Vault\\nOPAQUE PAKE + Rate Limit"]
    end

    M1 <-->|"TLS 1.3 + Noise_XX"| CGW
    M2 <-->|"TLS 1.3 + Noise_XX"| CGW
    M1 <-->|"SRTP / SFrame Media"| TURN
    M2 <-->|"SRTP / SFrame Media"| TURN
    B1 <-->|"HTTPS REST / Webhook"| BGW

    CGW <--> CHAT
    CGW <--> KEYSVC
    CGW <--> CALLSIG
    CALLSIG -.->|"TURN Credentials"| TURN

    CHAT <--> ROUTER
    CHAT <--> SCYLLA
    CHAT <--> PG
    KEYSVC <--> PG

    M1 -.->|"Upload/Download Ciphertext"| S3
    M1 <-->|"OPAQUE Auth"| HSM

    BGW <--> BIZSVC
    BIZSVC <--> PG
    BIZSVC -->|"Pesan Outbound via E2EE Bridge"| CHAT
    CHAT -->|"Inbound Business Event"| KAFKA
    KAFKA --> WH
    WH -->|"Signed Webhook POST"| B1`,

  x3dhHandshake: `sequenceDiagram
    autonumber
    participant A as Alice (Inisiator)
    participant S as Key Distribution Server
    participant B as Bob (Penerima Offline)

    Note over B,S: Fase 0: Registrasi Kunci Publik Bob (Saat Online)
    B->>S: Unggah Prekey Bundle: IK_B, SPK_B, Sig(IK_B, SPK_B), [OPK_B1..OPK_B100]
    Note right of S: Server HANYA menyimpan kunci publik.<br/>Kunci privat tetap di Secure Enclave Bob.

    Note over A,S: Fase 1: X3DH Key Agreement (Alice Memulai Sesi)
    A->>S: Request Prekey Bundle untuk Bob (semua device_id aktif)
    S-->>A: Kembalikan IK_B, SPK_B, Sig_B, dan 1x OPK_B1 (lalu hapus OPK_B1)
    A->>A: Verifikasi Sig(IK_B, SPK_B) & buat Ephemeral Key EK_A
    A->>A: Hitung DH1=DH(IK_A,SPK_B), DH2=DH(EK_A,IK_B),<br/>DH3=DH(EK_A,SPK_B), DH4=DH(EK_A,OPK_B1)
    A->>A: SK = HKDF(DH1 || DH2 || DH3 || DH4) -> Root Key RK0

    Note over A,B: Fase 2: Pesan Pertama + Inisialisasi Double Ratchet
    A->>A: Inisialisasi Double Ratchet dari RK0 -> Derive Message Key MK1
    A->>S: Kirim Ciphertext(MK1, Plaintext) + Header(IK_A, EK_A, OPK_B1_id)
    S->>B: Teruskan saat Bob Online (Hapus dari ScyllaDB pasca ACK)

    Note over B: Fase 3: Dekripsi & Ratchet Step Balasan
    B->>B: Hitung ulang DH1..DH4 dengan kunci privat lokal -> SK -> RK0
    B->>B: Hapus kunci privat OPK_B1 (Forward Secrecy) & dekripsi MK1
    B->>B: Generate Ratchet Key baru -> DH Ratchet Step -> MK2
    B->>S: Kirim Balasan Terenkripsi (Ciphertext MK2 + New Ratchet PubKey)
    S->>A: Teruskan ke Alice -> Alice maju ke Ratchet Step berikutnya`,

  senderKeysMultiDevice: `flowchart LR
    subgraph Sender["Pengirim: Alice (Perangkat Utama)"]
        SKGen["1. Generate Sender Key\\nChainKey_A + SignKey_A"]
        Enc1["2. Enkripsi Pesan 1x (O(1))\\nAES-256-CBC + Ed25519 Sig"]
    end

    subgraph Distribution["Distribusi Awal / Rotasi (SKDM)"]
        PW["Sesi Pairwise Signal (X3DH)\\nKirim SKDM ke N Peserta x D Perangkat"]
    end

    subgraph Server["Messaging Core (Zero-Knowledge Fan-Out)"]
        GState["Verifikasi Keanggotaan Grup\\n(max 1.500 peserta)"]
        FanOut["Fan-Out 1 Ciphertext Identik\\nke Semua Perangkat Penerima Aktif"]
    end

    subgraph Recipients["Penerima & Multi-Device"]
        U1["Bob Ponsel (Device 1)\\nDekripsi via SenderKey_A"]
        U2["Bob Desktop (Device 2)\\nDekripsi via SenderKey_A"]
        U3["Peserta 3..1500\\nDekripsi via SenderKey_A"]
        A2["Alice Web (Companion)\\nSinkronisasi via Fan-Out Self-Device"]
    end

    SKGen -->|"Hanya saat pesan pertama / eviksi"| PW
    PW --> Server
    SKGen --> Enc1
    Enc1 -->|"1 Payload Ciphertext"| GState
    GState --> FanOut
    FanOut --> U1
    FanOut --> U2
    FanOut --> U3
    FanOut --> A2`,

  realtimeWebrtc: `sequenceDiagram
    autonumber
    participant C1 as Klien A (Penelepon)
    participant SIG as Call Signaling (BEAM)
    participant STUN as STUN/TURN Anycast
    participant SFU as WebRTC SFU (Media Router)
    participant C2 as Klien B..N (Peserta)

    Note over C1,C2: Fase 1: Negosiasi Kunci Media E2EE & Signaling
    C1->>SIG: Call Offer (SDP + Signal-Encrypted SRTP/SFrame Master Key)
    SIG->>C2: Push VoIP Wakeup (APNs/FCM) + Forward Offer
    C1->>STUN: ICE Binding / Allocate Relay Candidate
    C2->>STUN: ICE Binding / Allocate Relay Candidate
    C2->>SIG: Call Answer (SDP + ICE Candidates)
    SIG->>C1: Forward Answer & Trickle ICE

    Note over C1,C2: Fase 2A: Panggilan 1-on-1 (Direct P2P / TURN Relay)
    C1->>C2: DTLS-SRTP P2P Media Stream (Kunci diturunkan via Signal Session)
    C2->>C1: DTLS-SRTP Return Media Stream (Full-Duplex Terenkripsi)

    Note over C1,SFU: Fase 2B: Panggilan Grup (SFU + SFrame Double Encryption)
    C1->>C1: Enkripsi Frame Audio/Video (SFrame Sender Key) lalu bungkus DTLS-SRTP
    C1->>SFU: Kirim Paket Media Terenkripsi (Simulcast: 720p/360p/180p)
    SFU->>SFU: Dekapsulasi Hop-by-Hop DTLS-SRTP -> Pilih Layer Bandwidth<br/>(Payload SFrame TETAP terenkripsi, SFU tidak punya kunci)
    SFU->>C2: Forward Paket SFrame dalam DTLS-SRTP ke masing-masing peserta
    C2->>C2: Dekripsi DTLS-SRTP -> Dekripsi SFrame dengan Sender Key C1`,

  accountHsmBusiness: `flowchart TB
    subgraph PhoneMigration["A. Migrasi Nomor Telepon (Zero Data Loss)"]
        P1["Verifikasi OTP Ganda\\nNomor Lama + Nomor Baru"]
        P2["Bukti Kriptografi\\nSign(IK_Primary, old_hash || new_hash)"]
        P3["Update Tabel accounts\\naccount_uuid TETAP SAMA"]
        P4["Broadcast Routing Event\\nGrup & Kontak Aktif Diperbarui"]
        P1 --> P2 --> P3 --> P4
    end

    subgraph HSMBackup["B. E2EE Cloud Backup (HSM Key Vault)"]
        H1["Klien Generate 256-bit Root Key\\nEnkripsi DB Lokal -> AES-256-GCM"]
        H2["Unggah Blob Terenkripsi\\nke Object Storage (S3)"]
        H3["OPAQUE PAKE Registration\\nSimpan Root Key terbungkus di HSM"]
        H4["HSM Hardware Guard\\nMaks 5 Percobaan PIN -> Wipe Slot"]
        H1 --> H2
        H1 --> H3 --> H4
    end

    subgraph BusinessIsolation["C. Isolasi Jalur Consumer vs Business API"]
        BC["Business Client / ERP"]
        GW["Business API Gateway\\nRate Limit + Tenant Auth"]
        CAT["Catalog, Auto-Reply & Labels\\n(PostgreSQL Tenant Partition)"]
        EB["Kafka Outbound Topic"]
        WHD["Webhook Workers\\nHMAC-SHA256 + Exponential Retry"]
        BC --> GW --> CAT
        CAT --> EB --> WHD -->|"HTTPS Callback"| BC
    end`,

  databaseErd: `erDiagram
    ACCOUNTS ||--o{ DEVICES : "memiliki 1..5"
    ACCOUNTS ||--o{ PREKEY_BUNDLES : "menyimpan"
    ACCOUNTS ||--o{ GROUP_MEMBERS : "bergabung"
    GROUPS ||--o{ GROUP_MEMBERS : "berisi maks 1500"
    ACCOUNTS ||--o| BACKUP_VAULT_RECORDS : "memiliki 0..1"
    ACCOUNTS ||--o| BUSINESS_PROFILES : "opsional"
    BUSINESS_PROFILES ||--o{ PRODUCT_CATALOG : "memiliki"
    BUSINESS_PROFILES ||--o{ WEBHOOK_ENDPOINTS : "mendaftarkan"

    ACCOUNTS {
        uuid account_id PK
        varchar phone_hash UK
        bytea primary_identity_pub
        varchar account_type
        varchar status
        timestamptz created_at
    }

    DEVICES {
        uuid device_id PK
        uuid account_id FK
        int device_index
        bytea device_identity_pub
        bytea adv_account_signature
        varchar platform
        timestamptz last_active_at
    }

    PREKEY_BUNDLES {
        uuid device_id PK
        int signed_prekey_id
        bytea signed_prekey_pub
        bytea signed_prekey_sig
        int remaining_opk_count
        timestamptz rotated_at
    }

    GROUPS {
        uuid group_id PK
        bytea encrypted_metadata
        int member_count
        int max_members
        bigint epoch_version
        timestamptz updated_at
    }

    GROUP_MEMBERS {
        uuid group_id PK
        uuid account_id PK
        varchar role
        timestamptz joined_at
    }

    BACKUP_VAULT_RECORDS {
        uuid account_id PK
        varchar hsm_cluster_id
        bytea opaque_record
        int failed_attempts
        varchar s3_blob_key
        timestamptz updated_at
    }

    BUSINESS_PROFILES {
        uuid business_id PK
        uuid account_id FK
        varchar verification_tier
        jsonb auto_reply_rules
        jsonb customer_labels
        varchar api_key_hash
    }

    PRODUCT_CATALOG {
        uuid product_id PK
        uuid business_id FK
        varchar sku
        varchar title
        bigint price_minor
        varchar currency
        boolean is_active
    }

    WEBHOOK_ENDPOINTS {
        uuid webhook_id PK
        uuid business_id FK
        varchar target_url
        bytea hmac_secret_enc
        text_array subscribed_events
        varchar circuit_state
    }`,
};

export interface DatabaseEngineSpec {
  id: 'postgres' | 'scylla' | 'redis' | 's3';
  name: string;
  role: string;
  consistency: string;
  shardingStrategy: string;
  retentionPolicy: string;
  tables: {
    name: string;
    purpose: string;
    partitionKey: string;
    notes: string;
  }[];
  ddl: string;
}

export const DATABASE_ENGINES: DatabaseEngineSpec[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL / CockroachDB',
    role: 'Sumber kebenaran (Source of Truth) untuk identitas akun, daftar perangkat ADV, prekeys, keanggotaan grup, serta seluruh data platform Business.',
    consistency: 'Strong Consistency (Serializable / Raft Consensus)',
    shardingStrategy: 'Hash partitioning berdasarkan account_id (UUIDv7) untuk tabel akun/perangkat dan group_id untuk tabel grup; geo-partitioning berbasis region akun.',
    retentionPolicy: 'Persisten selama akun aktif; penghapusan keras (crypto-shredding) dalam 30 hari pasca-penghapusan akun.',
    tables: [
      {
        name: 'accounts',
        purpose: 'Entitas identitas permanen (terpisah dari nomor telepon)',
        partitionKey: 'account_id (UUID)',
        notes: 'phone_hash diindeks unik dengan HMAC-SHA256 + pepper HSM untuk privasi direktori',
      },
      {
        name: 'devices',
        purpose: 'Registrasi ponsel utama & maks 4 perangkat companion',
        partitionKey: 'account_id, device_id',
        notes: 'Menyimpan adv_account_signature untuk verifikasi cryptographically signed device list',
      },
      {
        name: 'one_time_prekeys',
        purpose: 'Kolam kunci sekali pakai (OPK) untuk X3DH asinkron',
        partitionKey: 'device_id, key_id',
        notes: 'Dihapus secara atomik (DELETE ... RETURNING) begitu diambil oleh inisiator sesi',
      },
      {
        name: 'groups & group_members',
        purpose: 'Graf keanggotaan grup hingga 1.500 peserta & epoch rotasi',
        partitionKey: 'group_id',
        notes: 'epoch_version naik setiap ada anggota keluar untuk memaksa rotasi Sender Key',
      },
      {
        name: 'business_profiles, catalogs, webhooks',
        purpose: 'Tenant isolasi Platform Business, katalog, label & webhook',
        partitionKey: 'business_id',
        notes: 'Terpisah pada schema/cluster logis tersendiri untuk mencegah noisy-neighbor',
      },
    ],
    ddl: `-- ============================================================
-- 1. IDENTITAS AKUN & MULTI-DEVICE (CockroachDB / PostgreSQL)
-- ============================================================
CREATE TABLE accounts (
    account_id           UUID PRIMARY KEY,
    phone_hash           BYTEA UNIQUE NOT NULL,          -- HMAC-SHA256(pepper, E.164)
    primary_identity_pub BYTEA NOT NULL,                 -- Curve25519 / Ed25519 Public Key (32B)
    account_type         VARCHAR(16) NOT NULL DEFAULT 'CONSUMER'
                         CHECK (account_type IN ('CONSUMER', 'BUSINESS')),
    status               VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    migrated_from_hash   BYTEA,                          -- Jejak sementara saat ganti nomor (TTL 30d)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
    device_id            UUID PRIMARY KEY,
    account_id           UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    device_index         SMALLINT NOT NULL CHECK (device_index BETWEEN 0 AND 4), -- 0 = Primary Phone
    device_identity_pub  BYTEA NOT NULL,                 -- Kunci publik independen perangkat
    adv_account_sig      BYTEA NOT NULL,                 -- Tanda tangan Primary Identity Key
    signed_prekey_id     INT NOT NULL,
    signed_prekey_pub    BYTEA NOT NULL,
    signed_prekey_sig    BYTEA NOT NULL,
    push_token_enc       BYTEA,                          -- APNs / FCM token terenkripsi
    last_active_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, device_index)
);

CREATE TABLE one_time_prekeys (
    device_id            UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    key_id               INT NOT NULL,
    public_key           BYTEA NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, key_id)
);

-- ============================================================
-- 2. GRUP BESAR (MAKS 1.500 PESERTA)
-- ============================================================
CREATE TABLE groups (
    group_id             UUID PRIMARY KEY,
    encrypted_metadata   BYTEA NOT NULL,                 -- Nama, deskripsi, ikon terenkripsi klien
    member_count         INT NOT NULL DEFAULT 1 CHECK (member_count <= 1500),
    epoch_version        BIGINT NOT NULL DEFAULT 1,      -- Naik setiap eviksi/keluar -> Rotasi Sender Key
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
    group_id             UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    account_id           UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    role                 VARCHAR(16) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, account_id)
);

-- ============================================================
-- 3. PLATFORM BUSINESS (TERISOLASI SECARA LOGIS)
-- ============================================================
CREATE TABLE business_profiles (
    business_id          UUID PRIMARY KEY,
    account_id           UUID UNIQUE NOT NULL REFERENCES accounts(account_id),
    display_name         VARCHAR(128) NOT NULL,
    verification_tier    VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
    auto_reply_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
    customer_labels      JSONB NOT NULL DEFAULT '[]'::jsonb,
    api_rate_limit_rps   INT NOT NULL DEFAULT 250,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE business_products (
    product_id           UUID PRIMARY KEY,
    business_id          UUID NOT NULL REFERENCES business_profiles(business_id) ON DELETE CASCADE,
    sku                  VARCHAR(64) NOT NULL,
    title                VARCHAR(160) NOT NULL,
    price_minor          BIGINT NOT NULL CHECK (price_minor >= 0),
    currency_iso         CHAR(3) NOT NULL,
    media_cdn_ref        VARCHAR(256),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (business_id, sku)
);

CREATE TABLE business_webhooks (
    webhook_id           UUID PRIMARY KEY,
    business_id          UUID NOT NULL REFERENCES business_profiles(business_id) ON DELETE CASCADE,
    target_url           TEXT NOT NULL,
    hmac_secret_kms_ref  VARCHAR(128) NOT NULL,
    subscribed_events    TEXT[] NOT NULL,
    circuit_state        VARCHAR(16) NOT NULL DEFAULT 'CLOSED',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  },
  {
    id: 'scylla',
    name: 'ScyllaDB (Offline Queue)',
    role: 'Antrean pesan sementara (store-and-forward) untuk perangkat yang sedang offline, distribusi SKDM tertunda, serta tanda terima pengiriman (receipts).',
    consistency: 'Tunable Quorum (LOCAL_QUORUM untuk tulis/baca)',
    shardingStrategy: 'Partition key = (recipient_device_id, time_bucket) agar semua pesan tertunda untuk 1 perangkat dibaca secara berurutan (sequential disk read) dalam 1 query.',
    retentionPolicy: 'Penghapusan eksplisit segera setelah klien mengirim ACK (0 detik pasca-kirim). Fallback TTL = 30 hari (2.592.000 detik).',
    tables: [
      {
        name: 'offline_device_inbox',
        purpose: 'Menampung ciphertext 1-on-1 dan grup saat perangkat offline',
        partitionKey: '(recipient_device_id, day_bucket)',
        notes: 'Clustering key message_id (TimeUUID) menjamin urutan kausal pengiriman',
      },
      {
        name: 'pending_skdm_queue',
        purpose: 'Menampung Sender Key Distribution Message prioritas tinggi',
        partitionKey: 'recipient_device_id',
        notes: 'Dikirim lebih dulu sebelum ciphertext grup agar penerima tidak gagal dekripsi',
      },
      {
        name: 'delivery_receipts_queue',
        purpose: 'Antrean status Delivered dan Read saat pengirim offline',
        partitionKey: 'sender_device_id',
        notes: 'TTL pendek 7 hari untuk menghemat ruang penyimpanan',
      },
    ],
    ddl: `-- ============================================================
-- SCYLLADB / CASSANDRA: STORE-AND-FORWARD ZERO-RETENTION QUEUE
-- ============================================================
CREATE KEYSPACE messaging_realtime
WITH replication = {
    'class': 'NetworkTopologyStrategy',
    'ap_southeast_1': 3,
    'eu_central_1': 3
};

CREATE TABLE messaging_realtime.offline_device_inbox (
    recipient_device_id  uuid,
    day_bucket           int,                 -- Format YYYYMMDD untuk mencegah partition bloat
    message_id           timeuuid,            -- Urutan kronologis ketat
    sender_account_id    uuid,
    sender_device_id     uuid,
    conversation_type    tinyint,             -- 1=1on1, 2=Group, 3=DeviceSync
    group_id             uuid,
    ciphertext_blob      blob,                -- Signal Ciphertext / SenderKey Ciphertext
    ratchet_header       blob,                -- Header protokol Signal (non-sensitif)
    enqueued_at          timestamp,
    PRIMARY KEY ((recipient_device_id, day_bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id ASC)
  AND default_time_to_live = 2592000          -- Maks 30 hari bila perangkat tidak pernah online
  AND compaction = {
      'class': 'TimeWindowCompactionStrategy',
      'compaction_window_unit': 'DAYS',
      'compaction_window_size': 1
  };

CREATE TABLE messaging_realtime.pending_skdm_queue (
    recipient_device_id  uuid,
    group_id             uuid,
    sender_device_id     uuid,
    epoch_version        bigint,
    skdm_ciphertext      blob,                -- Terenkripsi pairwise Signal ke recipient_device_id
    PRIMARY KEY (recipient_device_id, group_id, sender_device_id)
) WITH default_time_to_live = 2592000;`,
  },
  {
    id: 'redis',
    name: 'Redis Cluster (Routing & Presence)',
    role: 'Pemetaan lokasi koneksi WebSocket/BEAM real-time, indikator mengetik (typing), status online/last-seen, serta pembatasan laju (rate-limiting).',
    consistency: 'Eventual / Single-Shard Atomic (Lua Scripts)',
    shardingStrategy: 'Hash slot berdasarkan {device_id} untuk routing tabel sesi dan {group_id} untuk pub-sub indikator mengetik.',
    retentionPolicy: 'Ephemeral murni: kunci sesi memiliki TTL 90 detik yang diperbarui heartbeat; indikator mengetik TTL 5 detik.',
    tables: [
      {
        name: 'sess:{device_id}',
        purpose: 'Menyimpan node BEAM & PID proses soket perangkat aktif',
        partitionKey: 'Hash Slot {device_id}',
        notes: 'Diperbarui tiap 30 detik via heartbeat; otomatis kadaluarsa jika koneksi putus',
      },
      {
        name: 'typing:{conversation_id}',
        purpose: 'Status mengetik / merekam suara ephemeral',
        partitionKey: 'Hash Slot {conversation_id}',
        notes: 'Tidak pernah ditulis ke disk; TTL 5 detik',
      },
      {
        name: 'rl:otp:{phone_hash}',
        purpose: 'Sliding window rate-limit OTP & registrasi perangkat',
        partitionKey: 'Hash Slot {phone_hash}',
        notes: 'Mencegah brute-force pengambilalihan akun dan SMS pumping',
      },
    ],
    ddl: `# ============================================================
# REDIS CLUSTER: KEYSPACE & STRUKTUR DATA EPHEMERAL
# ============================================================

# 1. Routing Sesi Aktif Perangkat (Hash, TTL 90s diperpanjang heartbeat)
HSET sess:{device_uuid}
     beam_node   "msg-ap-se1-node-42@internal"
     gateway_id  "gw-rust-19"
     conn_epoch  "1742081234"
     client_ver  "ios-4.18.2"
EXPIRE sess:{device_uuid} 90

# 2. Indikator Mengetik / Merekam Suara (Ephemeral String, TTL 5s)
SET typing:{conv_uuid}:{account_uuid} "composing" EX 5

# 3. Presence Terkendali Privasi (Last Seen & Online Flag)
HSET presence:{account_uuid}
     state       "online"
     active_devs "2"
     last_seen   "1742081290"
EXPIRE presence:{account_uuid} 120

# 4. Business API Token Bucket Rate Limiter (Lua Atomic)
# Key: rl:biz:{business_id}:{window_sec}
INCR rl:biz:{business_uuid}:1742081290
EXPIRE rl:biz:{business_uuid}:1742081290 2`,
  },
  {
    id: 's3',
    name: 'Object Storage S3 + CDN',
    role: 'Penyimpanan blob media terenkripsi (foto, video, voice note, dokumen), sinkronisasi riwayat sementara multi-device, dan snapshot cloud backup E2EE.',
    consistency: 'Read-After-Write Consistency',
    shardingStrategy: 'Prefix acak berbasis SHA-256 hash blob (content-addressed / randomized prefix) untuk menghindari hotspot partisi S3.',
    retentionPolicy: 'Media obrolan: 30 hari (dihapus otomatis oleh Lifecycle Policy); History Sync blob: 24 jam; E2EE Cloud Backup: persisten hingga ditimpa/dihapus pengguna.',
    tables: [
      {
        name: 'bucket-media-enc',
        purpose: 'Blob media terenkripsi AES-256-GCM + HMAC-SHA256',
        partitionKey: '/{prefix2}/{sha256_ciphertext}',
        notes: 'Kunci media 32-byte & HMAC dikirim hanya di dalam pesan E2EE, tidak pernah ke S3',
      },
      {
        name: 'bucket-history-sync',
        purpose: 'Arsip terenkripsi sementara untuk tautan perangkat companion baru',
        partitionKey: '/sync/{account_id}/{transfer_id}',
        notes: 'Enkripsi kunci sekali pakai yang ditukar via QR code saat pairing; TTL 24 jam',
      },
      {
        name: 'bucket-e2ee-backups',
        purpose: 'Cadangan riwayat obrolan terenkripsi dengan Root Backup Key',
        partitionKey: '/backup/{account_id}/latest.enc',
        notes: 'Server & penyedia cloud hanya melihat ciphertext buram (opaque)',
      },
    ],
    ddl: `# ============================================================
# OBJECT STORAGE (S3) BUCKET & LIFECYCLE SPECIFICATION
# ============================================================
# 1. Media Blob (Encrypted Client-Side sebelum Upload via Pre-Signed URL)
#    Path: s3://handrawina-media-enc-prod/{hash[0:2]}/{hash[2:4]}/{ciphertext_sha256}
#    Headers:
#      x-amz-server-side-encryption: AES256        (Defense-in-depth storage layer)
#      Cache-Control: public, max-age=2592000      (CDN cache aman karena ciphertext)
#    Lifecycle Rule: Expire after 30 days

# 2. Multi-Device Initial History Sync Blob
#    Path: s3://handrawina-history-sync-prod/{account_id}/{sync_session_uuid}.enc
#    Lifecycle Rule: Expire after 24 hours (dan dihapus segera pasca ACK companion)

# 3. E2EE Cloud Backup Snapshot
#    Path: s3://handrawina-backup-vault-prod/{account_id}/backup_v{epoch}.enc
#    Enkripsi Klien:
#      backup_key = HKDF-SHA256(root_key_256bit, "HandrawinaBackupKeyV1")
#      ciphertext = AES-256-GCM(backup_key, nonce, zstd(sqlite_chat_dump))
#    Lifecycle Rule: Retain latest 2 versions; noncurrent expire after 7 days`,
  },
];
