import {
  MERMAID_DIAGRAMS,
  SYSTEM_TARGETS,
  TECH_STACK_MATRIX,
  type SectionId,
} from '../data/tddContent';
import { MermaidDiagram } from './MermaidDiagram';
import { HandshakeSimulator } from './HandshakeSimulator';
import { GroupScaleCalculator } from './GroupScaleCalculator';
import { DatabaseSchemaExplorer } from './DatabaseSchemaExplorer';

function OverviewSection() {
  return (
    <div className="space-y-8">
      <div className="prose-block space-y-4 text-[15px] leading-relaxed text-slate-700 max-w-3xl">
        <p>
          Dokumen ini menjabarkan rancangan arsitektur teknis untuk <strong className="text-slate-900">Handrawina</strong>, platform perpesanan instan dan panggilan suara/video lintas platform (iOS, Android, Desktop, Web) yang dibangun di atas prinsip <strong className="text-slate-900">Zero-Knowledge Server</strong> dan ketersediaan tinggi lintas wilayah.
        </p>
        <p>
          Seluruh payload komunikasi—meliputi pesan teks, pesan suara, lampiran media, aliran audio/video WebRTC, hingga cadangan cloud—dienkripsi dan didekripsi sepenuhnya di perangkat pengguna. Infrastruktur server bertindak semata sebagai perute paket berlatensi rendah, direktori kunci publik terverifikasi, dan antrean <em>store-and-forward</em> sementara yang menghapus ciphertext segera setelah menerima tanda terima pengiriman (ACK).
        </p>
      </div>

      {/* Quantitative system targets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SYSTEM_TARGETS.map((item) => (
          <div
            key={item.label}
            className="p-4 bg-white border border-slate-200 rounded-lg"
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-1.5">
              {item.value}
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.detail}</p>
          </div>
        ))}
      </div>

      <MermaidDiagram
        diagramKey="global-arch"
        title="Diagram 1 — Arsitektur Sistem Global & Isolasi Jalur Consumer vs Business"
        caption="Pemisahan penuh antara Edge Gateway stateful untuk klien konsumen, API Gateway stateless untuk platform Business, klaster SFU/TURN, dan HSM Backup Vault."
        code={MERMAID_DIAGRAMS.globalArchitecture}
      />

      {/* Technology stack decision table */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">
          Keputusan Arsitektur & Matriks Teknologi
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          Pemilihan runtime dan mesin penyimpanan disesuaikan dengan karakteristik beban kerja (I/O concurrency, konsistensi ACID, dan zero-retention throughput).
        </p>
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 font-semibold">Lapisan Sistem</th>
                <th className="py-3 px-4 font-semibold">Teknologi Pilihan</th>
                <th className="py-3 px-4 font-semibold">Rasional Teknis</th>
                <th className="py-3 px-4 font-semibold">Trade-Off & Mitigasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TECH_STACK_MATRIX.map((row) => (
                <tr key={row.layer} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                    {row.layer}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-teal-900 font-medium whitespace-nowrap">
                    {row.technology}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 leading-relaxed min-w-[240px]">
                    {row.rationale}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 leading-relaxed min-w-[200px]">
                    {row.tradeoff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function E2eeSection() {
  return (
    <div className="space-y-8">
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 max-w-3xl">
        <p>
          Lapisan kriptografi inti mengadopsi <strong className="text-slate-900">Signal Protocol</strong> dengan kurva eliptik <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">X25519</code> untuk pertukaran kunci Diffie-Hellman, <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">Ed25519</code> untuk tanda tangan digital, <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">HKDF-SHA256</code> untuk derivasi kunci, dan <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">AES-256-GCM / CBC+HMAC-SHA256</code> untuk enkripsi terautentikasi.
        </p>
      </div>

      {/* 3 pillars of Signal Protocol */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">Komponen 01 · Prekey Hierarchy</div>
          <h3 className="text-base font-semibold text-slate-900">X3DH & Kolam Prekeys</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Memungkinkan inisiasi sesi terenkripsi secara asinkron meski penerima sedang offline. Perangkat mengunggah <strong>Identity Key (IK)</strong>, <strong>Signed Prekey (SPK)</strong> yang dirotasi mingguan, serta kolam 100 <strong>One-Time Prekeys (OPK)</strong> yang dihapus atomik begitu dipakai sekali.
          </p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">Komponen 02 · Per-Message Evolution</div>
          <h3 className="text-base font-semibold text-slate-900">Double Ratchet Algorithm</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Menggabungkan <em>Symmetric-Key KDF Ratchet</em> (menghasilkan Message Key unik untuk setiap pesan lalu memusnahkannya) dengan <em>Diffie-Hellman Ratchet</em> di setiap pergantian balasan. Memberikan jaminan <strong>Forward Secrecy</strong> dan <strong>Post-Compromise Security</strong>.
          </p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">Komponen 03 · Media & Panggilan</div>
          <h3 className="text-base font-semibold text-slate-900">Enkripsi Media & SRTP Key Exchange</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Foto, video, dan pesan suara dienkripsi lokal memakai 32-byte <code className="text-xs">MediaKey</code> acak (<code className="text-xs">AES-256-GCM</code>) sebelum diunggah ke CDN. Hanya pointer URL, <code className="text-xs">MediaKey</code>, dan hash <code className="text-xs">SHA-256</code> yang dikirim dalam amplop Signal E2EE.
          </p>
        </div>
      </div>

      <MermaidDiagram
        diagramKey="x3dh-handshake"
        title="Diagram 2 — Alur Pertukaran Kunci Enkripsi (X3DH Handshake & Double Ratchet)"
        caption="Alur kriptografi lengkap mulai dari unggah Prekey Bundle, kalkulasi 4x DH asinkron, penghapusan atomik OPK, hingga pemulihan kunci otomatis (Ratchet Step)."
        code={MERMAID_DIAGRAMS.x3dhHandshake}
      />

      <HandshakeSimulator defaultScenario="x3dh-ratchet" />

      {/* Media & Call E2EE specification table */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">
          Spesifikasi Enkripsi Lintas Tipe Konten
        </h3>
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 font-semibold">Tipe Konten</th>
                <th className="py-3 px-4 font-semibold">Algoritma Enkripsi</th>
                <th className="py-3 px-4 font-semibold">Distribusi Kunci</th>
                <th className="py-3 px-4 font-semibold">Jalur Transportasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Pesan Teks 1-on-1</td>
                <td className="py-3 px-4 font-mono text-slate-700">AES-256-CBC + HMAC-SHA256</td>
                <td className="py-3 px-4 text-slate-700">X3DH + Double Ratchet (unik per pesan)</td>
                <td className="py-3 px-4 text-slate-600">Binary XMPP / Noise_XX over WebSocket</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Media & Pesan Suara</td>
                <td className="py-3 px-4 font-mono text-slate-700">AES-256-GCM (Streaming Chunk 64KB)</td>
                <td className="py-3 px-4 text-slate-700">Ephemeral MediaKey 32B di dalam pesan Signal</td>
                <td className="py-3 px-4 text-slate-600">HTTPS Pre-Signed URL ke S3 + Edge CDN</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Panggilan 1-on-1</td>
                <td className="py-3 px-4 font-mono text-slate-700">SRTP (AES-256-CM / AEAD_AES_256_GCM)</td>
                <td className="py-3 px-4 text-slate-700">Master Key dinegosiasikan di dalam Signal Offer/Answer</td>
                <td className="py-3 px-4 text-slate-600">WebRTC P2P (ICE/STUN) atau TURN Relay</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Panggilan Grup</td>
                <td className="py-3 px-4 font-mono text-slate-700">DTLS-SRTP (Hop) + SFrame E2EE (Frame)</td>
                <td className="py-3 px-4 text-slate-700">Per-Participant SFrame Sender Key via Signal Pairwise</td>
                <td className="py-3 px-4 text-slate-600">WebRTC SFU Simulcast (Zero-Access Media)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GroupMultiDeviceSection() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="text-xs font-mono text-teal-800 font-medium">
            Skalabilitas Grup · Maks 1.500 Peserta
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Protokol Sender Keys & Rotasi Otomatis
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Mengenkripsi pesan secara pairwise kepada 1.500 peserta (masing-masing rata-rata 2 perangkat = 2.999 sesi) akan memaksa perangkat seluler melakukan 2.999 operasi enkripsi dan mengunggah megabyte data untuk satu teks pendek.
          </p>
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            <li>
              <strong>Distribusi SKDM (Sekali di Awal):</strong> Pengirim membuat <em>Sender Key</em> (32-byte Chain Key + Ed25519 Signing Key) lalu mengirimnya secara aman via sesi Signal 1-on-1 ke seluruh perangkat anggota.
            </li>
            <li>
              <strong>Enkripsi Pesan O(1):</strong> Setiap pesan grup hanya dienkripsi <strong>1 kali</strong> oleh pengirim dan ditandatangani dengan Signing Key; server melakukan <em>fan-out</em> ciphertext identik ke seluruh perangkat anggota.
            </li>
            <li>
              <strong>Eviksi & Epoch Guard:</strong> Saat ada anggota keluar atau dikeluarkan, server menaikkan <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded">epoch_version</code> dan menolak pesan dengan epoch lama. Pengirim otomatis memusnahkan Sender Key lama dan mendistribusikan kunci baru hanya ke anggota tersisa.
            </li>
          </ul>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="text-xs font-mono text-teal-800 font-medium">
            Arsitektur Multi-Device · Independen Tanpa Ponsel Online
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Identitas Perangkat Independen & ADV Signed Device List
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Berbeda dari arsitektur proxy lama yang bergantung pada ponsel utama, setiap perangkat companion (Desktop, Web, Tablet — maks 4 companion) memiliki <strong>Device Identity Key</strong> sendiri yang disimpan di Keychain/IndexedDB lokal dan tidak pernah diekspor.
          </p>
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            <li>
              <strong>Account Device Verification (ADV):</strong> Saat menautkan perangkat via QR code, ponsel utama menandatangani daftar kunci publik seluruh perangkat aktif menggunakan <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded">IK_Primary</code>. Pengirim lain memverifikasi tanda tangan ini agar server tidak bisa menyisipkan perangkat penyadap gelap.
            </li>
            <li>
              <strong>Client-Side Fan-Out & Self-Sync:</strong> Pengirim mengenkripsi pesan 1-on-1 untuk setiap perangkat aktif milik penerima sekaligus ke perangkat companion miliknya sendiri.
            </li>
            <li>
              <strong>Initial History Sync:</strong> Ponsel utama membungkus riwayat obrolan terbaru ke dalam blob terenkripsi sementara (kunci sekali pakai dari sesi QR), mengunggah ke S3 (TTL 24 jam), lalu menghapusnya segera setelah companion selesai sinkronisasi.
            </li>
          </ul>
        </div>
      </div>

      <GroupScaleCalculator />

      <MermaidDiagram
        diagramKey="sender-keys-md"
        title="Diagram 3 — Mekanisme Sender Keys (1.500 Peserta) & Multi-Device Fan-Out"
        caption="Pemisahan jalur distribusi SKDM pairwise dengan jalur pesan reguler O(1) yang langsung di-fan-out server ke seluruh perangkat companion penerima dan pengirim."
        code={MERMAID_DIAGRAMS.senderKeysMultiDevice}
      />

      <HandshakeSimulator defaultScenario="sender-keys" />
    </div>
  );
}

function RealtimeWebrtcSection() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="text-xs font-mono text-teal-800 font-medium">
            Messaging Core · Rust Edge + Erlang/Elixir BEAM
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Protokol Biner Berlatensi Rendah & Delivery Receipts
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Untuk menekan latensi P99 di bawah 45 ms pada jutaan koneksi serentak, lapisan transport menggunakan <strong className="text-slate-900">Noise_XX + Binary XMPP/Protobuf kustom</strong> di atas WebSockets/TLS 1.3 (dan fallback QUIC/HTTP3 pada jaringan seluler tidak stabil).
          </p>
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            <li>
              <strong>1 Aktor BEAM = 1 Sesi Perangkat:</strong> Setiap perangkat yang terhubung direpresentasikan sebagai proses aktor Erlang/Elixir (~2 KB RAM) yang mendaftarkan lokasi node-nya ke Redis Cluster (<code className="text-xs font-mono">sess:device_id</code>).
            </li>
            <li>
              <strong>Siklus Status Pesan:</strong> <em>Sent</em> (ACK dari BEAM setelah masuk mailbox penerima atau tertulis di ScyllaDB), <em>Delivered</em> (stanza ACK dari perangkat penerima, memicu penghapusan ciphertext di ScyllaDB), <em>Read</em> (stanza opsional sesuai preferensi privasi), dan <em>Typing</em> (ephemeral pub-sub via Redis TTL 5 detik tanpa disk I/O).
            </li>
            <li>
              <strong>Pesan Suara (Voice Notes):</strong> Direkam dalam codec Opus (16–24 kbps), dienkripsi secara <em>chunked streaming</em> AES-256-GCM saat perekaman berlangsung agar unggahan selesai hampir seketika ketika tombol lepas ditekan.
            </li>
          </ul>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="text-xs font-mono text-teal-800 font-medium">
            Suara & Video · WebRTC + STUN/TURN + SFrame SFU
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Topologi Panggilan P2P (1-on-1) & SFU Terenkripsi (Grup)
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Signaling panggilan (Offer, Answer, Trickle ICE, Ringing, Hangup) melintasi koneksi messaging BEAM yang sama, sementara paket media RTP/SRTP mengalir pada jalur UDP berprioritas rendah-latensi.
          </p>
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            <li>
              <strong>STUN / TURN Anycast (Coturn):</strong> Klien mengumpulkan kandidat ICE melalui server STUN global. Pada NAT simetris atau firewall korporat, trafik dialihkan melalui klaster TURN dengan kredensial ephemeral berbasis HMAC (TTL 10 menit). Mode <em>Protect IP Address</em> memaksa semua panggilan melewati TURN agar alamat IP lawan bicara tersembunyi.
            </li>
            <li>
              <strong>Panggilan Grup via SFU + SFrame E2EE:</strong> Topologi P2P mesh kolaps di atas 4 peserta. SFU meneruskan aliran Simulcast (720p/360p/180p) secara adaptif sesuai bandwidth penerima, namun payload frame video/audio tetap terenkripsi ganda dengan <strong>SFrame</strong> (kunci ditukar via Signal Protocol) sehingga SFU tidak pernah mampu melihat atau mendengar isi panggilan.
            </li>
          </ul>
        </div>
      </div>

      <MermaidDiagram
        diagramKey="realtime-webrtc"
        title="Diagram 4 — Alur Signaling Messaging, STUN/TURN, dan Panggilan Grup WebRTC SFU + SFrame"
        caption="Memperlihatkan isolasi antara jalur signaling terenkripsi, relai P2P 1-on-1, serta enkripsi ganda DTLS-SRTP + SFrame pada panggilan grup SFU."
        code={MERMAID_DIAGRAMS.realtimeWebrtc}
      />

      {/* Delivery & Latency breakdown table */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">
          Mekanisme Status Real-Time & Jaminan Pengiriman
        </h3>
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 font-semibold">Event / Stanza</th>
                <th className="py-3 px-4 font-semibold">Persistensi Server</th>
                <th className="py-3 px-4 font-semibold">Jalur Pemrosesan</th>
                <th className="py-3 px-4 font-semibold">Perilaku Saat Penerima Offline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Pesan Teks / Media Pointer</td>
                <td className="py-3 px-4 font-mono text-slate-700">ScyllaDB (Hapus pasca ACK)</td>
                <td className="py-3 px-4 text-slate-700">BEAM Actor -&gt; Redis Lookup -&gt; Direct Push</td>
                <td className="py-3 px-4 text-slate-600">Antre di ScyllaDB (TTL 30d) + kirim Wakeup APNs/FCM</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Status Sent / Delivered / Read</td>
                <td className="py-3 px-4 font-mono text-slate-700">ScyllaDB Receipt Queue (7d)</td>
                <td className="py-3 px-4 text-slate-700">Batch Stanza ACK teragregasi (anti-flood)</td>
                <td className="py-3 px-4 text-slate-600">Disimpan ringkas per message_id sampai pengirim online</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Indikator Mengetik / Merekam</td>
                <td className="py-3 px-4 font-mono text-slate-700">None (Redis TTL 5s)</td>
                <td className="py-3 px-4 text-slate-700">Fire-and-forget Pub/Sub in-memory</td>
                <td className="py-3 px-4 text-slate-600">Dibuang langsung (tidak pernah disimpan)</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">VoIP Call Offer</td>
                <td className="py-3 px-4 font-mono text-slate-700">None (TTL 45s)</td>
                <td className="py-3 px-4 text-slate-700">High-Priority Call Signaling + VoIP PushKit</td>
                <td className="py-3 px-4 text-slate-600">Bangunkan app via PushKit; ubah jadi Missed Call setelah 45s</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountBusinessSection() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">
            01 · Migrasi Nomor Telepon
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Zero-Loss Number Migration
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Seluruh keanggotaan grup, kunci perangkat, dan cadangan ditambatkan pada <code className="text-xs font-mono bg-slate-100 px-1 rounded">account_id</code> (UUID internal), bukan nomor telepon.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
            <li>Verifikasi kepemilikan ganda via OTP nomor lama + nomor baru (atau sesi terautentikasi ponsel utama).</li>
            <li>Klien menandatangani payload migrasi dengan <code className="font-mono">IK_Primary</code> agar server dapat memverifikasi keabsahan kriptografi.</li>
            <li>Pembaruan atomik kolom <code className="font-mono">phone_hash</code> di CockroachDB; seluruh keanggotaan grup tetap utuh tanpa keluar-masuk ulang.</li>
            <li>Event pembaruan perutean otomatis disiarkan ke kontak aktif agar sesi Signal berlanjut mulus tanpa kehilangan riwayat obrolan lokal.</li>
          </ul>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">
            02 · Cloud Backup E2EE (HSM)
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            HSM Backup Key Vault (OPAQUE)
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Cadangan database lokal dienkripsi klien dengan <strong>256-bit Root Key</strong> (<code className="text-xs font-mono">AES-256-GCM</code>) sebelum diunggah ke Object Storage S3.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
            <li>Opsi A: Pengguna menyimpan kunci pemulihan 64-digit heksadesimal secara manual (tanpa menyentuh HSM).</li>
            <li>Opsi B: Pengguna memilih kata sandi yang diproses melalui protokol <strong>OPAQUE (PAKE)</strong> bersama klaster HSM FIPS 140-3.</li>
            <li>HSM tidak pernah melihat kata sandi mentah maupun Root Key mentah, namun menegakkan batas keras <strong>maksimal 5 percobaan salah</strong> di level perangkat keras sebelum menghapus slot permanen.</li>
          </ul>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-mono text-teal-800 font-medium">
            03 · Isolasi Platform Business
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Consumer vs Business API Plane
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Lalu lintas API komersial dipisahkan total ke domain <code className="text-xs font-mono bg-slate-100 px-1 rounded">api.business.*</code> agar lonjakan kampanye bisnis tidak mengganggu latensi pesan konsumen.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
            <li><strong>Katalog Produk & Label:</strong> Disimpan dalam partisi tenant bisnis dengan CDN media terpisah serta indeks SKU cepat.</li>
            <li><strong>Balasan Otomatis:</strong> Mesin aturan berbasis event (jam operasional, kata kunci, pesan selamat datang) dieksekusi oleh Business Core sebelum diteruskan ke E2EE Cloud/On-Prem Bridge.</li>
            <li><strong>Webhook Reliable Delivery:</strong> Antrean Kafka + Worker pool mengirim callback HTTPS bertanda tangan <code className="font-mono">X-Signature-256 (HMAC-SHA256)</code>, <em>exponential backoff</em>, <em>circuit breaker</em>, dan Dead-Letter Queue.</li>
          </ul>
        </div>
      </div>

      <MermaidDiagram
        diagramKey="account-hsm-business"
        title="Diagram 5 — Skema Migrasi Nomor, Arsitektur HSM Cloud Backup, & Isolasi Business API"
        caption="Alur lintas domain yang menjaga keamanan kriptografi identitas pengguna sambil menyediakan integrasi enterprise yang andal."
        code={MERMAID_DIAGRAMS.accountHsmBusiness}
      />

      <HandshakeSimulator defaultScenario="hsm-backup" />

      {/* Consumer vs Business API comparison table */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">
          Pemisahan Jalur API: Konsumen Reguler vs Platform Business
        </h3>
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 font-semibold">Dimensi Arsitektur</th>
                <th className="py-3 px-4 font-semibold">Jalur Konsumen Reguler</th>
                <th className="py-3 px-4 font-semibold">Jalur Platform Business API</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Endpoint & Protokol</td>
                <td className="py-3 px-4 font-mono text-slate-700">edge.handrawina.net · Stateful WS/Noise_XX Binary</td>
                <td className="py-3 px-4 font-mono text-teal-900">api.business.handrawina.net · Stateless REST / GraphQL</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Autentikasi</td>
                <td className="py-3 px-4 text-slate-700">Kunci Perangkat Kurva X25519 + ADV Signature</td>
                <td className="py-3 px-4 text-slate-700">OAuth 2.0 Scoped Token + mTLS Client Certificate</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Rate Limiting & Isolasi</td>
                <td className="py-3 px-4 text-slate-700">Anti-spam adaptif berbasis reputasi akun</td>
                <td className="py-3 px-4 text-slate-700">Token bucket per-tenant (250–1.000 RPS), pool worker terpisah</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Integrasi Eksternal</td>
                <td className="py-3 px-4 text-slate-700">Tidak ada (tertutup demi privasi penuh)</td>
                <td className="py-3 px-4 text-slate-700">Webhook Outbound (Kafka + HMAC-SHA256 + Retry DLQ)</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Batasan Enkripsi E2EE</td>
                <td className="py-3 px-4 text-slate-700">100% E2EE di perangkat fisik pengguna</td>
                <td className="py-3 px-4 text-slate-700">E2EE penuh hingga titik terminasi Enclave / On-Premises API milik tenant bisnis (diberi label transparan di UI pelanggan)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DatabaseSection() {
  return (
    <div className="space-y-8">
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700 max-w-3xl">
        <p>
          Tidak ada satu mesin database pun yang optimal untuk seluruh pola akses aplikasi perpesanan skala miliaran pesan per hari. Handrawina memisahkan beban kerja menjadi empat lapisan penyimpanan spesialis: <strong className="text-slate-900">CockroachDB/PostgreSQL</strong> (konsistensi kuat untuk identitas & bisnis), <strong className="text-slate-900">ScyllaDB</strong> (antrean tulis berthroughput tinggi untuk ciphertext offline), <strong className="text-slate-900">Redis Cluster</strong> (routing sesi & kehadiran ephemeral), dan <strong className="text-slate-900">Object Storage S3</strong> (blob media & backup terenkripsi).
        </p>
      </div>

      <MermaidDiagram
        diagramKey="database-erd"
        title="Diagram 6 — Entity Relationship Diagram (ERD) Skema Database Utama"
        caption="Relasi inti antara akun terdekople, perangkat tertaut multi-device, kolam prekeys, keanggotaan grup hingga 1.500 peserta, brankas HSM backup, dan domain Business."
        code={MERMAID_DIAGRAMS.databaseErd}
      />

      <DatabaseSchemaExplorer />
    </div>
  );
}

export function ActiveTddSection({ sectionId }: { sectionId: SectionId }) {
  switch (sectionId) {
    case 'overview':
      return <OverviewSection />;
    case 'e2ee':
      return <E2eeSection />;
    case 'group-multidevice':
      return <GroupMultiDeviceSection />;
    case 'realtime-webrtc':
      return <RealtimeWebrtcSection />;
    case 'account-business':
      return <AccountBusinessSection />;
    case 'database':
      return <DatabaseSection />;
    default:
      return <OverviewSection />;
  }
}
