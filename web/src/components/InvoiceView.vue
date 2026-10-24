<template>
  <div class="invoice-container" :class="printClass" ref="receiptRef">
    <!-- Header Invoice -->
    <div class="inv-header">
      <div class="biz-info">
        <h2 class="biz-name">{{ invoice.config?.business_name || 'RH FROZEN FOOD' }}</h2>
        <p class="biz-addr">{{ invoice.config?.business_address }}</p>
      </div>

      <div class="inv-title-bar">
        <div class="inv-title">
          <h3>{{ invoice.doc_title || 'INVOICE' }}</h3>
          <span class="inv-no">#{{ invoice.invoice_no }}</span>
        </div>
        <div class="inv-badge" :class="isLunas ? 'badge-lunas' : 'badge-tempo'">
          {{ invoice.badge_text || (isLunas ? 'LUNAS' : 'BELUM LUNAS') }}
        </div>
      </div>
    </div>

    <!-- Informasi Pelanggan & Transaksi -->
    <div class="info-grid">
      <div class="info-row">
        <span class="lbl">Tanggal:</span>
        <span class="val">{{ invoice.invoice_date }} {{ invoice.invoice_time || '' }}</span>
      </div>
      <div class="info-row">
        <span class="lbl">Nama pelanggan:</span>
        <span class="val font-bold">{{ invoice.customer_name }}</span>
      </div>
      <div class="info-row">
        <span class="lbl">Alamat:</span>
        <span class="val">{{ invoice.customer_address || '-' }}</span>
      </div>
      <div class="info-row" v-if="!isLunas && invoice.due_date">
        <span class="lbl">Jatuh tempo:</span>
        <span class="val text-danger font-bold">{{ invoice.due_date }}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Rincian Barang -->
    <div class="items-title">Rincian barang:</div>
    <table class="inv-table">
      <thead>
        <tr>
          <th class="text-left">Nama barang</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Harga</th>
          <th class="text-right">Jumlah</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in invoice.items" :key="it.id">
          <td class="text-left">
            <div>{{ it.name }}</div>
            <small v-if="it.discount > 0" class="disc-label">Diskon: {{ formatRp(it.discount) }}</small>
          </td>
          <td class="text-right">{{ formatNumber(it.qty) }}</td>
          <td class="text-right">{{ formatRp(it.price) }}</td>
          <td class="text-right">{{ formatRp(it.line_total) }}</td>
        </tr>
        <tr class="total-belanja-row">
          <td class="font-bold">Total belanja</td>
          <td class="text-right font-bold">{{ formatNumber(invoice.total_qty) }}</td>
          <td></td>
          <td class="text-right font-bold">{{ formatRp(invoice.subtotal) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="divider"></div>

    <!-- Ringkasan Bon & Pembayaran Sesuai Contoh Gambar -->
    <div class="summary-list">
      <div class="sum-row">
        <span class="sum-lbl">Bon sebelumnya</span>
        <span class="sum-val font-bold">{{ formatRp(invoice.previous_balance) }}</span>
      </div>
      <div class="sum-row" v-if="invoice.discount_total > 0">
        <span class="sum-lbl text-danger font-bold">Diskon / Potongan</span>
        <span class="sum-val font-bold text-danger">- {{ formatRp(invoice.discount_total) }}</span>
      </div>
      <div class="sum-row">
        <span class="sum-lbl">Total tagihan awal</span>
        <span class="sum-val font-bold">{{ formatRp(invoice.total_due) }}</span>
      </div>

      <!-- Keterangan Penyesuaian Retur Barang & Daftar Produk Reject -->
      <div v-if="invoice.total_returned_amount > 0 || (invoice.reject_items && invoice.reject_items.length > 0)" class="return-adj-box">
        <div class="sum-row text-danger font-bold">
          <span>⚠️ Retur / Reject Barang ({{ formatNumber(invoice.reject_total_qty || 0) }} pcs):</span>
          <span>- {{ formatRp(invoice.total_returned_amount) }}</span>
        </div>

        <!-- Tabel / Daftar Produk Reject & Jumlahnya -->
        <div class="reject-items-container">
          <div class="reject-table-title">Daftar Produk Reject:</div>
          <table class="reject-table">
            <thead>
              <tr>
                <th class="text-left">Barang</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Potongan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rj in (invoice.reject_items || [])" :key="rj.product_id">
                <td class="text-left">
                  <div class="font-bold">{{ rj.name }}</div>
                  <small class="reject-reason">{{ rj.reason }}</small>
                </td>
                <td class="text-right font-bold text-danger">{{ formatNumber(rj.qty) }} pcs</td>
                <td class="text-right text-danger">- {{ formatRp(rj.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-for="ret in invoice.returns" :key="ret.id" class="ret-mini-detail">
          <small>• Nota Retur: {{ ret.return_no || '-' }} ({{ ret.date || '-' }})</small>
        </div>

        <div class="sum-row adj-due-row">
          <span class="sum-lbl font-bold">Tagihan Bersih Setelah Retur:</span>
          <span class="sum-val font-bold text-primary">{{ formatRp(invoice.adjusted_total_due) }}</span>
        </div>
      </div>

      <div class="sum-row">
        <span class="sum-lbl">Total pembayaran</span>
        <span class="sum-val font-bold">{{ formatRp(invoice.paid_amount) }}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Sisa Kekurangan / Hutang Angka Besar -->
    <div class="balance-card">
      <span class="bal-lbl">Sisa kekurangan / hutang:</span>
      <span class="bal-val" :class="isLunas ? 'text-success' : 'text-danger'">
        {{ formatRp(invoice.remaining) }}
      </span>
    </div>

    <div class="meta-info">
      <div>Metode: <strong>{{ invoice.pay_method }}</strong></div>
      <div v-if="invoice.sales_name">Sales: <strong>{{ invoice.sales_name }}</strong></div>
      <div v-if="invoice.note">Keterangan: {{ invoice.note }}</div>
    </div>

    <!-- Footer Catatan Usaha -->
    <div class="inv-footer" v-if="invoice.config?.invoice_footer">
      {{ invoice.config.invoice_footer }}
    </div>

    <!-- Action Bar (Tidak Tercetak) -->
    <div class="action-bar no-print" v-if="showActions">
      <button class="btn-inv btn-print" @click="handlePrint" title="Cetak Struk Thermal / Printer">
        <Icon name="printer" size="15" />
        <span>Cetak</span>
      </button>
      <button class="btn-inv btn-wa" @click="handleWhatsApp" title="Kirim Nota Tagihan ke WhatsApp Pelanggan">
        <Icon name="whatsapp" size="15" />
        <span>Kirim WA</span>
      </button>
      <button class="btn-inv btn-photo" @click="handleSendAsImage" :disabled="imageLoading" title="Bagikan Struk sebagai Foto Gambar">
        <Icon name="camera" size="15" />
        <span>{{ imageLoading ? 'Proses...' : 'Foto' }}</span>
      </button>
      <button class="btn-inv btn-pdf" @click="handleDownloadPdf" :disabled="pdfLoading" title="Download File Dokumen PDF">
        <Icon name="file-text" size="15" />
        <span>{{ pdfLoading ? '...' : 'PDF' }}</span>
      </button>
      <button class="btn-inv btn-retur" v-if="!invoice.is_return" @click="handleGoToReturn" title="Retur Produk Transaksi Ini">
        <Icon name="rotate-ccw" size="15" />
        <span>Retur</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import html2canvas from 'html2canvas';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { formatNumber } from '../utils/format.js';

const props = defineProps({
  invoice: {
    type: Object,
    required: true
  },
  showActions: {
    type: Boolean,
    default: true
  }
});

const router = useRouter();
const appStore = useAppStore();
const receiptRef = ref(null);
const pdfLoading = ref(false);
const imageLoading = ref(false);

const isLunas = computed(() => {
  return parseFloat(props.invoice.remaining || 0) <= 0;
});

const printClass = computed(() => {
  const width = props.invoice.branch_paper_width || 58;
  return width === 80 ? 'print-80mm' : 'print-58mm';
});

// Format uang tanpa spasi sesuai contoh gambar "Rp5.000"
function formatRp(num) {
  return 'Rp' + formatNumber(Math.round(parseFloat(num || 0)));
}

function handlePrint() {
  window.print();
}

function handleGoToReturn() {
  router.push(`/returns/new?invoice_id=${props.invoice.id}`);
}

async function handleDownloadPdf() {
  pdfLoading.value = true;
  try {
    const res = await apiFetch(`/api/invoices/${props.invoice.id}/pdf`);
    if (res.data?.base64) {
      const linkSource = `data:application/pdf;base64,${res.data.base64}`;
      const downloadLink = document.createElement('a');
      downloadLink.href = linkSource;
      downloadLink.download = res.data.filename || `Invoice-${props.invoice.invoice_no}.pdf`;
      downloadLink.click();
      appStore.showToast('PDF berhasil diunduh', 'success');
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    pdfLoading.value = false;
  }
}

// Fitur Kirim / Unduh Struk Berupa Gambar Foto (PNG)
async function handleSendAsImage() {
  if (!receiptRef.value) return;
  imageLoading.value = true;
  try {
    // Sembunyikan action bar saat render gambar
    const canvas = await html2canvas(receiptRef.value, {
      scale: 2, // Resolusi jernih HD
      backgroundColor: '#ffffff',
      ignoreElements: (el) => el.classList.contains('no-print')
    });

    canvas.toBlob(async (blob) => {
      if (!blob) {
        throw new Error('Gagal mengonversi struk menjadi gambar');
      }

      const fileName = `Struk-${props.invoice.invoice_no || 'nota'}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // 1. CARA 1: Web Share API (Jika browser mendukung share file gambar langsung)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Struk #${props.invoice.invoice_no}`,
            text: `Struk belanja RH Frozen #${props.invoice.invoice_no} untuk ${props.invoice.customer_name}`
          });
          imageLoading.value = false;
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            imageLoading.value = false;
            return;
          }
          console.warn('Web Share failed, fallback to download/copy:', shareErr);
        }
      }

      // 2. Simpan gambar langsung ke galeri / download HP
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      // 3. Coba salin ke Clipboard jika browser mendukung
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
        }
      } catch (clipErr) {
        // Abaikan jika tidak didukung di HTTP/non-secure
      }

      // 4. Siapkan nomor WhatsApp tujuan
      let phone = String(props.invoice.customer_phone || '').replace(/\D/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.substring(1);

      const sisa = formatRp(props.invoice.remaining);
      const statusStr = isLunas.value ? 'LUNAS' : `BELUM LUNAS (Sisa ${sisa})`;
      let itemDetails = '';
      if (Array.isArray(props.invoice.items) && props.invoice.items.length > 0) {
        itemDetails = '\n\n*Rincian Barang:*\n' + props.invoice.items.map(it => `• ${it.name} (${it.qty}x) = ${formatRp(it.line_total)}`).join('\n');
      }

      const text = `Halo Kak *${props.invoice.customer_name}*,\nBerikut rincian nota dari *RH Frozen Food*:\n\n*No Faktur:* ${props.invoice.invoice_no}\n*Tanggal:* ${props.invoice.invoice_date || '-'}${itemDetails}\n\n*Total Tagihan:* ${formatRp(props.invoice.total_due)}\n*Total Pembayaran:* ${formatRp(props.invoice.paid_amount)}\n*Status:* ${statusStr}\n\nTerima kasih atas kerja sama Anda.`;
      const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;

      appStore.showToast('Foto tersimpan di HP & WhatsApp dibuka!', 'success');

      // Buka chat WA pelanggan
      window.open(waUrl, '_blank');
      imageLoading.value = false;
    }, 'image/png');
  } catch (err) {
    appStore.showToast(err.message || 'Gagal memproses foto struk', 'error');
    imageLoading.value = false;
  }
}

