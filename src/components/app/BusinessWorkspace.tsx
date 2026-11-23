import { useState } from 'react';
import { Plus, Send, Webhook } from 'lucide-react';
import type {
  AutoReplyRule,
  BusinessProduct,
  Conversation,
  WebhookDeliveryLog,
  WebhookEndpoint,
} from '../../types/handrawina';
import { formatIdr } from '../../utils/handrawinaState';

interface BusinessWorkspaceProps {
  products: BusinessProduct[];
  autoReplies: AutoReplyRule[];
  labels: string[];
  webhooks: WebhookEndpoint[];
  webhookLogs: WebhookDeliveryLog[];
  conversations: Conversation[];
  onCreateProduct: (params: {
    sku: string;
    title: string;
    priceIdr: number;
    description: string;
  }) => Promise<void>;
  onToggleProduct: (id: string) => Promise<void>;
  onCreateAutoReply: (triggerKeyword: string, responseText: string) => Promise<void>;
  onToggleAutoReply: (id: string) => Promise<void>;
  onToggleLabel: (conversationId: string, label: string) => Promise<void>;
  onCreateWebhook: (targetUrl: string) => Promise<void>;
  onTriggerWebhookTest: (webhookId: string, eventName: string) => Promise<void>;
  onShareProductToChat: (product: BusinessProduct) => void;
}

