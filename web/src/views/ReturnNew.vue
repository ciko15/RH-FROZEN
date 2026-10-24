<template>
  <div class="return-new-page">
    <div class="card inv-info-card">
      <div class="inv-head">
        <span class="inv-title">Retur Invoice: #{{ invoice.invoice_no }}</span>
        <span class="badge badge-proses">{{ invoice.invoice_date }}</span>
      </div>
      <div class="inv-cust">Pelanggan: <strong>{{ invoice.customer_name }}</strong></div>
    </div>

    <!-- Pemilihan Barang Yang Diretur -->
    <div class="card items-card">
      <div class="section-header">
        <div class="section-title">Pilih Barang yang Diretur</div>
        <small class="section-hint">Centang atau masukkan jumlah barang yang ingin diretur saja (bisa sebagian)</small>
      </div>

      <div class="return-items-list">
        <div
          v-for="it in returnableItems"
          :key="it.product_id"
          class="return-item-row"
          :class="{ 'item-selected': it.selected || it.return_qty > 0 }"
        >
          <div class="it-check">
            <input
              type="checkbox"
              v-model="it.selected"
              @change="onToggleItem(it)"
              :id="'check-' + it.product_id"
            />
          </div>

          <label :for="'check-' + it.product_id" class="it-info">
            <span class="it-name">{{ it.name }}</span>
            <small class="it-meta">Terjual: <strong>{{ formatNumber(it.sold_qty) }}</strong> | Harga: Rp {{ formatNumber(it.net_unit_price) }}</small>
            <small class="it-rem">Maksimal retur: <strong>{{ it.max_returnable }}</strong></small>
          </label>

          <div class="it-qty-stepper">
            <button
              type="button"
              class="btn-step"
              @click="decrementQty(it)"
              :disabled="it.return_qty <= 0"
            >-</button>
            <input
              v-model.number="it.return_qty"
              type="number"
              min="0"
              :max="it.max_returnable"
              inputmode="numeric"
              class="step-input"
              @input="onQtyInput(it)"
            />
            <button
              type="button"
              class="btn-step"
              @click="incrementQty(it)"
              :disabled="it.return_qty >= it.max_returnable"
            >+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alasan Retur & Ringkasan Nilai -->
    <div class="card summary-card">
      <div class="form-group">
        <label>Alasan Retur Barang *</label>
        <input
          v-model="returnReason"
          type="text"
          placeholder="Contoh: Kemasan rusak / bocor"
          required
        />
      </div>

      <div class="divider"></div>

      <div class="total-row">
        <span>Total Nilai Retur:</span>
        <strong class="total-val text-danger">Rp {{ formatNumber(totalReturnValue) }}</strong>
      </div>
      <small class="note-sub">* Nilai retur otomatis memotong saldo bon pelanggan atau dicatat sebagai pengembalian dana.</small>

      <button
        class="btn-submit-return"
        @click="submitReturn"
        :disabled="loading || totalReturnValue <= 0 || !returnReason"
      >
        {{ loading ? 'Memproses Retur...' : 'Simpan & Terbitkan Nota Retur' }}
      </button>
    </div>

    <!-- Nota Retur Modal Setelah Berhasil (Format Sama Seperti Invoice Biasa) -->
    <div v-if="receiptReturn" class="sheet-overlay" @click.self="receiptReturn = null">
      <div class="sheet-content sheet-inv">
        <div class="sheet-head">
          <h3>NOTA RETUR PENJUALAN</h3>
          <button class="sheet-close" @click="receiptReturn = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body" style="padding: 12px 14px;">
          <!-- Format Resmi Menggunakan Komponen InvoiceView Lengkap -->
          <InvoiceView :invoice="formattedReturnInvoice" />
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" style="flex:1;" @click="receiptReturn = null; router.push('/sales')">
            <Icon name="check" size="16" /> Selesai & Kembali
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';
import { useRoute, useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { formatNumber } from '../utils/format.js';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const invoiceId = route.query.invoice_id;
const invoice = ref({});
const returnableItems = ref([]);
const returnReason = ref('');
const loading = ref(false);
const receiptReturn = ref(null);

const totalReturnValue = computed(() => {
  return returnableItems.value.reduce((sum, it) => {
    const q = it.return_qty || 0;
    return sum + (q * it.net_unit_price);
  }, 0);
});

// Format objek Nota Retur agar persis seperti invoice biasa namun berstatus RETUR
const formattedReturnInvoice = computed(() => {
  if (!receiptReturn.value) return {};
  const ret = receiptReturn.value;
  const items = Array.isArray(ret.items) ? ret.items : [];
  const totalQty = items.reduce((sum, it) => sum + parseInt(it.qty || 0, 10), 0);

  return {
    id: ret.id,
    doc_title: 'NOTA RETUR PENJUALAN',
    badge_text: 'RETUR BARANG',
    is_return: true,
    invoice_no: ret.return_no,
    invoice_date: ret.date,
    invoice_time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    customer_name: ret.customer_name || invoice.value?.customer_name,
    customer_address: invoice.value?.customer_address || invoice.value?.address || '-',
    customer_phone: invoice.value?.customer_phone || invoice.value?.phone || '',
    sales_name: invoice.value?.sales_name || '-',
    items: items.map(it => ({
      id: it.product_id,
      name: it.name,
      qty: it.qty,
      price: it.price,
      line_total: it.qty * it.price
    })),
    total_qty: totalQty,
    subtotal: ret.total,
    previous_balance: 0,
    total_due: ret.total,
    paid_amount: ret.cash_refund || 0,
    remaining: Math.max(0, ret.total - (ret.cash_refund || 0)),
    pay_method: ret.cash_refund > 0 ? 'Pengembalian Tunai' : 'Pemotongan Bon / Saldo',
    note: `Ref Faktur: #${invoice.value?.invoice_no || ''} | Alasan: ${ret.reason || '-'}`,
    config: invoice.value?.config || {
      business_name: 'RH FROZEN FOOD',
      business_address: 'Distributor & Supplier Makanan Beku'
    },
    branch_paper_width: invoice.value?.branch_paper_width || 58
  };
});

async function fetchInvoiceData() {
  if (!invoiceId) {
    appStore.showToast('ID Invoice tidak valid', 'warning');
    router.back();
    return;
  }

  try {
    const res = await apiFetch(`/api/invoices/${invoiceId}`);
    invoice.value = res.data;

    // Hitung sisa qty yang bisa diretur dan harga bersih per unit
    returnableItems.value = (res.data.items || []).map(it => {
      const soldQty = parseInt(it.qty, 10);
      const price = parseFloat(it.price);
      const discount = parseFloat(it.discount || 0);
      const netUnitPrice = price - (discount / soldQty);

      return {
        product_id: it.product_id,
        name: it.name,
        sold_qty: soldQty,
        net_unit_price: netUnitPrice,
        max_returnable: soldQty,
        return_qty: 0,
        selected: false
      };
    });
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

function onToggleItem(it) {
  if (it.selected && it.return_qty === 0) {
    it.return_qty = 1;
  } else if (!it.selected) {
    it.return_qty = 0;
  }
}

function onQtyInput(it) {
  if (it.return_qty > it.max_returnable) {
    it.return_qty = it.max_returnable;
  }
  if (it.return_qty < 0 || isNaN(it.return_qty)) {
    it.return_qty = 0;
  }
  it.selected = it.return_qty > 0;
}

function incrementQty(it) {
  if (it.return_qty < it.max_returnable) {
    it.return_qty++;
    it.selected = true;
  }
}

function decrementQty(it) {
  if (it.return_qty > 0) {
    it.return_qty--;
    it.selected = it.return_qty > 0;
  }
}

async function submitReturn() {
  const selectedItems = returnableItems.value
    .filter(it => it.return_qty > 0)
    .map(it => ({
      product_id: it.product_id,
      qty: it.return_qty
    }));

  if (selectedItems.length === 0) {
    appStore.showToast('Minimal pilih 1 barang untuk diretur', 'warning');
    return;
  }

  loading.value = true;
  const idempotencyKey = crypto.randomUUID();

  try {
    const res = await apiFetch('/api/returns', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        invoice_id: invoiceId,
        reason: returnReason.value,
        items: selectedItems
      })
    });

    appStore.showToast('Retur berhasil diproses!', 'success');
    receiptReturn.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function shareWaReturn() {
  if (!receiptReturn.value) return;
  const ret = receiptReturn.value;
  const refundText = ret.cash_refund > 0 
    ? `\nPengembalian Uang Tunai: Rp ${formatNumber(ret.cash_refund)}`
    : `\nKeterangan: Nilai retur otomatis memotong sisa hutang / bon Anda.`;
  
  const text = `*NOTA RETUR RH FROZEN FOOD*\nNo Retur: ${ret.return_no}\nInvoice Ref: ${invoice.value.invoice_no}\nPelanggan: ${invoice.value.customer_name}\nNilai Retur: Rp ${formatNumber(ret.total)}${refundText}\nAlasan: ${ret.reason}\n\nStok barang telah diterima dan disesuaikan kembali.`;

  let phone = String(invoice.value.customer_phone || invoice.value.customer?.phone || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.substring(1);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
}

function printReceipt() {
  if (typeof window !== 'undefined') {
    window.print();
  }
}

onMounted(() => {
  fetchInvoiceData();
});
</script>

<style scoped>
.return-new-page {
  padding: 16px;
  padding-bottom: 90px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inv-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.inv-title {
  font-weight: 700;
  font-size: 15px;
}
.section-header {
  margin-bottom: 14px;
}
.section-title {
  font-weight: 700;
  font-size: 15px;
}
.section-hint {
  font-size: 12px;
  color: var(--text-muted);
}
.return-items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.return-item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}
.return-item-row.item-selected {
  background: rgba(220, 38, 38, 0.05);
  border-color: rgba(220, 38, 38, 0.4);
}
[data-theme="dark"] .return-item-row.item-selected {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.5);
}
.it-check {
  display: flex;
  align-items: center;
}
.it-check input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--danger);
}
.it-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}
.it-name {
  font-weight: 600;
  font-size: 14px;
}
.it-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.it-rem {
  font-size: 11px;
  color: var(--primary);
}
.it-qty-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-step {
  width: 32px;
  height: 34px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-main);
  transition: background 0.1s ease;
}
.btn-step:active:not(:disabled) {
  transform: scale(0.95);
  background: var(--border-color);
}
.btn-step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.step-input {
  width: 48px;
  height: 34px;
  padding: 4px 6px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-main);
}
.divider {
  border-top: 1px dashed var(--border-color);
  margin: 10px 0;
}
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 700;
}
.total-val {
  font-size: 18px;
}
.note-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
  display: block;
}
.btn-submit-return {
  background: var(--danger);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 6px;
}

/* Modal Nota Retur */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet-content {
  background: var(--bg-card);
  width: 100%;
  max-width: 480px;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.sheet-close {
  background: transparent;
  font-size: 16px;
  min-height: 36px;
}
.receipt-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.r-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.total-big-row {
  font-size: 16px;
  font-weight: 800;
}
.receipt-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.btn-print-ret {
  flex: 1;
  background: #334155;
  color: white;
  min-height: 40px;
}
.btn-wa-ret {
  flex: 1;
  background: #25d366;
  color: white;
  min-height: 40px;
}
</style>
