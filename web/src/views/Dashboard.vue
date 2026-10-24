<template>
  <div class="dashboard-page">
    <!-- Header Ringkasan & Refresh -->
    <div class="section-title">
      <h2>{{ isAdmin ? 'Dashboard Admin - Penjualan 6 Area/Cabang' : 'Dashboard Sales RH Frozen' }}</h2>
      <button class="btn-refresh" @click="fetchDashboard" :disabled="loading" title="Refresh Data">
        <Icon :name="loading ? 'history' : 'refresh'" size="16" :class="{ 'spin-icon': loading }" />
      </button>
    </div>

    <!-- TAMPILAN KHUSUS ADMIN (Sesuai SOP Aplikasi.docx) -->
    <div v-if="isAdmin" class="admin-dashboard-flow">
      <!-- 1. KAS HARI INI -->
      <div class="card kas-card">
        <div class="kas-header">
          <div class="kas-header-title">
            <Icon name="cash" size="18" class="text-primary" />
            <span class="kas-title">Kas Hari Ini</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <router-link to="/cash" class="btn-kas-detail">
              Kelola Kas & Biaya &raquo;
            </router-link>
            <span class="branch-tag">{{ user?.branch_id || 'Konsolidasi 6 Area' }}</span>
          </div>
        </div>
        <div class="kas-grid">
          <div class="kas-item">
            <span class="k-label">Saldo Awal</span>
            <span class="k-val">Rp {{ formatNumber(summary.kas?.saldo_awal) }}</span>
          </div>
          <div class="kas-item text-success">
            <span class="k-label">+ Pemasukan</span>
            <span class="k-val">Rp {{ formatNumber(summary.kas?.pemasukan) }}</span>
          </div>
          <div class="kas-item text-danger">
            <span class="k-label">- Pengeluaran</span>
            <span class="k-val">Rp {{ formatNumber(summary.kas?.pengeluaran) }}</span>
          </div>
          <div class="kas-item highlight-saldo">
            <span class="k-label">Saldo Akhir</span>
            <span class="k-val bold">Rp {{ formatNumber(summary.kas?.saldo_akhir) }}</span>
          </div>
        </div>
      </div>

      <!-- 2. KARTU ALUR KERJA ADMIN: Order Masuk, Pengiriman, Stok Barang -->
      <div class="stats-grid">
        <router-link to="/orders" class="stat-card blue link-card">
          <div class="stat-top">
            <div class="stat-label-wrap">
              <Icon name="orders" size="16" />
              <span class="label">Order Masuk</span>
            </div>
            <span class="badge badge-proses">{{ summary.pending_orders_count || 0 }} Antri</span>
          </div>
          <span class="value">{{ formatNumber(summary.total_orders_count) }} Pesanan</span>
          <span class="subtext">Rp {{ formatNumber(summary.total_orders_amount) }} Total Nilai</span>
        </router-link>

        <router-link to="/orders" class="stat-card orange link-card">
          <div class="stat-top">
            <div class="stat-label-wrap">
              <Icon name="truck" size="16" />
              <span class="label">Pengiriman (Driver)</span>
            </div>
            <span class="badge badge-dikirim">{{ summary.shipping_orders_count || 0 }} Jalan</span>
          </div>
          <span class="value">{{ formatNumber(summary.total_shipped_qty) }} Item</span>
          <span class="subtext">4 Armada Driver</span>
        </router-link>

        <router-link to="/sales" class="stat-card green link-card">
          <div class="stat-top">
            <div class="stat-label-wrap">
              <Icon name="sales" size="16" />
              <span class="label">Penjualan Selesai</span>
            </div>
            <span class="badge badge-selesai">{{ formatNumber(summary.total_invoices_count) }} Faktur</span>
          </div>
          <span class="value">Rp {{ formatNumber(summary.total_sales_amount) }}</span>
          <span class="subtext">Tunai & Tempo</span>
        </router-link>

        <router-link to="/stock" class="stat-card purple link-card">
          <div class="stat-top">
            <div class="stat-label-wrap">
              <Icon name="stock" size="16" />
              <span class="label">Stok Barang</span>
            </div>
            <span class="badge badge-proses">Gudang & Cabang</span>
          </div>
          <span class="value">Monitoring Stok</span>
          <span class="subtext">Kelola & Stock Opname</span>
        </router-link>
      </div>
    </div>

    <!-- TAMPILAN KHUSUS SALES (Sesuai SOP Aplikasi.docx: order pelanggan -> barang dikirim -> laporan penjualan) -->
    <div v-else class="sales-dashboard-flow">
      <!-- 3 Alur Kerja Utama Sales -->
      <div class="flow-steps-grid">
        <router-link to="/orders/new" class="flow-step-card primary-step">
          <div class="step-num">1</div>
          <div class="step-content">
            <span class="step-title">Order Pelanggan</span>
            <span class="step-desc">Input pesanan toko/warung baru</span>
          </div>
          <span class="step-arrow"><Icon name="plus" size="16" /></span>
        </router-link>

        <router-link to="/orders" class="flow-step-card">
          <div class="step-num">2</div>
          <div class="step-content">
            <span class="step-title">Barang Dikirim</span>
            <span class="step-desc">Pantau status & pengiriman driver</span>
          </div>
          <span class="step-arrow"><Icon name="truck" size="16" /></span>
        </router-link>

        <router-link to="/reports" class="flow-step-card">
          <div class="step-num">3</div>
          <div class="step-content">
            <span class="step-title">Laporan Penjualan</span>
            <span class="step-desc">Omset, komisi, dan target bulanan</span>
          </div>
          <span class="step-arrow"><Icon name="reports" size="16" /></span>
        </router-link>
      </div>

      <!-- Ringkasan Kinerja Sales Hari Ini -->
      <div class="stats-grid">
        <div class="stat-card blue">
          <span class="label">Pesanan Anda Hari Ini</span>
          <span class="value">Rp {{ formatNumber(summary.total_orders_amount) }}</span>
          <span class="subtext">{{ formatNumber(summary.total_orders_count) }} Pesanan</span>
        </div>
        <div class="stat-card green">
          <span class="label">Faktur Selesai</span>
          <span class="value">Rp {{ formatNumber(summary.total_sales_amount) }}</span>
          <span class="subtext">{{ formatNumber(summary.total_invoices_count) }} Faktur</span>
        </div>
      </div>
    </div>

    <!-- Target Sales Card (Jika role = sales) -->
    <div v-if="salesTarget" class="card target-card">
      <div class="target-header">
        <div class="target-title-wrap">
          <Icon name="targets" size="18" />
          <span class="title">Target Sales Bulan Ini</span>
        </div>
        <span class="percent">{{ formatNumber(salesTarget.percent) }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: salesTarget.percent + '%' }"></div>
      </div>
      <div class="target-detail">
        <span>Tercapai: Rp {{ formatNumber(salesTarget.achieved) }}</span>
        <span>Target: Rp {{ formatNumber(salesTarget.target) }}</span>
      </div>
    </div>

    <!-- Grafik Penjualan 7 Hari Terakhir -->
    <div class="card chart-card">
      <div class="chart-header">
        <div class="chart-title-wrap">
          <div class="chart-icon-box">
            <Icon name="reports" size="18" />
          </div>
          <div>
            <span class="title">Tren Penjualan 7 Hari Terakhir</span>
            <span class="chart-subtitle">Akumulasi omset harian konsolidasi</span>
          </div>
        </div>
        <div class="chart-summary-badge">
          <span class="badge-sub">Total 7 Hari:</span>
          <span class="badge-total">Rp {{ formatNumber(chartTotalAmount) }}</span>
        </div>
      </div>

      <!-- Area Grafik Interaktif -->
      <div class="chart-container">
        <!-- Garis Panduan Horizontal (Grid Lines) -->
        <div class="chart-grid-lines">
          <div class="grid-line"><span>Max</span></div>
          <div class="grid-line"><span>50%</span></div>
          <div class="grid-line zero"><span>0</span></div>
        </div>

        <div class="bar-chart">
          <div 
            v-for="d in chartData" 
            :key="d.date" 
            class="bar-column"
            :class="{ 'is-today': d.isToday, 'has-sales': d.amount > 0 }"
          >
            <!-- Label Nilai di Atas Bar -->
            <div class="bar-tooltip">
              <span class="tooltip-val">Rp {{ formatNumber(d.amount) }}</span>
            </div>
            
            <span class="bar-val-label">{{ formatShortVal(d.amount) }}</span>
            
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: getBarHeight(d.amount) }"
              >
                <!-- Glow highlight di ujung bar -->
                <div class="bar-glow" v-if="d.amount > 0"></div>
              </div>
            </div>
            
            <span class="bar-date-label" :class="{ 'today-label': d.isToday }">
              {{ d.label }}
              <small v-if="d.isToday" class="today-tag">Hari ini</small>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Bar Cepat Buat Order Baru -->
    <div class="action-bar" v-if="canCreateOrder">
      <router-link to="/orders/new" class="btn-create">
        <Icon name="plus" size="18" />
        <span>Buat Order Baru (Pelanggan)</span>
      </router-link>
    </div>

    <!-- Info Akun & Cabang -->
    <div class="card user-info-card">
      <div class="user-greeting">
        <span class="greeting">Halo, <strong>{{ user?.full_name }}</strong></span>
        <span class="badge badge-proses">{{ user?.role?.toUpperCase() }}</span>
      </div>
      <p class="branch-info">Area Operasional: {{ user?.branch_id || '6 Area/Cabang Konsolidasi' }}</p>
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
const isAdmin = computed(() => ['admin', 'manajer'].includes(user.value?.role));

