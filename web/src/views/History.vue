<template>
  <div class="history-page">
    <div class="history-header">
      <div class="section-title">Riwayat Semua Transaksi</div>
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari transaksi / pelanggan..."
          class="search-input"
        />
      </div>
    </div>

    <!-- Filter Tipe Transaksi -->
    <div class="type-tabs">
      <button
        v-for="tab in typeTabs"
        :key="tab"
        class="tab-btn"
        :class="{ active: selectedType === tab }"
        @click="selectedType = tab"
      >
        {{ tab }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Memuat riwayat transaksi...</div>
    <div v-else-if="filteredItems.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="history" size="38" /></div>
      <h3>Belum Ada Transaksi</h3>
      <p>Tidak ada riwayat transaksi yang cocok dengan pencarian.</p>
    </div>
    <div v-else>
      <div class="history-list">
        <div
          v-for="item in paginatedItems"
          :key="item.id + item.type"
          class="card history-card"
          :class="{
            'clickable-card': item.type === 'Invoice' || item.type === 'Pelunasan',
            'card-has-return': item.has_return
          }"
          @click="onHistoryCardClick(item)"
        >
          <div class="h-top">
            <span class="h-title">{{ item.title }}</span>
            <div class="h-badges">
              <span v-if="item.has_return" class="badge badge-retur-tag">
                ↩ Ada Retur
              </span>
              <span class="badge" :class="getTypeBadge(item.type)">
                {{ item.type }}
              </span>
            </div>
          </div>

          <div class="h-mid">
            <span class="h-cust">{{ item.customer || '-' }}</span>
            <span class="h-amount" :class="item.amount < 0 ? 'text-danger' : 'text-success'">
              {{ item.amount < 0 ? '- ' : '' }}Rp {{ formatNumber(Math.abs(item.amount)) }}
            </span>
          </div>

          <div class="h-foot">
            <span class="h-date">{{ item.date }}</span>
            <span class="h-status">{{ item.status }}</span>
          </div>

          <div class="h-card-actions" v-if="item.type === 'Invoice' || item.type === 'Pelunasan'" @click.stop>
            <button
              v-if="item.type === 'Invoice'"
              type="button"
              class="btn-h-edit"
              @click.stop="onEditInvoiceFromHistory(item)"
              title="Edit transaksi di kasir"
            >
              <Icon name="edit" size="13" /> Edit di Kasir
            </button>
            <button
              v-else-if="item.type === 'Pelunasan'"
              type="button"
              class="btn-h-edit"
              @click.stop="openEditPaymentModal(item)"
              title="Edit pelunasan piutang"
            >
              <Icon name="edit" size="13" /> Edit Pembayaran
            </button>
            <button
              type="button"
              class="btn-h-view"
              @click.stop="onHistoryCardClick(item)"
              title="Lihat rincian"
            >
              <Icon name="eye" size="13" /> Rincian
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination Riwayat Transaksi -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((currentPage - 1) * pageSize + 1) }} - {{ formatNumber(Math.min(currentPage * pageSize, filteredItems.length)) }} dari {{ formatNumber(filteredItems.length) }} transaksi
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ formatNumber(currentPage) }} / {{ formatNumber(totalPages) }}</span>
          <button
            class="btn-page"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            Berikutnya &raquo;
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Pratinjau Invoice -->
    <div v-if="activeInvoice" class="sheet-overlay" @click.self="activeInvoice = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Invoice {{ activeInvoice.invoice_no }}</h3>
          <button class="sheet-close" @click="activeInvoice = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <InvoiceView :invoice="activeInvoice" @edit="onEditInvoiceFromHistory" />
        </div>
      </div>
    </div>

    <!-- Modal Edit / Hapus Pelunasan Piutang -->
    <div v-if="showPaymentModal && selectedPayment" class="sheet-overlay" @click.self="showPaymentModal = false">
      <div class="sheet-content edit-payment-sheet">
        <div class="sheet-header">
          <div>
            <h3>Rincian Pembayaran Masuk</h3>
            <span class="subtext">Pelunasan Piutang Pelanggan</span>
          </div>
          <button class="sheet-close" @click="showPaymentModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group mb-12">
            <label class="form-label font-bold">Pelanggan / Toko *</label>
            <select v-model="paymentEditForm.customer_id" class="form-select">
              <option v-for="c in customers" :key="c.id" :value="c.id">
                {{ c.name }} (Saldo Bon: Rp {{ formatNumber(c.balance || 0) }})
              </option>
            </select>
          </div>

          <div class="form-group mb-12">
            <label class="form-label font-bold">Tanggal Pembayaran</label>
            <input v-model="paymentEditForm.payment_date" type="date" class="form-input" />
          </div>

          <div class="payment-info-box">
            <div class="p-row">
              <span class="p-lbl">Dicatat Oleh:</span>
              <span class="p-val font-bold">{{ selectedPayment.created_by || '-' }}</span>
            </div>
            <div class="p-row">
              <span class="p-lbl">ID Transaksi:</span>
              <span class="p-val font-mono">{{ selectedPayment.id }}</span>
            </div>
          </div>

          <div class="form-group mb-12">
            <label class="form-label font-bold">Nominal Pembayaran (Rp) *</label>
            <input 
              type="text" 
              inputmode="numeric" 
              :value="paymentEditForm.amount ? formatNumber(paymentEditForm.amount) : ''" 
              @input="onPaymentAmountInput($event)" 
              class="form-input font-bold" 
              placeholder="0" 
            />
          </div>

          <div class="form-group mb-12">
            <label class="form-label font-bold">Metode Pembayaran</label>
            <select v-model="paymentEditForm.method" class="form-select">
              <option value="Tunai">Tunai (Cash)</option>
              <option value="Transfer">Transfer Bank</option>
            </select>
          </div>

          <div class="form-group mb-12">
            <label class="form-label">Catatan Pembayaran</label>
            <input v-model="paymentEditForm.note" type="text" placeholder="Catatan opsional..." class="form-input" />
          </div>
        </div>

        <div class="sheet-footer payment-footer-actions">
          <button 
            v-if="canDeletePayment" 
            type="button" 
            class="btn-danger" 
            :disabled="paymentActionLoading" 
            @click="deletePaymentTx"
          >
            <Icon name="trash" size="16" /> Hapus
          </button>
          <div class="flex-spacer"></div>
          <button type="button" class="btn-secondary" @click="showPaymentModal = false">
            <Icon name="x" size="16" /> Batal
          </button>
          <button 
            type="button" 
            class="btn-primary" 
            :disabled="paymentActionLoading || !paymentEditForm.amount" 
            @click="submitUpdatePayment"
          >
            <Icon name="check" size="16" /> {{ paymentActionLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { useAuthStore } from '../stores/auth.js';
import { formatNumber } from '../utils/format.js';

const router = useRouter();

const appStore = useAppStore();
const authStore = useAuthStore();
const loading = ref(false);
const items = ref([]);
const searchQuery = ref('');

const typeTabs = ['Semua', 'Invoice', 'Retur', 'Pelunasan', 'Order'];
const selectedType = ref('Semua');

// Pagination (10 data per halaman)
const currentPage = ref(1);
const pageSize = ref(10);

const filteredItems = computed(() => {
  let list = items.value;
  if (selectedType.value !== 'Semua') {
    list = list.filter(it => (it.type || '').toLowerCase() === selectedType.value.toLowerCase());
  }
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    list = list.filter(it => 
      (it.title && it.title.toLowerCase().includes(q)) ||
      (it.customer && it.customer.toLowerCase().includes(q))
    );
  }
  return list;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value));
});

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

