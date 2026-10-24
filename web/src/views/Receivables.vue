<template>
  <div class="receivables-page">
    <!-- Header Total Piutang -->
    <div class="total-card card">
      <span class="label">Total Piutang Berjalan</span>
      <span class="amount">Rp {{ formatNumber(totalReceivables) }}</span>
      <span class="subtext">{{ formatNumber(debtors.length) }} Pelanggan memiliki saldo piutang</span>
    </div>

    <!-- Bar Pencarian & Judul -->
    <div class="section-header">
      <div class="section-title">Daftar Tagihan Pelanggan</div>
      <div class="header-action">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari pelanggan / telepon / alamat..."
          class="search-input"
        />
      </div>
    </div>

    <div v-if="loading" class="state-msg">Memuat data piutang...</div>
    <div v-else-if="filteredDebtors.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="check" size="38" /></div>
      <h3>{{ debtors.length === 0 ? 'Tidak Ada Piutang' : 'Pelanggan Tidak Ditemukan' }}</h3>
      <p>{{ debtors.length === 0 ? 'Seluruh pelanggan lunas!' : 'Tidak ada tagihan yang cocok dengan kata kunci pencarian.' }}</p>
    </div>

    <div v-else>
      <!-- Grid Card Pelanggan Piutang (2 Kolom di Desktop/Tablet) -->
      <div class="debtors-grid">
        <div
          v-for="d in paginatedDebtors"
          :key="d.id"
          class="card debtor-card"
          :class="{ 'card-overdue': d.has_overdue }"
        >
          <div class="debtor-head">
            <div class="cust-title-wrap">
              <span class="cust-name">{{ d.name }}</span>
              <span class="cust-branch" v-if="d.branch_id">{{ d.branch_id }}</span>
            </div>
            <span class="badge" :class="d.has_overdue ? 'badge-dibatalkan' : 'badge-menunggu'">
              {{ d.has_overdue ? `Menunggak ${formatNumber(d.overdue_days)} hari` : 'Aktif' }}
            </span>
          </div>

          <div class="debtor-detail-box">
            <div class="detail-row">
              <span class="row-label"><Icon name="map-pin" size="13" /> Alamat</span>
              <span class="row-val">{{ d.address || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="row-label"><Icon name="phone" size="13" /> No. Telepon</span>
              <span class="row-val">{{ d.phone || '-' }}</span>
            </div>
            <div class="detail-row balance-row">
              <span class="row-label font-bold">Total Tagihan:</span>
              <span class="balance-due">Rp {{ formatNumber(d.balance) }}</span>
            </div>
          </div>

          <div class="debtor-actions">
            <button class="btn-pay" @click="openPayModal(d)">
              <Icon name="dollar-sign" size="14" /> Terima Pelunasan
            </button>
            <button class="btn-wa" @click="sendWaReminder(d)">
              <Icon name="message-circle" size="14" /> Pengingat WA
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination (10 data per halaman) -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((currentPage - 1) * pageSize + 1) }} - {{ formatNumber(Math.min(currentPage * pageSize, filteredDebtors.length)) }} dari {{ formatNumber(filteredDebtors.length) }} pelanggan
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

    <!-- Modal Terima Pelunasan Piutang -->
    <div v-if="selectedDebtor" class="sheet-overlay" @click.self="selectedDebtor = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Pelunasan Piutang: {{ selectedDebtor.name }}</h3>
          <button class="sheet-close" @click="selectedDebtor = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="info-box">
            <div class="info-row">
              <span>Saldo Piutang Saat Ini:</span>
              <strong>Rp {{ formatNumber(selectedDebtor.balance) }}</strong>
            </div>
            <div class="info-row">
              <span>Sisa Setelah Bayar:</span>
              <strong :class="payRemaining <= 0 ? 'text-success' : 'text-danger'">
                Rp {{ formatNumber(payRemaining) }}
              </strong>
            </div>
          </div>

          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label>Jumlah Bayar (Rp) *</label>
              <span style="font-size:11px; color:var(--text-muted);">Bisa bayar cicil atau penuh</span>
            </div>
            <input
              v-model="formattedPayAmount"
              type="text"
              inputmode="numeric"
              placeholder="0"
            />
            <div class="quick-pay-presets">
              <button type="button" class="btn-preset" @click="payAmount = selectedDebtor.balance">Bayar Lunas (100%)</button>
              <button type="button" class="btn-preset" @click="payAmount = Math.round(selectedDebtor.balance / 2)">Bayar 50%</button>
            </div>
          </div>

          <div class="form-group">
            <label>Metode Pembayaran</label>
            <select v-model="payMethod">
              <option value="Tunai">Tunai</option>
              <option value="Transfer">Transfer</option>
            </select>
          </div>

          <div class="form-group">
            <label>Keterangan (Opsional)</label>
            <input v-model="payNote" type="text" placeholder="Contoh: Titip lewat sales" />
          </div>

          <button
            class="btn-submit"
            @click="submitReceivePayment"
            :disabled="payLoading || payAmount <= 0 || payAmount > selectedDebtor.balance || !isOnline"
          >
            {{ !isOnline ? 'Pelunasan Hanya Dapat Dilakukan Saat Online' : (payLoading ? 'Menyimpan...' : '✓ Simpan & Cetak Tanda Terima') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { useOfflineStore } from '../stores/offline.js';
import { formatNumber } from '../utils/format.js';

const appStore = useAppStore();
const offlineStore = useOfflineStore();
const isOnline = computed(() => offlineStore.isOnline);

const loading = ref(false);
const totalReceivables = ref(0);
const debtors = ref([]);
const searchQuery = ref('');

// Pagination state
const currentPage = ref(1);
const pageSize = ref(10);

const filteredDebtors = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return debtors.value;
  return debtors.value.filter(d => 
    (d.name && d.name.toLowerCase().includes(q)) ||
    (d.address && d.address.toLowerCase().includes(q)) ||
    (d.phone && d.phone.includes(q)) ||
    (d.branch_id && d.branch_id.toLowerCase().includes(q))
  );
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredDebtors.value.length / pageSize.value));
});