const canCreateOrder = computed(() => {
  return ['admin', 'manajer', 'sales'].includes(user.value?.role);
});

const loading = ref(false);
const summary = ref({
  total_orders_amount: 0,
  total_orders_count: 0,
  total_sales_amount: 0,
  total_invoices_count: 0,
  total_shipped_qty: 0,
  total_payments_amount: 0
});
const chartData = ref([]);
const salesTarget = ref(null);

const chartTotalAmount = computed(() => {
  return chartData.value.reduce((acc, curr) => acc + (curr.amount || 0), 0);
});

async function fetchDashboard() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/dashboard');
    if (res.data) {
      summary.value = res.data.summary;
      const todayStr = new Date().toISOString().substring(0, 10);
      chartData.value = (res.data.chart || []).map(item => ({
        ...item,
        isToday: item.date === todayStr
      }));
      salesTarget.value = res.data.sales_target;
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function formatShortVal(amount) {
  return formatNumber(amount);
}

function getBarHeight(amount) {
  const max = Math.max(...chartData.value.map(d => d.amount), 1);
  if (!amount || amount === 0) return '6px';
  const pct = Math.max(Math.round((amount / max) * 100), 12);
  return `${pct}%`;
}

onMounted(() => {
  fetchDashboard();
});
</script>

<style scoped>
.dashboard-page {
  padding: 16px;
  padding-bottom: 80px;
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-title h2 {
  font-size: 16px;
  color: var(--text-main);
}
.btn-refresh {
  background: transparent;
  font-size: 16px;
  min-height: 36px;
  padding: 4px 8px;
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
.stat-card {
  padding: 14px 12px;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-card .label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-card .value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.stat-card .subtext {
  font-size: 10px;
  color: var(--text-light);
}

.stat-card.blue {
  background: #e0f2fe;
  border: 1px solid #bae6fd;
}
.stat-card.green {
  background: #dcfce7;
  border: 1px solid #bbf7d0;
}
.stat-card.orange {
  background: #ffedd5;
  border: 1px solid #fed7aa;
}
.stat-card.purple {
  background: #f3e8ff;
  border: 1px solid #e9d5ff;
}

/* Dark mode adaptif untuk kartu statistik */
[data-theme="dark"] .stat-card.blue {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(14, 165, 233, 0.35);
}
[data-theme="dark"] .stat-card.green {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.35);
}
[data-theme="dark"] .stat-card.orange {
  background: rgba(249, 115, 22, 0.15);
  border-color: rgba(249, 115, 22, 0.35);
}
[data-theme="dark"] .stat-card.purple {
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.35);
}

.link-card {
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.link-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Kas Hari Ini Card (SOP Admin) */
.kas-card {
  padding: 16px;
  margin-bottom: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}
.kas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}
.kas-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.branch-tag {
  font-size: 11px;
  color: var(--primary);
  font-weight: 600;
  background: var(--bg-app);
  padding: 2px 8px;
  border-radius: 4px;
}
.kas-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 768px) {
  .kas-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.kas-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.kas-item .k-label {
  font-size: 11px;
  color: var(--text-muted);
}
.kas-item .k-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}
.highlight-saldo {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
.highlight-saldo .k-val {
  color: #1d4ed8;
}
[data-theme="dark"] .highlight-saldo {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.4);
}
[data-theme="dark"] .highlight-saldo .k-val {
  color: #60a5fa;
}
.btn-kas-detail {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  background: rgba(37, 99, 235, 0.08);
  padding: 4px 8px;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s;
}
.btn-kas-detail:hover {
  background: rgba(37, 99, 235, 0.16);
}
.text-success .k-val {
  color: var(--success);
}
.text-danger .k-val {
  color: var(--danger);
}

/* Flow Step Card (SOP Sales) */
.flow-steps-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
@media (min-width: 768px) {
  .flow-steps-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.flow-step-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  text-decoration: none;
  color: var(--text-main);
  transition: all 0.2s ease;
}
.flow-step-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.primary-step {
  border-left: 4px solid var(--primary);
}
.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.step-title {
  font-weight: 700;
  font-size: 14px;
}
.step-desc {
  font-size: 11px;
  color: var(--text-muted);
}
.step-arrow {
  font-size: 18px;
  color: var(--text-muted);
}

/* Target Card */
.target-card {
  padding: 14px;
  margin-bottom: 14px;
}
.target-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.percent {
  color: var(--primary);
  font-weight: 700;
}
.progress-bar {
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}
.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s;
}
.target-detail {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

/* Chart Section Modern & Premium */
.chart-card {
  padding: 18px 20px;
  margin-bottom: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chart-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  flex-shrink: 0;
}

[data-theme="dark"] .chart-icon-box {
  background: rgba(96, 165, 250, 0.18);
  color: #60a5fa;
}

.chart-title-wrap .title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  line-height: 1.2;
}