async function fetchHistory() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/history');
    items.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function getTypeBadge(type) {
  if (type === 'Invoice') return 'badge-dikirim';
  if (type === 'Retur') return 'badge-dibatalkan';
  if (type === 'Pelunasan') return 'badge-lunas';
  return 'badge-proses';
}

const activeInvoice = ref(null);

function onEditInvoiceFromHistory(inv) {
  activeInvoice.value = null;
  router.push(`/sales?edit_invoice_id=${inv.id}`);
}

async function viewInvoice(inv) {
  try {
    const res = await apiFetch(`/api/invoices/${inv.id}`);
    activeInvoice.value = res.data;
  } catch (e) {
    appStore.showToast(e.message || 'Gagal memuat rincian invoice', 'error');
  }
}

// ==========================================
// FITUR EDIT & HAPUS PELUNASAN PIUTANG
// ==========================================
const showPaymentModal = ref(false);
const customers = ref([]);

async function loadCustomers() {
  try {
    const res = await apiFetch('/api/customers');
    customers.value = (res.data || []).filter(c => c.active !== false);
  } catch (err) {
    console.warn('Gagal memuat pelanggan di riwayat:', err);
  }
}

const selectedPayment = ref(null);
const paymentActionLoading = ref(false);
const paymentEditForm = ref({
  customer_id: '',
  payment_date: '',
  amount: 0,
  method: 'Tunai',
  note: ''
});

const canDeletePayment = computed(() => {
  return ['admin', 'manajer'].includes(authStore.user?.role);
});

function onHistoryCardClick(item) {
  if (item.type === 'Invoice') {
    viewInvoice(item);
  } else if (item.type === 'Pelunasan') {
    openEditPaymentModal(item);
  }
}

function openEditPaymentModal(payment) {
  selectedPayment.value = payment;
  let rawDate = payment.date || payment.payment_date || '';
  if (rawDate.includes(' ')) rawDate = rawDate.split(' ')[0];
  if (!rawDate) rawDate = new Date().toISOString().split('T')[0];

  paymentEditForm.value = {
    customer_id: payment.customer_id || '',
    payment_date: rawDate,
    amount: parseFloat(payment.amount || 0),
    method: payment.method || 'Tunai',
    note: payment.note || ''
  };
  showPaymentModal.value = true;
}