function handleWhatsApp() {
  const inv = props.invoice;
  const sisa = formatRp(inv.remaining);
  const statusStr = isLunas.value ? 'LUNAS' : `BELUM LUNAS (Sisa ${sisa})`;
  
  // Format rincian produk jika ada
  let itemDetails = '';
  if (Array.isArray(inv.items) && inv.items.length > 0) {
    itemDetails = '\n\n*Rincian Barang:*\n' + inv.items.map(it => `• ${it.name} (${it.qty}x) = ${formatRp(it.line_total)}`).join('\n');
  }

  const text = `Halo Yth. *${inv.customer_name}*,\nBerikut rincian struk tagihan dari *RH Frozen Food*:\n\n*No Invoice:* ${inv.invoice_no}\n*Tanggal:* ${inv.invoice_date || '-'}${itemDetails}\n\n*Total Tagihan:* ${formatRp(inv.total_due)}\n*Total Pembayaran:* ${formatRp(inv.paid_amount)}\n*Status:* ${statusStr}\n\nTerima kasih atas kerja sama Anda.`;
  
  let phone = String(inv.customer_phone || '').replace(/\D/g, '');
  if (phone.startsWith('0')) {
    phone = '62' + phone.substring(1);
  }
  
  const encoded = encodeURIComponent(text);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(waUrl, '_blank');
}
</script>

