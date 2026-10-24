<template>
  <div class="targets-page">
    <div class="header-card card">
      <div>
        <div class="h-title">Target & Komisi Sales</div>
        <small v-if="user?.branch_id" class="text-muted">Lokasi Toko: {{ userBranchLabel }}</small>
      </div>
      <div class="form-group month-pick">
        <label>Bulan Acuan</label>
        <input v-model="selectedMonth" type="month" @change="fetchTargets" />
      </div>
    </div>

    <!-- Header Filter Pencarian -->
    <div class="filter-bar">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari nama sales / username / cabang..."
        class="search-input"
      />
    </div>

    <div v-if="loading" class="state-msg">Memuat data target sales...</div>
    <div v-else-if="filteredSales.length === 0" class="card empty-state">
      <div class="empty-icon-box"><Icon name="users" size="38" /></div>
      <h3>Tidak Ada Data Sales</h3>
      <p>Tidak ada data target sales yang cocok dengan pencarian di bulan ini.</p>
    </div>
    <div v-else>
      <div class="targets-grid">
        <div
          v-for="s in paginatedSales"
          :key="s.sales_id"
          class="card target-card"
        >
          <div class="t-head">
            <div class="s-info">
              <span class="s-name">{{ s.sales_name }}</span>
              <div class="s-meta">
                <small class="s-user">@{{ s.username }}</small>
                <span v-if="s.branch_name" class="branch-pill">{{ s.branch_name }}</span>
              </div>
            </div>
            <span class="percent-badge" :class="s.percent >= 100 ? 'badge-dikirim' : 'badge-proses'">
              {{ formatNumber(s.percent) }}%
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: Math.min(s.percent, 100) + '%' }"></div>
          </div>

          <div class="t-metrics">
            <div class="metric-row">
              <span class="m-label">Realisasi Penjualan:</span>
              <strong class="m-val text-primary">Rp {{ formatNumber(s.total_sales) }}</strong>
            </div>
            <div class="metric-row">
              <span class="m-label">Target Bulanan:</span>
              <span class="m-val">Rp {{ formatNumber(s.target) }}</span>
            </div>
            <div class="metric-row">
              <span class="m-label">Penjualan Lunas:</span>
              <span class="m-val">Rp {{ formatNumber(s.paid_sales) }}</span>
            </div>
            <div class="metric-row comm-row" v-if="commissionPercent > 0">
              <span class="m-label">Estimasi Komisi ({{ commissionPercent }}%):</span>
              <strong class="m-val text-success">Rp {{ formatNumber(s.commission) }}</strong>
            </div>
          </div>

          <button
            v-if="canEditTarget"
            class="btn-edit-target"
            @click="openSetTargetModal(s)"
          >
            <Icon name="edit" size="14" /> Atur Target
          </button>
        </div>
      </div>

      <!-- Pagination Target Sales (10 data per halaman) -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((currentPage - 1) * pageSize + 1) }} - {{ formatNumber(Math.min(currentPage * pageSize, filteredSales.length)) }} dari {{ formatNumber(filteredSales.length) }} sales
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

    <!-- Modal Atur Target -->
    <div v-if="targetModalSales" class="sheet-overlay" @click.self="targetModalSales = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Target: {{ targetModalSales.sales_name }}</h3>
          <button class="sheet-close" @click="targetModalSales = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Bulan Target</label>
            <input v-model="targetModalMonth" type="month" disabled />
          </div>

          <div class="form-group">
            <label>Target Penjualan (Rupiah) *</label>
            <input
              v-model="formattedTargetAmount"
              type="text"
              inputmode="numeric"
              placeholder="Contoh: 50.000.000"
              required
            />
          </div>

          <button
            class="btn-save"
            @click="submitSetTarget"
          >
            ✓ Simpan Target
          </button>
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
import { formatNumber } from '../utils/format.js';

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);

const canEditTarget = computed(() => ['admin', 'manajer'].includes(user.value?.role));
const userBranchLabel = computed(() => {
  if (!user.value?.branch_id) return '';
  const first = salesList.value[0];
  if (first && first.branch_name) return first.branch_name;
  return user.value.branch_id;
});

