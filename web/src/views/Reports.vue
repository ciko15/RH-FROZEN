<template>
  <div class="reports-page">
    <!-- Filter Card -->
    <div class="card filter-card">
      <div class="filter-head">
        <div class="title-with-icon">
          <Icon name="filter" size="18" />
          <span class="title">Filter Laporan</span>
        </div>
        <button class="btn-export" @click="exportCsv">
          <Icon name="reports" size="16" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      <div class="filter-inputs">
        <div class="form-group">
          <label>Periode</label>
          <select v-model="filterPeriod" @change="fetchReports">
            <option value="Harian">Harian</option>
            <option value="Mingguan">Mingguan (7 Hari)</option>
            <option value="Bulanan">Bulanan</option>
          </select>
        </div>

        <div class="form-group">
          <label>Tanggal Acuan</label>
          <input v-model="filterDate" type="date" @change="fetchReports" />
        </div>

        <div v-if="isAdmin && salesOptions.length > 0" class="form-group full-width">
          <label>Filter Sales</label>
          <select v-model="filterSalesId" @change="fetchReports">
            <option value="Semua">Semua Sales (Konsolidasi)</option>
            <option v-for="s in salesOptions" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- 4 Kartu Metrik Warna-Warni Sesuai Bagian 9.10 -->
    <div class="stats-grid">
      <div class="stat-card green">
        <span class="label">Penjualan Periode</span>
        <span class="val">Rp {{ formatNumber(summary.total_sales) }}</span>
        <span class="sub">Total Nilai Faktur</span>
      </div>

      <div class="stat-card blue">
        <span class="label">Order Masuk</span>
        <span class="val">{{ formatNumber(summary.total_orders) }} Order</span>
        <span class="sub">Periode Ini</span>
      </div>

      <div class="stat-card purple">
        <span class="label">Uang Masuk</span>
        <span class="val">Rp {{ formatNumber(summary.total_payments) }}</span>
        <span class="sub">Pembayaran & Pelunasan</span>
      </div>

      <div class="stat-card orange">
        <span class="label">Total Piutang</span>
        <span class="val">Rp {{ formatNumber(summary.total_receivables) }}</span>
        <span class="sub">Saldo Berjalan</span>
      </div>
    </div>

    <!-- Kartu Laba Kotor (Hanya Admin / Manajer) -->
    <div v-if="grossProfit" class="card profit-card">
      <div class="card-title">
        <Icon name="reports" size="18" />
        <span>Analisis Laba Kotor (Gross Profit)</span>
      </div>
      <div class="profit-grid">
        <div class="profit-row">
          <span>Total Penjualan Kotor:</span>
          <strong>Rp {{ formatNumber(grossProfit.total_sales) }}</strong>
        </div>
        <div class="profit-row">
          <span>Harga Pokok Penjualan (HPP):</span>
          <span class="text-danger">- Rp {{ formatNumber(grossProfit.total_hpp) }}</span>
        </div>
        <div class="profit-row" v-if="grossProfit.total_returns > 0">
          <span>Potongan Retur:</span>
          <span class="text-danger">- Rp {{ formatNumber(grossProfit.total_returns) }}</span>
        </div>
        <div class="profit-row total-profit">
          <span>Estimasi Laba Kotor:</span>
          <strong class="text-success profit-big">
            Rp {{ formatNumber(grossProfit.gross_profit) }} ({{ grossProfit.margin_percent }}%)
          </strong>
        </div>
      </div>
    </div>

    <!-- Kartu Komisi Sales -->
    <div v-if="commission && commission.percent > 0" class="card commission-card">
      <div class="card-title"><Icon name="briefcase" size="16" /> Estimasi Komisi Penjualan</div>
      <div class="comm-grid">
        <div class="comm-row">
          <span>Tarif Komisi Usaha:</span>
          <strong>{{ formatNumber(commission.percent) }}%</strong>
        </div>
        <div class="comm-row">
          <span>Penjualan Faktur Lunas:</span>
          <strong>Rp {{ formatNumber(commission.paid_sales) }}</strong>
        </div>
        <div class="comm-row comm-total">
          <span>Potensi Komisi:</span>
          <strong class="text-primary">Rp {{ formatNumber(commission.estimated_amount) }}</strong>
        </div>
      </div>
    </div>

    <!-- 3 Pelanggan Teratas -->
    <div class="card top-card" v-if="topCustomers.length > 0">
      <div class="card-title"><Icon name="award" size="16" /> 3 Pelanggan Terbanyak Belanja</div>
      <div class="top-list">
        <div v-for="(c, idx) in topCustomers" :key="c.name" class="top-row">
          <span class="top-rank">{{ idx + 1 }}. {{ c.name }}</span>
          <span class="top-amount font-bold">Rp {{ formatNumber(c.total) }}</span>
        </div>
      </div>
    </div>

    <!-- TABEL REKAP PENDAPATAN HARIAN / PERIODE PER SALES (ADMIN & MANAJER) -->
    <div v-if="isAdmin && salesPerformance.length > 0" class="card sales-perf-card">
      <div class="card-title-head">
        <div class="card-title">
          <Icon name="sales" size="18" />
          <span>Rekap Uang Diterima & Penjualan Per Sales ({{ filterPeriod }})</span>
        </div>
        <span class="sales-count-badge">{{ salesPerformance.length }} Sales</span>
      </div>

      <div class="sales-cards-list">
        <div
          v-for="sp in salesPerformance"
          :key="sp.sales_id"
          class="sales-row-card"
          :class="{ 'has-income': sp.cash_received > 0 }"
        >
          <div class="sr-header">
            <div class="sr-identity">
              <span class="sr-avatar">{{ sp.sales_name.charAt(0).toUpperCase() }}</span>
              <div class="sr-names">
                <strong class="sr-name">{{ sp.sales_name }}</strong>
                <small class="sr-user">@{{ sp.username }}</small>
              </div>
            </div>
            <div class="sr-faktur-pill">
              {{ sp.total_invoices }} Faktur ({{ sp.invoices_lunas }} Lunas)
            </div>
          </div>

          <div class="sr-grid">
            <div class="sr-box box-income">
              <span class="sr-box-label">Uang Fisik / Setoran Bersih</span>
              <strong class="sr-box-val text-success">Rp {{ formatNumber(sp.net_cash) }}</strong>
              <small v-if="sp.refund_amount > 0" class="sr-box-sub text-danger">
                (Diterima: Rp {{ formatNumber(sp.cash_received) }} - Retur: Rp {{ formatNumber(sp.refund_amount) }})
              </small>
              <small v-else class="sr-box-sub text-muted">
                Total uang masuk hari ini
              </small>
            </div>
            <div class="sr-box box-omset">
              <span class="sr-box-label">Total Omset Faktur</span>
              <strong class="sr-box-val">Rp {{ formatNumber(sp.total_omset) }}</strong>
            </div>
            <div class="sr-box box-bon">
              <span class="sr-box-label">Sisa Bon / Belum Bayar</span>
              <strong class="sr-box-val" :class="sp.remaining_bon > 0 ? 'text-warning' : 'text-muted'">
                Rp {{ formatNumber(sp.remaining_bon) }}
              </strong>
            </div>
          </div>
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

