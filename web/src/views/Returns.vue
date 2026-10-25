<template>
  <div class="returns-page">
    <div class="returns-header">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: tab === 'list' }" @click="tab = 'list'">
          📋 Daftar Retur ({{ formatNumber(returns.length) }})
        </button>
        <button v-if="isSales" class="tab-btn" :class="{ active: tab === 'create' }" @click="tab = 'create'">
          ➕ Ajukan Retur Baru
        </button>
      </div>
    </div>

    <!-- TAB 1: DAFTAR RETUR -->
    <div v-if="tab === 'list'" class="list-section">
      <div class="filter-bar">
        <button
          v-for="st in statusFilters"
          :key="st"
          class="pill-btn"
          :class="{ active: currentStatus === st }"
          @click="currentStatus = st"
        >
          {{ st }}
        </button>
      </div>

      <div v-if="loading" class="empty">Memuat data retur...</div>
      <div v-else-if="filteredReturns.length === 0" class="empty">
        <Icon name="package" size="38" />
        <h3>Belum Ada Retur</h3>
        <p>Tidak ada pengajuan retur pada status ini.</p>
      </div>

      <div v-else class="ret-list">
        <div v-for="r in filteredReturns" :key="r.id" class="card ret-card" @click="selectedReturn = r">
          <div class="ret-top">
            <span class="ret-no"><strong>{{ r.return_no }}</strong></span>
            <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span>
          </div>
          <div class="ret-sales">👤 Sales: <strong>{{ r.sales_name }}</strong> · Invoice: #{{ r.invoice_no || '-' }}</div>
          <div class="ret-cust">Pelanggan: {{ r.customer_name }}</div>
          <div class="ret-reason">Alasan: "{{ r.reason || '-' }}"</div>
          <div class="ret-bottom">
            <span>{{ r.date }}</span>
            <div style="text-align: right;">
              <div><strong>{{ formatNumber(r.total_qty) }} pcs barang</strong></div>
              <div v-if="r.total_amount" style="font-size: 12px; color: var(--danger, #dc2626); font-weight: 700;">
                Rp {{ formatNumber(r.total_amount) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: AJUKAN RETUR BARU (SALES) -->
    <div v-if="tab === 'create' && isSales" class="create-section">
      <div class="card p-14">
        <div class="sec-title">1. Pilih Transaksi Penjualan</div>
        <select v-model="selectedInvoiceId" class="pos-select" @change="onInvoiceSelected">
          <option value="">-- Pilih Invoice yang Ingin Diretur --</option>
          <option v-for="inv in myInvoices" :key="inv.id" :value="inv.id">
            {{ inv.invoice_no }} - {{ inv.customer_name }} ({{ inv.tx_date || inv.invoice_date }})
          </option>
        </select>
      </div>

      <div v-if="selectedInvoice" class="card p-14">
        <div class="sec-title">2. Pilih Barang & Qty Retur</div>
        <div v-if="invoiceItems.length === 0" class="empty">Memuat rincian transaksi...</div>
        <div v-else class="ret-items-table">
          <div v-for="it in invoiceItems" :key="it.product_id" class="ret-item-row">
            <div class="it-name-col">
              <strong>{{ it.name }}</strong>
              <small class="text-muted">Dibeli: {{ formatNumber(it.qty) }} pcs · @Rp {{ formatNumber(it.price) }}</small>
            </div>
            <div class="qty-stepper">
              <button type="button" @click="decRetQty(it)">−</button>
              <input v-model.number="it.return_qty" type="number" min="0" :max="it.qty" />
              <button type="button" :disabled="it.return_qty >= it.qty" @click="it.return_qty++">+</button>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Alasan Retur ke Admin *</label>
          <input v-model="returnReason" type="text" placeholder="Contoh: Barang cacat dari pabrik / rusak" />
        </div>

        <!-- Estimasi Keuangan Retur -->
        <div v-if="createTotalReturnValue > 0" class="create-refund-box">
          <div class="cr-row">
            <span>Total Nilai Retur:</span>
            <strong class="text-danger">Rp {{ formatNumber(createTotalReturnValue) }}</strong>
          </div>
          <div v-if="createDebtDeduction > 0" class="cr-row">
            <span>Potong Bon Faktur (Sisa Bon: Rp {{ formatNumber(createInvoiceRemaining) }}):</span>
            <span class="text-warning">- Rp {{ formatNumber(createDebtDeduction) }}</span>
          </div>
          <div v-if="createCashRefund > 0" class="cr-row highlight">
            <span><strong>Uang Kembali (Kas Keluar):</strong></span>
            <strong class="text-success">Rp {{ formatNumber(createCashRefund) }}</strong>
          </div>
        </div>

        <button
          class="btn-submit"
          :disabled="submitting || totalSelectedQty <= 0 || !returnReason"
          @click="submitReturnRequest"
        >
          <Icon name="check" size="18" />
          <span>{{ submitting ? 'Mengirim Pengajuan...' : `Ajukan Retur (${totalSelectedQty} pcs) ke Admin` }}</span>
        </button>
        <p class="hint">Catatan: Stok sales & pengembalian uang/potong bon dicatat otomatis. Stok gudang bertambah saat admin menyetujui.</p>
      </div>
    </div>

    <!-- DETAIL / APPROVAL MODAL -->
    <div v-if="selectedReturn" class="sheet-overlay" @click.self="selectedReturn = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <div>
            <h3>Retur {{ selectedReturn.return_no }}</h3>
            <span class="badge" :class="badgeClass(selectedReturn.status)">{{ selectedReturn.status }}</span>
          </div>
          <button class="sheet-close" @click="selectedReturn = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="info-row"><span>Sales</span><strong>{{ selectedReturn.sales_name }}</strong></div>
          <div class="info-row"><span>Tanggal Pengajuan</span><span>{{ selectedReturn.date }}</span></div>
          <div class="info-row"><span>Invoice Asal</span><span>#{{ selectedReturn.invoice_no || '-' }}</span></div>
          <div class="info-row"><span>Pelanggan</span><span>{{ selectedReturn.customer_name || '-' }}</span></div>
          <div class="info-row"><span>Alasan</span><span class="text-muted">{{ selectedReturn.reason }}</span></div>
          <div v-if="selectedReturn.approved_by_name" class="info-row">
            <span>Disetujui Oleh</span><strong>{{ selectedReturn.approved_by_name }}</strong>
          </div>

          <h4 style="margin: 14px 0 6px;">Barang yang Diretur</h4>
          <div v-for="it in selectedReturn.items" :key="it.id || it.product_id" class="info-row" style="border-bottom: 1px dashed var(--border, #eee); padding: 6px 0;">
            <div>
              <span>{{ it.name }}</span>
              <div v-if="it.price" style="font-size: 11px; color: var(--text-muted, #888);">@Rp {{ formatNumber(it.price) }}</div>
            </div>
            <div style="text-align: right;">
              <strong>{{ formatNumber(it.qty) }} pcs</strong>
              <div v-if="it.price" style="font-size: 11px; color: var(--text-muted, #888);">Rp {{ formatNumber(it.qty * it.price) }}</div>
            </div>
          </div>
          <div class="info-row total" style="margin-top: 8px;">
            <span>Total Barang</span><strong>{{ formatNumber(selectedReturn.total_qty) }} pcs</strong>
          </div>
          <div v-if="selectedReturn.total_amount" class="info-row" style="font-weight: 700; color: var(--danger, #dc2626);">
            <span>Total Nilai Retur</span><strong>Rp {{ formatNumber(selectedReturn.total_amount) }}</strong>
          </div>

          <!-- Aksi Admin: Setujui / Tolak -->
          <div v-if="isAdmin && selectedReturn.status === 'Menunggu'" class="action-buttons">
            <button class="btn-action btn-approve" :disabled="actionLoading" @click="handleAction('approve')">
              <Icon name="check" size="16" />
              <span>Setujui Retur (Pindahkan Stok)</span>
            </button>
            <button class="btn-action btn-reject" :disabled="actionLoading" @click="handleAction('reject')">
              <Icon name="x" size="16" />
              <span>Tolak</span>
            </button>
          </div>
          <p v-if="isAdmin && selectedReturn.status === 'Menunggu'" class="hint">
            Saat disetujui: stok sales akan berkurang dan stok admin/gudang bertambah otomatis.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';
import { formatNumber } from '../utils/format.js';

const authStore = useAuthStore();
const appStore = useAppStore();

const user = computed(() => authStore.user);
const isSales = computed(() => user.value?.role === 'sales');
const isAdmin = computed(() => ['admin', 'manajer'].includes(user.value?.role));

const tab = ref('list');
const returns = ref([]);
const loading = ref(false);
const statusFilters = ['Semua', 'Menunggu', 'Disetujui', 'Ditolak'];
const currentStatus = ref('Semua');
const selectedReturn = ref(null);
const actionLoading = ref(false);

// Form retur baru
const myInvoices = ref([]);
const selectedInvoiceId = ref('');
const selectedInvoice = ref(null);
const invoiceItems = ref([]);
const returnReason = ref('');
const submitting = ref(false);

const filteredReturns = computed(() => {
  if (currentStatus.value === 'Semua') return returns.value;
  return returns.value.filter(r => (r.status || 'Menunggu') === currentStatus.value);
});

const totalSelectedQty = computed(() => invoiceItems.value.reduce((s, it) => s + (parseInt(it.return_qty, 10) || 0), 0));

const createTotalReturnValue = computed(() => {
  return invoiceItems.value.reduce((s, it) => {
    const q = parseInt(it.return_qty, 10) || 0;
    const price = parseFloat(it.price || 0);
    return s + (q * price);
  }, 0);
});

const createInvoiceRemaining = computed(() => {
  return parseFloat(selectedInvoice.value?.remaining || 0);
});

const createDebtDeduction = computed(() => {
  return Math.min(Math.max(0, createInvoiceRemaining.value), createTotalReturnValue.value);
});

const createCashRefund = computed(() => {
  return Math.max(0, createTotalReturnValue.value - createDebtDeduction.value);
});

function badgeClass(st) {
  if (st === 'Disetujui') return 'badge-disetujui';
  if (st === 'Ditolak') return 'badge-ditolak';
  return 'badge-menunggu';
}

function decRetQty(it) {
  if (it.return_qty > 0) it.return_qty--;
}

async function loadReturns() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/returns');
    returns.value = res.data || [];
  } catch (e) {
    appStore.showToast(`Gagal memuat retur: ${e.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

async function loadMyInvoices() {
  if (!isSales.value) return;
  try {
    const res = await apiFetch('/api/invoices?limit=50');
    myInvoices.value = res.data || [];
  } catch (e) {}
}

async function onInvoiceSelected() {
  if (!selectedInvoiceId.value) {
    selectedInvoice.value = null;
    invoiceItems.value = [];
    return;
  }
  selectedInvoice.value = myInvoices.value.find(i => i.id === selectedInvoiceId.value);
  try {
    const res = await apiFetch(`/api/invoices/${selectedInvoiceId.value}`);
    const items = (res.data?.items || []).map(it => ({
      ...it,
      return_qty: 0
    }));
    invoiceItems.value = items;
  } catch (e) {
    appStore.showToast('Gagal memuat rincian invoice', 'error');
  }
}

async function submitReturnRequest() {
  const items = invoiceItems.value
    .filter(it => it.return_qty > 0)
    .map(it => ({ product_id: it.product_id, qty: parseInt(it.return_qty, 10) }));

  if (!items.length) return appStore.showToast('Pilih minimal 1 barang untuk diretur', 'warning');
  if (!returnReason.value) return appStore.showToast('Isi alasan retur', 'warning');

  submitting.value = true;
  try {
    await apiFetch('/api/returns', {
      method: 'POST',
      body: JSON.stringify({
        invoice_id: selectedInvoiceId.value,
        reason: returnReason.value,
        items
      })
    });
    appStore.showToast('Pengajuan retur berhasil dibuat! Menunggu persetujuan admin.', 'success');
    tab.value = 'list';
    selectedInvoiceId.value = '';
    selectedInvoice.value = null;
    returnReason.value = '';
    await loadReturns();
  } catch (e) {
    appStore.showToast(`Gagal mengajukan retur: ${e.message}`, 'error');
  } finally {
    submitting.value = false;
  }
}

async function handleAction(action) {
  const label = action === 'approve' ? 'setujui' : 'tolak';
  if (!confirm(`Apakah Anda yakin ingin ${label} retur ini?`)) return;

  actionLoading.value = true;
  try {
    await apiFetch(`/api/returns/${selectedReturn.value.id}/${action}`, { method: 'POST' });
    appStore.showToast(action === 'approve' ? 'Retur disetujui! Stok dipindahkan ke admin.' : 'Retur ditolak.', 'success');
    selectedReturn.value = null;
    await loadReturns();
  } catch (e) {
    appStore.showToast(`Gagal: ${e.message}`, 'error');
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  loadReturns();
  loadMyInvoices();
});
</script>

<style scoped>
.returns-page { display: flex; flex-direction: column; gap: 12px; padding: 16px; padding-bottom: 90px; }
.tabs { display: flex; gap: 8px; }
.tab-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--border, #ddd); background: var(--card-bg, #fff); font-weight: 600; cursor: pointer; }
.tab-btn.active { background: var(--primary, #2563eb); color: #fff; border-color: transparent; }
.filter-bar { display: flex; gap: 6px; overflow-x: auto; }
.pill-btn { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border, #ddd); background: transparent; cursor: pointer; font-size: 13px; }
.pill-btn.active { background: var(--primary, #2563eb); color: #fff; border-color: transparent; }
.p-14 { padding: 14px; }
.sec-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.pos-select { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border, #ddd); background: transparent; }
.ret-list { display: flex; flex-direction: column; gap: 10px; }
.ret-card { padding: 14px; cursor: pointer; }
.ret-top, .ret-bottom { display: flex; justify-content: space-between; align-items: center; }
.ret-sales, .ret-cust { font-size: 13px; margin: 4px 0; }
.ret-reason { font-size: 12px; color: var(--text-muted, #888); font-style: italic; }
.badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-menunggu { background: rgba(245,158,11,.15); color: #d97706; }
.badge-disetujui { background: rgba(16,185,129,.15); color: #059669; }
.badge-ditolak { background: rgba(239,68,68,.15); color: #dc2626; }
.empty { text-align: center; color: var(--text-muted, #888); padding: 30px; font-size: 13px; }
.ret-items-table { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.ret-item-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border, #eee); }
.it-name-col { display: flex; flex-direction: column; }
.qty-stepper { display: flex; align-items: center; gap: 4px; }
.qty-stepper button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border, #ddd); background: transparent; cursor: pointer; }
.qty-stepper input { width: 44px; text-align: center; }
.create-refund-box {
  margin: 12px 0;
  padding: 10px 12px;
  background: rgba(0,0,0,0.02);
  border: 1px solid var(--border, #eee);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.cr-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cr-row.highlight {
  border-top: 1px dashed var(--border, #eee);
  padding-top: 6px;
  margin-top: 2px;
}
.btn-submit { width: 100%; margin-top: 14px; padding: 14px; border: none; border-radius: 12px; background: linear-gradient(135deg, var(--primary, #2563eb), #4f46e5); color: #fff; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
.hint { font-size: 12px; color: var(--text-muted, #888); margin-top: 8px; text-align: center; }
.sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; z-index: 1000; }
.sheet-content { background: var(--card-bg, #fff); width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 18px; }
.sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.sheet-close { background: none; border: none; cursor: pointer; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
.info-row.total { border-top: 1px solid var(--border, #eee); margin-top: 8px; padding-top: 8px; }
.action-buttons { display: flex; gap: 8px; margin-top: 16px; }
.btn-action { flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; }
.btn-approve { background: linear-gradient(135deg, #10b981, #059669); }
.btn-reject { background: linear-gradient(135deg, #ef4444, #dc2626); }
</style>