const loading = ref(false);
const selectedMonth = ref(new Date().toISOString().substring(0, 7));
const salesList = ref([]);
const commissionPercent = ref(0);
const searchQuery = ref('');

// Pagination state
const currentPage = ref(1);
const pageSize = ref(10);

const filteredSales = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return salesList.value;
  return salesList.value.filter(s =>
    (s.sales_name && s.sales_name.toLowerCase().includes(q)) ||
    (s.username && s.username.toLowerCase().includes(q)) ||
    (s.branch_name && s.branch_name.toLowerCase().includes(q))
  );
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredSales.value.length / pageSize.value));
});

const paginatedSales = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSales.value.slice(start, start + pageSize.value);
});

// Modal
const targetModalSales = ref(null);
const targetModalMonth = ref('');
const targetAmountInput = ref(0);

const formattedTargetAmount = computed({
  get() {
    if (targetAmountInput.value === 0) return '0';
    return (targetAmountInput.value || '').toLocaleString('id-ID');
  },
  set(val) {
    const raw = String(val).replace(/\D/g, '');
    targetAmountInput.value = raw ? parseInt(raw, 10) : 0;
  }
});

async function fetchTargets() {
  loading.value = true;
  try {
    const res = await apiFetch(`/api/targets?month=${selectedMonth.value}`);
    salesList.value = res.data || [];
    commissionPercent.value = res.commission_percent || 0;
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openSetTargetModal(s) {
  targetModalSales.value = s;
  targetModalMonth.value = selectedMonth.value;
  targetAmountInput.value = s.target;
}

async function submitSetTarget() {
  const s = targetModalSales.value;
  const newTarget = targetAmountInput.value;
  const targetMonth = targetModalMonth.value;

  // 1. INSTAN OPTIMISTIK: Langsung perbarui nilai di layar tanpa menunggu
  const oldTarget = s.target;
  s.target = newTarget;
  s.percent = newTarget > 0 ? Math.round((s.total_sales / newTarget) * 100) : 0;
  targetModalSales.value = null;

  appStore.showToast('Target sales berhasil diperbarui! (Sinkronisasi di latar belakang...)', 'success');
  appStore.startSync();

  // 2. DI LATAR BELAKANG: Kirim ke Google Spreadsheet
  apiFetch('/api/targets', {
    method: 'POST',
    body: JSON.stringify({
      sales_id: s.sales_id,
      month: targetMonth,
      target: newTarget
    })
  }).catch(err => {
    console.error('[SYNC TARGET ERROR]', err);
    appStore.showToast('Gagal sinkron target: ' + err.message, 'error');
    // Rollback jika gagal
    s.target = oldTarget;
    s.percent = oldTarget > 0 ? Math.round((s.total_sales / oldTarget) * 100) : 0;
  }).finally(() => {
    appStore.finishSync();
  });
}

onMounted(() => {
  fetchTargets();
});
</script>

<style scoped>
.targets-page {
  padding: 16px;
  padding-bottom: 90px;
}
.header-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.h-title {
  font-size: 16px;
  font-weight: 700;
}
.month-pick {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.month-pick label {
  font-size: 10px;
  color: var(--text-muted);
}
.month-pick input {
  padding: 4px 8px;
  min-height: 32px;
  font-size: 13px;
}
.filter-bar {
  margin-bottom: 14px;
}
.search-input {
  width: 100%;
}
.targets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.target-card {
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
.target-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.t-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.s-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.s-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.s-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.s-user {
  color: var(--text-muted);
  font-size: 12px;
}
.branch-pill {
  display: inline-block;
  padding: 2px 8px;
  background: var(--bg-hover, #e2e8f0);
  color: var(--text-color, #1e293b);
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.empty-state {
  text-align: center;
  padding: 40px 16px;
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
.empty-state h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 4px;
}
.percent-badge {
  font-weight: 800;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
}
.progress-bar {
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s;
}
.t-metrics {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  background: var(--bg-app);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}
.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.m-label {
  color: var(--text-muted);
}
.m-val {
  font-weight: 600;
  color: var(--text-main);
}
.comm-row {
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  margin-top: 2px;
  font-size: 13px;
}
.btn-edit-target {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-edit-target:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 4px 8px 4px;
  margin-top: 14px;
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

/* Modal */
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
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 6px;
}
</style>