const paginatedDebtors = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredDebtors.value.slice(start, start + pageSize.value);
});

const selectedDebtor = ref(null);
const payAmount = ref(0);
const payMethod = ref('Tunai');
const payNote = ref('');
const payLoading = ref(false);

// Pemisah ribuan untuk jumlah bayar pelunasan
const formattedPayAmount = computed({
  get() {
    if (payAmount.value === 0) return '0';
    return (payAmount.value || '').toLocaleString('id-ID');
  },
  set(val) {
    const raw = String(val).replace(/\D/g, '');
    payAmount.value = raw ? parseInt(raw, 10) : 0;
  }
});

const payRemaining = computed(() => {
  if (!selectedDebtor.value) return 0;
  return Math.max(selectedDebtor.value.balance - (payAmount.value || 0), 0);
});

async function fetchReceivables() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/receivables');
    totalReceivables.value = res.data.total_receivables || 0;
    debtors.value = res.data.debtors || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openPayModal(d) {
  selectedDebtor.value = d;
  payAmount.value = d.balance;
  payMethod.value = 'Tunai';
  payNote.value = 'Pelunasan piutang';
}

async function submitReceivePayment() {
  if (payAmount.value <= 0 || payAmount.value > selectedDebtor.value.balance) {
    appStore.showToast('Jumlah pembayaran tidak valid', 'warning');
    return;
  }

  payLoading.value = true;
  const idempotencyKey = crypto.randomUUID();

  try {
    await apiFetch('/api/receivables', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        customer_id: selectedDebtor.value.id,
        amount: payAmount.value,
        method: payMethod.value,
        note: payNote.value
      })
    });

    appStore.showToast('Pelunasan piutang berhasil dicatat!', 'success');
    selectedDebtor.value = null;
    fetchReceivables();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    payLoading.value = false;
  }
}

function sendWaReminder(d) {
  const text = `Halo Bapak/Ibu dari *${d.name}*,\nKami dari RH Frozen Food ingin mengingatkan mengenai sisa tagihan piutang berjalan sebesar *Rp ${formatNumber(d.balance)}*.\nMohon dapat segera dilakukan penyelesaian pembayaran. Terima kasih atas kerja samanya.`;
  const phone = (d.phone || '').replace(/[^0-9]/g, '');
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

onMounted(() => {
  fetchReceivables();
});
</script>

<style scoped>
.receivables-page {
  padding: 16px;
  padding-bottom: 90px;
}
.total-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}
.total-card .label {
  font-size: 12px;
  font-weight: 600;
  color: #b91c1c;
}
.total-card .amount {
  font-size: 24px;
  font-weight: 800;
  color: #dc2626;
}
.total-card .subtext {
  font-size: 11px;
  color: #991b1b;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 0;
  color: var(--text-main);
}
.header-action {
  flex: 1;
  max-width: 320px;
}
.search-input {
  width: 100%;
}
.debtors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.debtor-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.debtor-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-overdue {
  border-left: 4px solid var(--danger);
}
.debtor-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.cust-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cust-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.cust-branch {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  background: rgba(0, 114, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
}
.debtor-detail-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-app);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.row-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.row-val {
  font-weight: 600;
  color: var(--text-main);
  text-align: right;
}
.balance-row {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}
.balance-due {
  font-weight: 800;
  font-size: 16px;
  color: var(--danger);
}
.debtor-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.btn-pay {
  flex: 1;
  background: var(--success);
  color: white;
  font-size: 12px;
  font-weight: 600;
  min-height: 38px;
  border-radius: var(--radius-btn, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s ease;
}
.btn-pay:hover {
  opacity: 0.9;
}
.btn-wa {
  flex: 1;
  background: #25d366;
  color: white;
  font-size: 12px;
  font-weight: 600;
  min-height: 38px;
  border-radius: var(--radius-btn, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s ease;
}
.btn-wa:hover {
  opacity: 0.9;
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 4px 8px 4px;
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}
.page-info {
  font-size: 12px;
  color: var(--text-muted);
}
.page-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-page {
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-main);
  transition: all 0.2s ease;
}
.btn-page:hover:not(:disabled) {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

/* Modal Bottom Sheet */
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
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 14px;
}
.sheet-close {
  background: transparent;
  font-size: 16px;
  min-height: 36px;
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-box {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.info-row {
  display: flex;
  justify-content: space-between;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.quick-pay-presets {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.btn-preset {
  flex: 1;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-main);
  transition: all 0.2s ease;
}
.btn-preset:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.btn-submit {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}
</style>