export function BusinessWorkspace({
  products,
  autoReplies,
  labels,
  webhooks,
  webhookLogs,
  conversations,
  onCreateProduct,
  onToggleProduct,
  onCreateAutoReply,
  onToggleAutoReply,
  onToggleLabel,
  onCreateWebhook,
  onTriggerWebhookTest,
  onShareProductToChat,
}: BusinessWorkspaceProps) {
  // Catalog form
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [priceIdr, setPriceIdr] = useState('150000');
  const [description, setDescription] = useState('');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Auto-reply form
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState('');

  // Webhook form
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !title.trim() || Number(priceIdr) <= 0) {
      setCatalogError('SKU, nama produk, dan harga positif wajib diisi.');
      return;
    }
    setCatalogError(null);
    await onCreateProduct({
      sku: sku.trim(),
      title: title.trim(),
      priceIdr: Number(priceIdr),
      description: description.trim(),
    });
    setSku('');
    setTitle('');
    setDescription('');
  };

  const handleAddAutoReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !replyText.trim()) return;
    await onCreateAutoReply(keyword.trim(), replyText.trim());
    setKeyword('');
    setReplyText('');
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim().startsWith('https://')) {
      setWebhookError('Endpoint webhook wajib menggunakan protokol HTTPS.');
      return;
    }
    setWebhookError(null);
    await onCreateWebhook(webhookUrl.trim());
    setWebhookUrl('');
  };

  const handleFireTestWebhook = async (webhookId: string) => {
    setTestingWebhook(true);
    try {
      await onTriggerWebhookTest(webhookId, 'catalog.order');
    } finally {
      setTestingWebhook(false);
    }
  };

  const businessConvs = conversations.filter((c) => c.kind !== 'group');

  return (
    <div className="flex-1 overflow-y-auto bg-stone-950/42 backdrop-blur-md px-5 sm:px-8 py-8 text-stone-100">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="pb-5 border-b border-amber-200/15 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-amber-50">
              Platform Handrawina Business
            </h1>
            <p className="text-sm text-stone-300 mt-1">
              Jalur API terisolasi untuk katalog produk, balasan otomatis berbasis aturan, pelabelan pelanggan CRM, dan Webhook bertanda tangan HMAC-SHA256.
            </p>
          </div>
          <div className="text-xs font-mono text-amber-200">
            Endpoint: api.business.handrawina.net
          </div>
        </header>

        {/* SECTION 1: PRODUCT CATALOG */}
        <section
          aria-label="Katalog Produk Bisnis"
          className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-amber-200/12 bg-stone-950/55">
            <h2 className="text-base font-semibold text-amber-50">
              1. Katalog Produk ({products.length} SKU)
            </h2>
            <p className="text-xs text-stone-300 mt-0.5">
              Tambahkan produk baru atau kirim kartu katalog langsung ke percakapan pelanggan bisnis.
            </p>
          </div>

          <div className="p-5 space-y-5">
            <div className="overflow-x-auto">
              <table
                className="w-full text-left border-collapse text-xs"
                data-testid="catalog-table"
              >
                <thead>
                  <tr className="border-b border-amber-200/12 text-stone-400">
                    <th className="py-2.5 pr-4 font-medium">SKU</th>
                    <th className="py-2.5 pr-4 font-medium">Produk</th>
                    <th className="py-2.5 pr-4 font-medium text-right">Harga</th>
                    <th className="py-2.5 pr-4 font-medium">Status</th>
                    <th className="py-2.5 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/10">
                  {products.map((prod) => (
                    <tr key={prod.id} className="hover:bg-stone-900/45 transition-colors">
                      <td className="py-3 pr-4 font-mono text-stone-300 whitespace-nowrap">
                        {prod.sku}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-stone-100">{prod.title}</div>
                        <div className="text-stone-400 mt-0.5">{prod.description}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono tabular-nums text-right text-amber-200 whitespace-nowrap">
                        {formatIdr(prod.priceIdr)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onToggleProduct(prod.id)}
                          className={`text-xs font-medium underline-offset-2 hover:underline cursor-pointer ${
                            prod.active ? 'text-emerald-300' : 'text-stone-500'
                          }`}
                        >
                          {prod.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onShareProductToChat(prod)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-300/25 rounded-md cursor-pointer transition-colors"
                        >
                          <Send className="w-3 h-3" aria-hidden="true" />
                          Kirim ke Chat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleAddProduct}
              className="pt-4 border-t border-amber-200/12 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
            >
              <div>
                <label htmlFor="prod-sku" className="block text-xs font-medium text-stone-300 mb-1">
                  Kode SKU
                </label>
                <input
                  id="prod-sku"
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="NCR-BALI-250"
                  className="w-full px-3 py-2 text-xs font-mono border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="prod-title"
                  className="block text-xs font-medium text-stone-300 mb-1"
                >
                  Nama Produk
                </label>
                <input
                  id="prod-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Bali Kintamani Natural 250g"
                  className="w-full px-3 py-2 text-xs border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
                />
              </div>
              <div>
                <label
                  htmlFor="prod-price"
                  className="block text-xs font-medium text-stone-300 mb-1"
                >
                  Harga (IDR)
                </label>
                <input
                  id="prod-price"
                  type="number"
                  min={1000}
                  value={priceIdr}
                  onChange={(e) => setPriceIdr(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md h-[34px] cursor-pointer whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Tambah Produk
              </button>
              <div className="sm:col-span-5">
                <label htmlFor="prod-desc" className="sr-only">
                  Deskripsi singkat produk
                </label>
                <input
                  id="prod-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi singkat produk (opsional)..."
                  className="w-full px-3 py-2 text-xs border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
                />
              </div>
              {catalogError && (
                <p className="sm:col-span-5 text-xs text-red-400 font-medium">{catalogError}</p>
              )}
            </form>
          </div>
        </section>

        {/* SECTION 2: AUTO-REPLY & CUSTOMER LABELS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section
            aria-label="Aturan Balasan Otomatis"
            className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-amber-200/12 bg-stone-950/55">
              <h2 className="text-base font-semibold text-amber-50">
                2. Balasan Otomatis (Auto-Reply Engine)
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                Dijalankan otomatis oleh server saat pelanggan mengirim kata kunci di obrolan Bisnis.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="divide-y divide-amber-200/10 border border-amber-200/15 rounded-md bg-stone-900/50">
                {autoReplies.map((rule) => (
                  <div key={rule.id} className="p-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-semibold text-amber-200">
                        Kata kunci: &quot;{rule.triggerKeyword}&quot;
                      </div>
                      <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                        {rule.responseText}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleAutoReply(rule.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border shrink-0 cursor-pointer ${
                        rule.enabled
                          ? 'bg-emerald-950/70 text-emerald-200 border-emerald-500/35'
                          : 'bg-stone-900 text-stone-400 border-stone-700'
                      }`}
                    >
                      {rule.enabled ? 'Aktif' : 'Mati'}
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddAutoReply} className="space-y-2.5 pt-2">
                <div>
                  <label
                    htmlFor="ar-keyword"
                    className="block text-xs font-medium text-stone-300 mb-1"
                  >
                    Kata Kunci Pemicu Baru
                  </label>
                  <input
                    id="ar-keyword"
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Mis. promo atau ongkir"
                    className="w-full px-3 py-2 text-xs border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ar-response"
                    className="block text-xs font-medium text-stone-300 mb-1"
                  >
                    Teks Balasan Otomatis
                  </label>
                  <input
                    id="ar-response"
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="[Auto-Reply] Gratis ongkir untuk pembelian di atas Rp 250.000."
                    className="w-full px-3 py-2 text-xs border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer transition-colors"
                >
                  Simpan Aturan Auto-Reply
                </button>
              </form>
            </div>
          </section>

          <section
            aria-label="Manajemen Label Pelanggan"
            className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-amber-200/12 bg-stone-950/55">
              <h2 className="text-base font-semibold text-amber-50">
                3. Label Pelanggan &amp; Segmentasi CRM
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                Tandai percakapan pelanggan untuk pelacakan status pesanan dan filter cepat di ruang obrolan.
              </p>
            </div>
            <div className="p-5 divide-y divide-amber-200/10">
              {businessConvs.map((conv) => (
                <div key={conv.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-stone-100">{conv.name}</span>
                    <span className="text-[11px] font-mono text-stone-400">
                      {conv.labels.length} label aktif
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((lbl) => {
                      const active = conv.labels.includes(lbl);
                      return (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => onToggleLabel(conv.id, lbl)}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-400 text-stone-950 border-amber-300 font-semibold'
                              : 'bg-stone-900/80 text-stone-300 border-amber-200/15 hover:bg-stone-800 hover:text-stone-100'
                          }`}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* SECTION 3: WEBHOOK DISPATCHER & HMAC-SHA256 LOGS */}
        <section
          aria-label="Integrasi Webhook API dan HMAC-SHA256"
          className="bg-stone-950/70 backdrop-blur-xl border border-amber-200/15 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-amber-200/12 bg-stone-950/55">
            <h2 className="text-base font-semibold text-amber-50">
              4. Outbound Webhook Dispatcher &amp; Tanda Tangan HMAC-SHA256
            </h2>
            <p className="text-xs text-stone-300 mt-0.5">
              Event bisnis dikirim melalui antrean Kafka dengan header{' '}
              <code className="font-mono text-amber-200">X-Handrawina-Signature-256</code> dan retry eksponensial.
            </p>
          </div>

          <div className="p-5 space-y-5">
            <div className="divide-y divide-amber-200/10 border border-amber-200/15 rounded-md bg-stone-900/50">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-semibold text-stone-100 break-all">
                      {wh.targetUrl}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-1">
                      Event: {wh.events.join(' · ')} · Circuit Breaker: {wh.circuitState}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={testingWebhook}
                    onClick={() => handleFireTestWebhook(wh.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-md cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Webhook className="w-3.5 h-3.5" aria-hidden="true" />
                    Kirim Uji Webhook
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddWebhook} className="flex flex-wrap gap-2">
              <label htmlFor="wh-url-input" className="sr-only">
                URL Endpoint Webhook HTTPS
              </label>
              <input
                id="wh-url-input"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://crm.perusahaan.id/api/handrawina-webhook"
                className="flex-1 min-w-[240px] px-3 py-2 text-xs font-mono border border-amber-200/20 rounded-md bg-stone-900/80 text-stone-100 placeholder:text-stone-400"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-stone-100 bg-stone-900 hover:bg-stone-800 border border-amber-200/25 rounded-md cursor-pointer whitespace-nowrap transition-colors"
              >
                Daftarkan Endpoint
              </button>
              {webhookError && (
                <p className="w-full text-xs text-red-400 font-medium">{webhookError}</p>
              )}
            </form>

            {/* Live Webhook Delivery Log */}
            <div className="overflow-x-auto">
              <table
                className="w-full text-left border-collapse text-xs"
                data-testid="webhook-logs-table"
              >
                <thead>
                  <tr className="border-b border-amber-200/12 text-stone-400">
                    <th className="py-2 pr-4 font-medium">Waktu</th>
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 pr-4 font-medium">HTTP</th>
                    <th className="py-2 pr-4 font-medium">Header X-Handrawina-Signature-256</th>
                    <th className="py-2 font-medium text-right">Latensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/10">
                  {webhookLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 pr-4 font-mono tabular-nums text-stone-400">
                        {log.timestamp}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-stone-100">{log.event}</td>
                      <td className="py-2.5 pr-4 font-mono text-emerald-300 font-semibold">
                        {log.statusCode} OK
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-stone-400">
                        {log.signatureHeader}
                      </td>
                      <td className="py-2.5 font-mono tabular-nums text-right text-stone-200">
                        {log.latencyMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