.chart-subtitle {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}

.chart-summary-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: var(--bg-app);
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.chart-summary-badge .badge-sub {
  font-size: 10px;
  color: var(--text-light);
  font-weight: 500;
}

.chart-summary-badge .badge-total {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
}

/* Container Chart dengan Gridlines */
.chart-container {
  position: relative;
  width: 100%;
  padding-top: 10px;
}

.chart-grid-lines {
  position: absolute;
  top: 24px;
  left: 0;
  right: 0;
  bottom: 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
  z-index: 1;
}

.grid-line {
  border-bottom: 1px dashed rgba(148, 163, 184, 0.25);
  display: flex;
  justify-content: flex-end;
  position: relative;
}

.grid-line span {
  font-size: 8.5px;
  color: var(--text-light);
  background: var(--bg-card);
  padding: 0 4px;
  transform: translateY(-50%);
}

.bar-chart {
  position: relative;
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  height: 140px;
  padding-bottom: 4px;
  z-index: 2;
}

.bar-column {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  height: 100%;
  justify-content: flex-end;
  padding: 0 6px;
  cursor: pointer;
}

/* Tooltip Nilai Rinci saat Hover */
.bar-tooltip {
  position: absolute;
  top: -8px;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  background: #0f172a;
  color: #f8fafc;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 10;
}