<style scoped>
.invoice-container {
  background: white;
  border-radius: var(--radius-card);
  padding: 20px 16px;
  color: #1e293b;
  font-size: 13px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
.inv-header {
  margin-bottom: 14px;
}
.biz-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--primary);
  margin-bottom: 2px;
}
.biz-addr {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 10px;
}
.inv-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}
.inv-title h3 {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.1;
}
.inv-no {
  font-size: 12px;
  color: #64748b;
}
.inv-badge {
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 800;
  font-size: 11px;
}
.badge-lunas {
  background: #dcfce7;
  color: #15803d;
}
.badge-tempo {
  background: #fee2e2;
  color: #b91c1c;
}
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.info-row {
  display: flex;
  justify-content: space-between;
}
.lbl {
  color: #64748b;
}
.font-bold {
  font-weight: 700;
}
.text-danger {
  color: var(--danger);
}
.text-success {
  color: var(--success);
}
.divider {
  border-top: 1px dashed #cbd5e1;
  margin: 10px 0;
}
.items-title {
  font-weight: 700;
  margin-bottom: 6px;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
}
.inv-table th {
  border-bottom: 1px solid #cbd5e1;
  padding: 6px 0;
  font-size: 11px;
  color: #64748b;
}
.inv-table td {
  padding: 6px 0;
  border-bottom: 1px dashed #f1f5f9;
}
.text-left { text-align: left; }
.text-right { text-align: right; }
.disc-label {
  color: var(--danger);
  font-size: 10px;
}
.total-belanja-row td {
  border-bottom: none;
  padding-top: 10px;
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sum-row {
  display: flex;
  justify-content: space-between;
}
.sum-lbl {
  color: #64748b;
}
.return-adj-box {
  background: #fef2f2;
  border-left: 3px solid var(--danger);
  padding: 8px 10px;
  border-radius: 6px;
  margin: 6px 0;
}
.reject-items-container {
  margin: 6px 0;
  background: #ffffff;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #fee2e2;
}
.reject-table-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--danger);
  margin-bottom: 4px;
}
.reject-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.reject-table th {
  border-bottom: 1px solid #fee2e2;
  padding: 3px 0;
  font-size: 10px;
  color: #991b1b;
}
.reject-table td {
  padding: 4px 0;
  border-bottom: 1px dashed #fef2f2;
}
.reject-reason {
  display: block;
  font-size: 9px;
  color: #991b1b;
  font-style: italic;
}
.ret-mini-detail {
  font-size: 10px;
  color: #64748b;
  margin-top: 3px;
}
.adj-due-row {
  border-top: 1px dashed #fca5a5;
  margin-top: 6px;
  padding-top: 5px;
}
.balance-card {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
}
.bal-lbl {
  font-size: 12px;
  color: #64748b;
}
.bal-val {
  font-size: 20px;
  font-weight: 900;
}
.meta-info {
  margin-top: 10px;
  font-size: 11px;
  color: #64748b;
}
.inv-footer {
  margin-top: 14px;
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
}
.action-bar {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  flex-wrap: wrap;
}
.btn-inv {
  flex: 1;
  min-width: 60px;
  height: 38px;
  min-height: 38px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-btn, 8px);
  color: white;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  white-space: nowrap;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.btn-inv:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);
}
.btn-inv:active:not(:disabled) {
  transform: scale(0.97);
}
.btn-inv:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-print { background: #334155; }
.btn-wa { background: #16a34a; }
.btn-photo { background: #0284c7; }
.btn-pdf { background: #6366f1; }
.btn-retur { background: #dc2626; }

@media (max-width: 480px) {
  .action-bar {
    gap: 6px;
  }
  .btn-inv {
    font-size: 11px;
    padding: 0 6px;
    height: 36px;
    min-height: 36px;
  }
}

/* Print Styles */
@media print {
  body {
    background: white !important;
  }
  .no-print {
    display: none !important;
  }
  .invoice-container {
    box-shadow: none !important;
    padding: 0 !important;
    width: 100% !important;
  }
  .print-58mm {
    width: 58mm !important;
    font-size: 10px !important;
  }
  .print-80mm {
    width: 80mm !important;
    font-size: 12px !important;
  }
}
</style>