function onPaymentAmountInput(event) {
  const raw = event.target.value.replace(/\D/g, '');
  paymentEditForm.value.amount = raw ? parseInt(raw, 10) : 0;
  event.target.value = paymentEditForm.value.amount ? formatNumber(paymentEditForm.value.amount) : '';
}

async function submitUpdatePayment() {
  if (!selectedPayment.value) return;
  if (!paymentEditForm.value.amount || paymentEditForm.value.amount <= 0) {
    return appStore.showToast('Nominal pembayaran harus lebih dari 0', 'warning');
  }

  paymentActionLoading.value = true;
  try {
    await apiFetch(`/api/receivables/${selectedPayment.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        customer_id: paymentEditForm.value.customer_id,
        payment_date: paymentEditForm.value.payment_date,
        amount: paymentEditForm.value.amount,
        method: paymentEditForm.value.method,
        note: paymentEditForm.value.note
      })
    });

    appStore.showToast('Pembayaran berhasil diperbarui!', 'success');
    showPaymentModal.value = false;
    await fetchHistory();
    await loadCustomers();
  } catch (e) {
    appStore.showToast(`Gagal memperbarui pembayaran: ${e.message}`, 'error');
  } finally {
    paymentActionLoading.value = false;
  }
}

async function deletePaymentTx() {
  if (!selectedPayment.value) return;
  if (!confirm(`Apakah Anda yakin ingin MENGHAPUS pembayaran Rp ${formatNumber(selectedPayment.value.amount)} untuk ${selectedPayment.value.customer}? Saldo piutang pelanggan akan dikembalikan.`)) {
    return;
  }

  paymentActionLoading.value = true;
  try {
    await apiFetch(`/api/receivables/${selectedPayment.value.id}`, {
      method: 'DELETE'
    });

    appStore.showToast('Pembayaran berhasil dihapus!', 'success');
    showPaymentModal.value = false;
    await fetchHistory();
    await loadCustomers();
  } catch (e) {
    appStore.showToast(`Gagal menghapus pembayaran: ${e.message}`, 'error');
  } finally {
    paymentActionLoading.value = false;
  }
}

onMounted(() => {
  fetchHistory();
  loadCustomers();
});
</script>

<style scoped>
.history-page {
  padding: 16px;
  padding-bottom: 90px;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 320px;
  min-width: 220px;
}
.search-input-wrapper .search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.search-input {
  width: 100%;
  padding-left: 36px;
  box-sizing: border-box;
}
.type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  overflow-x: auto;
}
.tab-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  min-height: 36px;
  padding: 4px 14px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
}
.empty-icon-box {
  width: 64px;
  height: 64px;
  background: var(--bg-hover);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px auto;
  color: var(--text-muted);
}

/* 2 Kolom Grid Layout */
.history-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.history-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.history-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-has-return {
  border-left: 4px solid #ef4444;
}
.h-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}
.badge-retur-tag {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  font-weight: 700;
  font-size: 11px;
}
.h-top, .h-mid, .h-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.h-title {
  font-weight: 700;
  font-size: 14px;
}
.h-cust {
  font-size: 13px;
  color: var(--text-muted);
}
.h-amount {
  font-weight: 800;
  font-size: 15px;
}
.text-danger {
  color: var(--danger, #ef4444);
}
.text-success {
  color: var(--success, #10b981);
}
.h-date, .h-status {
  font-size: 12px;
  color: var(--text-light);
}
.h-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color, #e2e8f0);
}
.btn-h-edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary, #0072ff);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-h-edit:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.btn-h-view {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-hover, #f1f5f9);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-h-view:hover {
  background: var(--border-color);
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 10px);
}
.page-info {
  font-size: 13px;
  color: var(--text-muted);
}
.page-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-page {
  background: var(--bg-hover, #f1f5f9);
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-main);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-page:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.btn-page:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.page-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.clickable-card {
  cursor: pointer;
}
.clickable-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}
.sheet-content {
  background: var(--bg-card, #fff);
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  padding: 18px;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-close {
  background: none;
  border: none;
  cursor: pointer;
}

/* Edit Payment Modal Styles */
.edit-payment-sheet {
  max-width: 480px;
}
.payment-info-box {
  background: var(--bg-hover, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.payment-info-box .p-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.payment-info-box .p-lbl {
  color: var(--text-muted, #64748b);
}
.payment-footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #e2e8f0);
}
.flex-spacer {
  flex: 1;
}
.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #0072ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary:hover:not(:disabled) {
  background: #0056c7;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-hover, #f1f5f9);
  color: var(--text-main, #334155);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
</style>