[data-theme="dark"] .bar-tooltip {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #38bdf8;
}

.bar-column:hover .bar-tooltip {
  opacity: 1;
  transform: translateY(-8px);
}

.bar-val-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  transition: color 0.15s ease;
}

.bar-column:hover .bar-val-label {
  color: var(--primary);
  font-weight: 700;
}

.bar-track {
  width: 28px;
  max-width: 100%;
  height: 85px;
  background: rgba(148, 163, 184, 0.12);
  border-radius: 8px 8px 4px 4px;
  display: flex;
  align-items: flex-end;
  padding: 2px;
  transition: all 0.2s ease;
}

[data-theme="dark"] .bar-track {
  background: rgba(255, 255, 255, 0.05);
}

.bar-column:hover .bar-track {
  background: rgba(37, 99, 235, 0.15);
  transform: scaleY(1.02);
}

/* Batang Bar Bergradasi Elegan */
.bar-fill {
  position: relative;
  width: 100%;
  background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
  border-radius: 6px 6px 3px 3px;
  min-height: 6px;
  transition: height 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
}

[data-theme="dark"] .bar-fill {
  background: linear-gradient(180deg, #38bdf8 0%, #1d4ed8 100%);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

/* Khusus Hari Ini (Highlight Utama) */
.bar-column.is-today .bar-track {
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
}

.bar-column.is-today .bar-fill {
  background: linear-gradient(180deg, #38bdf8 0%, #2563eb 100%);
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.4);
}

.bar-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 6px 6px 0 0;
  background: #ffffff;
  opacity: 0.6;
}

.bar-date-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bar-date-label.today-label {
  color: var(--primary);
  font-weight: 700;
}

.today-tag {
  font-size: 8px;
  background: var(--primary);
  color: #ffffff;
  padding: 1px 4px;
  border-radius: 4px;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.action-bar {
  margin-bottom: 14px;
}
.btn-create {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  background: var(--primary);
  color: white;
  text-decoration: none;
  font-weight: 600;
  border-radius: var(--radius-btn);
  min-height: 44px;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.2s ease;
}
.btn-create:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}

.kas-header-title,
.stat-label-wrap,
.target-title-wrap,
.chart-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Pewarnaan icon kontras & terang sesuai kategori kartu */
.stat-card.blue .stat-label-wrap {
  color: #0284c7;
}
.stat-card.orange .stat-label-wrap {
  color: #ea580c;
}
.stat-card.green .stat-label-wrap {
  color: #16a34a;
}
.stat-card.purple .stat-label-wrap {
  color: #9333ea;
}

[data-theme="dark"] .stat-card.blue .stat-label-wrap {
  color: #38bdf8;
}
[data-theme="dark"] .stat-card.orange .stat-label-wrap {
  color: #fb923c;
}
[data-theme="dark"] .stat-card.green .stat-label-wrap {
  color: #4ade80;
}
[data-theme="dark"] .stat-card.purple .stat-label-wrap {
  color: #c084fc;
}

/* Icon badge background bulat lembut agar menonjol */
.stat-label-wrap .feather-icon {
  padding: 4px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  stroke-width: 2.2px;
}

[data-theme="dark"] .stat-label-wrap .feather-icon {
  background: rgba(255, 255, 255, 0.1);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.user-info-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-greeting {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.branch-info {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