const isAdmin = computed(() => ['admin', 'manajer'].includes(authStore.user?.role));

const filterPeriod = ref('Harian');
const filterDate = ref(new Date().toISOString().substring(0, 10));
const filterSalesId = ref('Semua');

const summary = ref({
  total_sales: 0,
  total_orders: 0,
  total_payments: 0,
  total_receivables: 0
});
const topCustomers = ref([]);
const grossProfit = ref(null);
const commission = ref(null);
const invoiceList = ref([]);
const salesPerformance = ref([]);
const salesOptions = ref([]);

async function fetchReports() {
  try {
    let url = `/api/reports?period=${filterPeriod.value}&date=${filterDate.value}`;
    if (filterSalesId.value && filterSalesId.value !== 'Semua') {
      url += `&sales_id=${filterSalesId.value}`;
    }
    const res = await apiFetch(url);
    if (res.data) {
      summary.value = res.data.summary;
      topCustomers.value = res.data.top_customers || [];
      grossProfit.value = res.data.gross_profit;
      commission.value = res.data.commission;
      invoiceList.value = res.data.invoices || [];
      salesPerformance.value = res.data.sales_performance || [];
      salesOptions.value = res.data.sales_options || [];
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

function exportCsv() {
  if (invoiceList.value.length === 0) {
    appStore.showToast('Tidak ada data invoice untuk diekspor pada periode ini', 'warning');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'No Invoice,Tanggal,Pelanggan,Metode,Total Belanja,Bon Sebelumnya,Total Tagihan,Dibayar,Sisa\n';

  invoiceList.value.forEach(inv => {
    const row = [
      inv.invoice_no,
      inv.invoice_date,
      `"${inv.customer_name}"`,
      inv.pay_method,
      inv.subtotal,
      inv.previous_balance,
      inv.total_due,
      inv.paid_amount,
      inv.remaining
    ].join(',');
    csvContent += row + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Laporan-Penjualan-${filterDate.value}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  appStore.showToast('File CSV berhasil diunduh', 'success');
}

onMounted(() => {
  fetchReports();
});
</script>

<style scoped>
.reports-page {
  padding: 16px;
  padding-bottom: 90px;
}
.filter-card {
  margin-bottom: 14px;
}
.filter-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.title-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--primary);
}
.title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-main);
}
.btn-export {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  min-height: 32px;
  padding: 4px 12px;
  border-radius: var(--radius-btn);
  transition: all 0.15s ease;
}
.btn-export:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.filter-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 11px;
  color: var(--text-muted);
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
.stat-card .val {
  font-size: 15px;
  font-weight: 800;
}
.stat-card .sub {
  font-size: 10px;
  color: var(--text-light);
}

.stat-card.green { background: #dcfce7; border: 1px solid #bbf7d0; color: #15803d; }
.stat-card.blue { background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; }
.stat-card.purple { background: #f3e8ff; border: 1px solid #e9d5ff; color: #7e22ce; }
.stat-card.orange { background: #ffedd5; border: 1px solid #fed7aa; color: #c2410c; }

.card-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 10px;
}
.profit-card, .commission-card, .top-card {
  margin-bottom: 12px;
}
.profit-grid, .comm-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.profit-row, .comm-row {
  display: flex;
  justify-content: space-between;
}
.total-profit, .comm-total {
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  font-size: 14px;
}
.profit-big {
  font-size: 16px;
}
.top-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.top-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
}
.top-row:last-child {
  border-bottom: none;
}

/* Kartu & Tabel Rekap Sales */
.form-group.full-width {
  grid-column: 1 / -1;
}
.sales-perf-card {
  margin-top: 14px;
}
.card-title-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.card-title-head .card-title {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sales-count-badge {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
}
.sales-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sales-row-card {
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;
}
.sales-row-card.has-income {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.03);
}
.sr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sr-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sr-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--primary), #4f46e5);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sr-names {
  display: flex;
  flex-direction: column;
}
.sr-name {
  font-size: 14px;
  color: var(--text-main);
}
.sr-user {
  font-size: 11px;
  color: var(--text-muted);
}
.sr-faktur-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
}
.sr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}
.sr-box {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sr-box-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
}
.sr-box-val {
  font-size: 13px;
  font-weight: 800;
}
.sr-box-sub {
  font-size: 10px;
  margin-top: 2px;
}
.box-income {
  border-color: rgba(16, 185, 129, 0.3);
}
</style>
