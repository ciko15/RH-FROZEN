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

    <div v-if="loading" class="state-msg">Memuat data target sales...</div>
    <div v-else-if="salesList.length === 0" class="card empty-state">
      <p>Tidak ada data target sales untuk lokasi/toko Anda di bulan ini.</p>
    </div>
    <div v-else class="targets-list">
      <div
        v-for="s in salesList"
        :key="s.sales_id"
        class="card target-card"
      >
        <div class="t-head">
          <div class="s-info">
            <span class="s-name">{{ s.sales_name }}</span>
            <small class="s-user">@{{ s.username }}</small>
            <span v-if="s.branch_name" class="branch-pill">{{ s.branch_name }}</span>
          </div>
          <span class="percent-badge" :class="s.percent >= 100 ? 'badge-dikirim' : 'badge-proses'">
            {{ s.percent }}%
          </span>
        </div>

        <!-- Progress Bar -->
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: s.percent + '%' }"></div>
        </div>

        <div class="t-metrics">
          <div class="metric-row">
            <span>Realisasi Penjualan:</span>
            <strong>Rp {{ formatNumber(s.total_sales) }}</strong>
          </div>
          <div class="metric-row">
            <span>Target Bulanan:</span>
            <span>Rp {{ formatNumber(s.target) }}</span>
          </div>
          <div class="metric-row">
            <span>Penjualan Lunas:</span>
            <span>Rp {{ formatNumber(s.paid_sales) }}</span>
          </div>
          <div class="metric-row comm-row" v-if="commissionPercent > 0">
            <span>Estimasi Komisi ({{ commissionPercent }}%):</span>
            <strong class="text-success">Rp {{ formatNumber(s.commission) }}</strong>
          </div>
        </div>

        <button
          v-if="canEditTarget"
          class="btn-edit-target"
          @click="openSetTargetModal(s)"
        >
          <Icon name="edit" size="13" /> Atur Target
        </button>
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
              v-model.number="targetAmountInput"
              type="number"
              min="0"
              placeholder="Contoh: 50000000"
              required
            />
          </div>

          <button
            class="btn-save"
            @click="submitSetTarget"
            :disabled="saveLoading"
          >
            {{ saveLoading ? 'Menyimpan...' : 'Simpan Target' }}
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
const saveLoading = ref(false);
const selectedMonth = ref(new Date().toISOString().substring(0, 7));
const salesList = ref([]);
const commissionPercent = ref(0);

// Modal
const targetModalSales = ref(null);
const targetModalMonth = ref('');
const targetAmountInput = ref(0);

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
  saveLoading.value = true;
  try {
    await apiFetch('/api/targets', {
      method: 'POST',
      body: JSON.stringify({
        sales_id: targetModalSales.value.sales_id,
        month: targetModalMonth.value,
        target: targetAmountInput.value
      })
    });

    appStore.showToast('Target sales berhasil diperbarui!', 'success');
    targetModalSales.value = null;
    fetchTargets();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    saveLoading.value = false;
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
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
.targets-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.target-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.t-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.s-name {
  font-weight: 700;
  font-size: 15px;
}
.s-user {
  color: var(--text-muted);
  margin-left: 6px;
}
.branch-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: var(--bg-hover, #e2e8f0);
  color: var(--text-color, #1e293b);
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
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
  gap: 4px;
  font-size: 12px;
  background: var(--bg-app);
  padding: 8px 10px;
  border-radius: 8px;
}
.metric-row {
  display: flex;
  justify-content: space-between;
}
.comm-row {
  border-top: 1px dashed var(--border-color);
  padding-top: 4px;
  margin-top: 2px;
  font-size: 13px;
}
.btn-edit-target {
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  color: #334155;
  font-size: 12px;
  min-height: 34px;
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
