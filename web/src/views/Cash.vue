<template>
  <div class="cash-page">
    <div class="page-title-bar">
      <div class="title-meta">
        <h2>Buku Kas & Pengeluaran</h2>
        <span class="subtext">Catat uang masuk & uang keluar operasional kas harian</span>
      </div>
      <div class="action-btn-group" v-if="canManage">
        <button class="btn-out" @click="openModal('Pengeluaran')">
          <Icon name="minus" size="14" />
          <span>+ Uang Keluar</span>
        </button>
        <button class="btn-in" @click="openModal('Pemasukan')">
          <Icon name="plus" size="14" />
          <span>+ Uang Masuk</span>
        </button>
      </div>
    </div>

    <!-- Ringkasan Kas -->
    <div class="summary-cards">
      <div class="summary-card card card-in">
        <span class="card-label">Total Uang Masuk</span>
        <span class="card-val text-success">Rp {{ formatNumber(summary.total_masuk) }}</span>
        <span class="card-sub">Penjualan, Pelunasan, & Kas Masuk</span>
      </div>
      <div class="summary-card card card-out">
        <span class="card-label">Total Uang Keluar</span>
        <span class="card-val text-danger">Rp {{ formatNumber(summary.total_keluar) }}</span>
        <span class="card-sub">Biaya Operasional & Pengeluaran</span>
      </div>
      <div class="summary-card card card-saldo">
        <span class="card-label">Saldo Kas Bersih</span>
        <span class="card-val" :class="summary.saldo >= 0 ? 'text-primary' : 'text-danger'">
          Rp {{ formatNumber(summary.saldo) }}
        </span>
        <span class="card-sub">Selisih Kas Saat Ini</span>
      </div>
    </div>

    <!-- Filter & Pencarian -->
    <div class="filter-bar card">
      <div class="filter-tabs">
        <button
          class="f-tab"
          :class="{ active: typeFilter === 'ALL' }"
          @click="typeFilter = 'ALL'"
        >
          Semua ({{ items.length }})
        </button>
        <button
          class="f-tab"
          :class="{ active: typeFilter === 'Pemasukan' }"
          @click="typeFilter = 'Pemasukan'"
        >
          Uang Masuk
        </button>
        <button
          class="f-tab"
          :class="{ active: typeFilter === 'Pengeluaran' }"
          @click="typeFilter = 'Pengeluaran'"
        >
          Uang Keluar
        </button>
      </div>
      <input
        v-model="search"
        type="text"
        placeholder="Cari transaksi / keterangan / tanggal..."
        class="search-input"
      />
    </div>

    <!-- Daftar Mutasi Kas -->
    <div v-if="loading" class="state-msg">Memuat data arus kas...</div>
    <div v-else-if="filteredItems.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="cash" size="38" /></div>
      <h3>Tidak Ada Transaksi</h3>
      <p>Belum ada catatan mutasi kas yang sesuai filter.</p>
    </div>
    <div v-else class="cash-list">
      <div
        v-for="item in paginatedItems"
        :key="item.id"
        class="card cash-card"
        :class="item.type === 'Pengeluaran' ? 'border-expense' : 'border-income'"
      >
        <div class="cash-main">
          <div class="cash-type-pill" :class="item.type === 'Pengeluaran' ? 'pill-expense' : 'pill-income'">
            {{ item.type === 'Pengeluaran' ? '↓ Uang Keluar' : '↑ Uang Masuk' }}
          </div>
          <div class="cash-desc">
            <span class="cash-title">{{ item.title }}</span>
            <span class="cash-sub">{{ item.date }} {{ item.time ? '· ' + item.time : '' }} · Metode: {{ item.method }}</span>
          </div>
        </div>
        <div class="cash-right">
          <span class="cash-amt" :class="item.type === 'Pengeluaran' ? 'text-danger' : 'text-success'">
            {{ item.type === 'Pengeluaran' ? '- ' : '+ ' }}Rp {{ formatNumber(item.amount) }}
          </span>
          <span class="cash-by">Oleh: {{ item.created_by }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination-bar">
      <span class="page-info">
        Hal {{ currentPage }} dari {{ totalPages }} (Total {{ filteredItems.length }} transaksi)
      </span>
      <div class="page-buttons">
        <button class="btn-page" :disabled="currentPage === 1" @click="currentPage--">&laquo; Sebelumnya</button>
        <button class="btn-page" :disabled="currentPage === totalPages" @click="currentPage++">Berikutnya &raquo;</button>
      </div>
    </div>

    <!-- Modal Form Catat Kas Masuk / Keluar -->
    <div v-if="showModal" class="sheet-overlay" @click.self="showModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>{{ modalType === 'Pengeluaran' ? 'Catat Uang Keluar (Biaya)' : 'Catat Uang Masuk (Kas)' }}</h3>
          <button class="sheet-close" @click="showModal = false"><Icon name="x" size="18" /></button>
        </div>

        <form @submit.prevent="submitCash">
          <div class="sheet-body">
            <div class="form-group">
              <label>Jenis Mutasi</label>
              <div class="type-toggle">
                <button
                  type="button"
                  class="toggle-btn"
                  :class="{ active: modalType === 'Pengeluaran', expense: modalType === 'Pengeluaran' }"
                  @click="modalType = 'Pengeluaran'"
                >
                  Uang Keluar
                </button>
                <button
                  type="button"
                  class="toggle-btn"
                  :class="{ active: modalType === 'Pemasukan', income: modalType === 'Pemasukan' }"
                  @click="modalType = 'Pemasukan'"
                >
                  Uang Masuk
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>Kategori *</label>
              <select v-model="form.category" required>
                <option value="">-- Pilih Kategori --</option>
                <template v-if="modalType === 'Pengeluaran'">
                  <option value="Bahan Bakar & Armada">Bahan Bakar & Operasional Armada</option>
                  <option value="Listrik & Utilitas">Listrik, Air & Internet</option>
                  <option value="Perawatan Freezer & Aset">Perawatan Freezer & Mesin Pendingin</option>
                  <option value="Uang Makan & Konsumsi">Uang Makan / Konsumsi Kantor</option>
                  <option value="Gaji & Upah Driver">Gaji / Upah / Insentif</option>
                  <option value="Sewa Tempat & Gudang">Sewa Tempat / Gudang</option>
                  <option value="Perlengkapan & Plastik">Plastik, Kardus & ATK</option>
                  <option value="Operasional Lainnya">Pengeluaran Lainnya</option>
                </template>
                <template v-else>
                  <option value="Modal Kas Awal">Setoran Modal / Kas Awal</option>
                  <option value="Pendapatan Sewa/Aset">Pendapatan Lain-lain</option>
                  <option value="Pengembalian Dana">Pengembalian / Refund Dana</option>
                  <option value="Pemasukan Lainnya">Pemasukan Lainnya</option>
                </template>
              </select>
            </div>

            <div class="form-group">
              <label>Jumlah Uang (Rp) *</label>
              <input
                v-model="formattedAmount"
                type="text"
                inputmode="numeric"
                placeholder="0"
                required
              />
            </div>

            <div class="form-row">
              <div class="form-group col-half">
                <label>Tanggal *</label>
                <input v-model="form.date" type="date" required />
              </div>
              <div class="form-group col-half">
                <label>Metode Pembayaran</label>
                <select v-model="form.method">
                  <option value="Tunai">Tunai</option>
                  <option value="Transfer">Transfer Bank</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Catatan / Keterangan Tambahan</label>
              <textarea
                v-model="form.note"
                rows="2"
                placeholder="Contoh: Isi solar truk armada plat R-1234-AA"
              ></textarea>
            </div>
          </div>

          <div class="sheet-foot">
            <button type="button" class="btn-cancel" @click="showModal = false">Batal</button>
            <button
              type="submit"
              class="btn-submit"
              :class="modalType === 'Pengeluaran' ? 'btn-submit-danger' : 'btn-submit-primary'"
              :disabled="submitting || form.amount <= 0"
            >
              {{ submitting ? 'Menyimpan...' : (modalType === 'Pengeluaran' ? 'Simpan Pengeluaran' : 'Simpan Pemasukan') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import { apiFetch } from '../api.js';
import { formatNumber } from '../utils/format.js';
import Icon from '../components/Icon.vue';

const authStore = useAuthStore();
const appStore = useAppStore();

const canManage = computed(() => ['admin', 'manajer', 'kasir'].includes(authStore.user?.role));

const loading = ref(false);
const submitting = ref(false);
const items = ref([]);
const summary = ref({ total_masuk: 0, total_keluar: 0, saldo: 0 });

const typeFilter = ref('ALL');
const search = ref('');
const currentPage = ref(1);
const pageSize = 15;

const showModal = ref(false);
const modalType = ref('Pengeluaran'); // 'Pemasukan' | 'Pengeluaran'
const form = ref({
  category: '',
  amount: 0,
  date: new Date().toISOString().substring(0, 10),
  method: 'Tunai',
  note: ''
});

const formattedAmount = computed({
  get() {
    if (!form.value.amount) return '';
    return formatNumber(form.value.amount);
  },
  set(val) {
    const raw = String(val).replace(/\D/g, '');
    form.value.amount = raw ? parseInt(raw, 10) : 0;
  }
});

async function fetchCash() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/cash');
    if (res.ok && res.data) {
      summary.value = res.data.summary || { total_masuk: 0, total_keluar: 0, saldo: 0 };
      items.value = res.data.items || [];
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

const filteredItems = computed(() => {
  return items.value.filter(it => {
    if (typeFilter.value !== 'ALL' && it.type !== typeFilter.value) {
      return false;
    }
    if (search.value) {
      const q = search.value.toLowerCase();
      const matchTitle = (it.title || '').toLowerCase().includes(q);
      const matchNote = (it.note || '').toLowerCase().includes(q);
      const matchDate = (it.date || '').includes(q);
      const matchBy = (it.created_by || '').toLowerCase().includes(q);
      return matchTitle || matchNote || matchDate || matchBy;
    }
    return true;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)));

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredItems.value.slice(start, start + pageSize);
});

function openModal(type) {
  modalType.value = type;
  form.value = {
    category: '',
    amount: 0,
    date: new Date().toISOString().substring(0, 10),
    method: 'Tunai',
    note: ''
  };
  showModal.value = true;
}

async function submitCash() {
  if (form.value.amount <= 0) {
    appStore.showToast('Jumlah nominal harus lebih dari 0', 'warning');
    return;
  }
  if (!form.value.category) {
    appStore.showToast('Silakan pilih kategori', 'warning');
    return;
  }

  submitting.value = true;
  try {
    const res = await apiFetch('/api/cash', {
      method: 'POST',
      body: JSON.stringify({
        type: modalType.value,
        category: form.value.category,
        amount: form.value.amount,
        date: form.value.date,
        method: form.value.method,
        note: form.value.note
      })
    });

    appStore.showToast(res.message || 'Catatan kas berhasil disimpan!', 'success');
    showModal.value = false;
    await fetchCash();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  fetchCash();
});
</script>

<style scoped>
.cash-page {
  padding: 16px;
  padding-bottom: 90px;
}

.page-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}

.title-meta h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}

.title-meta .subtext {
  font-size: 13px;
  color: var(--text-muted);
}

.action-btn-group {
  display: flex;
  gap: 8px;
}

.btn-in, .btn-out {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.btn-in {
  background: #16a34a;
  color: #fff;
}

.btn-out {
  background: #dc2626;
  color: #fff;
}

.btn-in:hover, .btn-out:hover {
  opacity: 0.9;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  padding: 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
}

.card-in {
  background: #f0fdf4;
  border-left: 4px solid #16a34a;
}

.card-out {
  background: #fef2f2;
  border-left: 4px solid #dc2626;
}

.card-saldo {
  background: #eff6ff;
  border-left: 4px solid #2563eb;
}

.card-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.card-val {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 4px;
}

.card-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.filter-bar {
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-tabs {
  display: flex;
  gap: 6px;
}

.f-tab {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.f-tab.active {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
}

.search-input {
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font-size: 13px;
  min-width: 250px;
}

.cash-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cash-card {
  padding: 14px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: transform 0.15s, box-shadow 0.15s;
}

.border-income {
  border-left: 4px solid #16a34a;
}

.border-expense {
  border-left: 4px solid #dc2626;
}

.cash-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cash-type-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
}

.pill-income {
  background: #dcfce7;
  color: #166534;
}

.pill-expense {
  background: #fee2e2;
  color: #991b1b;
}

.cash-desc {
  display: flex;
  flex-direction: column;
}

.cash-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.cash-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.cash-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.cash-amt {
  font-size: 16px;
  font-weight: 700;
}

.cash-by {
  font-size: 11px;
  color: var(--text-muted);
}

.text-success {
  color: #16a34a;
}

.text-danger {
  color: #dc2626;
}

.text-primary {
  color: #2563eb;
}

/* Modal styles */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.sheet-content {
  background: #fff;
  border-radius: 14px;
  width: 100%;
  max-width: 480px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.sheet-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sheet-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.sheet-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
}

.sheet-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.type-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.toggle-btn {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: #f8fafc;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active.expense {
  background: #fee2e2;
  border-color: #dc2626;
  color: #b91c1c;
}

.toggle-btn.active.income {
  background: #dcfce7;
  border-color: #16a34a;
  color: #15803d;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 14px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.col-half {
  flex: 1;
}

.sheet-foot {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #f8fafc;
}

.btn-cancel {
  padding: 9px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}

.btn-submit {
  padding: 9px 20px;
  border-radius: 8px;
  border: none;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn-submit-danger {
  background: #dc2626;
}

.btn-submit-primary {
  background: #16a34a;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  font-size: 13px;
}

.page-buttons {
  display: flex;
  gap: 8px;
}

.btn-page {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: #fff;
  cursor: pointer;
}

.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
