<template>
  <div class="tracking-page">
    <!-- Header & Filter Periode -->
    <div class="card header-card">
      <div>
        <h1 class="h-title">Tracking Permintaan &amp; Pengiriman</h1>
        <small class="text-muted">Pantau job request barang yang gantung &amp; barang keluar per sales</small>
      </div>
      <div class="period-controls">
        <div class="mode-toggle">
          <button id="mode-daily" :class="{ active: mode === 'daily' }" @click="setMode('daily')">Harian</button>
          <button id="mode-monthly" :class="{ active: mode === 'monthly' }" @click="setMode('monthly')">Bulanan</button>
        </div>
        <input v-if="mode === 'daily'" id="filter-date" v-model="selectedDate" type="date" @change="fetchData" />
        <input v-else id="filter-month" v-model="selectedMonth" type="month" @change="fetchData" />
      </div>
    </div>

    <div v-if="loading && !data" class="state-msg">Memuat data tracking...</div>

    <template v-else-if="data">
      <!-- Ringkasan -->
      <div class="stats-grid">
        <div class="stat-card warn">
          <span class="stat-label">Job Gantung (Proses)</span>
          <strong class="stat-val">{{ formatNumber(data.summary.pending_count) }}</strong>
          <small>{{ formatNumber(data.summary.pending_qty) }} pcs · {{ data.summary.pending_over_24h }} &gt; 24 jam</small>
        </div>
        <div class="stat-card blue">
          <span class="stat-label">Permintaan {{ periodLabel }}</span>
          <strong class="stat-val">{{ formatNumber(data.summary.request_count) }}</strong>
          <small>{{ formatNumber(data.summary.request_qty) }} pcs diminta</small>
        </div>
        <div class="stat-card green">
          <span class="stat-label">Barang Keluar {{ periodLabel }}</span>
          <strong class="stat-val">{{ formatNumber(data.summary.shipped_qty) }} <em>pcs</em></strong>
          <small>{{ formatNumber(data.summary.shipped_count) }} pengiriman</small>
        </div>
        <div class="stat-card purple">
          <span class="stat-label">Sales Aktif</span>
          <strong class="stat-val">{{ data.summary.active_sales }} / {{ data.summary.total_sales }}</strong>
          <small>{{ data.summary.active_sales }} sales mengajukan permintaan</small>
        </div>
        <div class="stat-card red" @click="tab = 'cancelled'">
          <span class="stat-label">Dibatalkan {{ periodLabel }}</span>
          <strong class="stat-val">{{ formatNumber(data.summary.cancelled_count) }}</strong>
          <small>{{ formatNumber(data.summary.cancelled_qty) }} pcs batal</small>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button id="tab-matrix" :class="{ active: tab === 'matrix' }" @click="tab = 'matrix'">Matriks Sales</button>
        <button id="tab-pending" :class="{ active: tab === 'pending' }" @click="tab = 'pending'">
          Job Gantung <span v-if="data.pending.length" class="tab-badge">{{ data.pending.length }}</span>
        </button>
        <button id="tab-cancelled" :class="{ active: tab === 'cancelled' }" @click="tab = 'cancelled'">
          Dibatalkan <span v-if="data.cancelled.length" class="tab-badge">{{ data.cancelled.length }}</span>
        </button>
        <button v-if="mode === 'monthly'" id="tab-daily" :class="{ active: tab === 'daily' }" @click="tab = 'daily'">Tren Harian</button>
      </div>

      <!-- Matriks Sales -->
      <div v-if="tab === 'matrix'" class="card table-card">
        <input v-model="search" class="search-input" placeholder="Cari sales / cabang..." />
        <div class="table-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th>Sales</th>
                <th class="num">Request</th>
                <th class="num">Diminta</th>
                <th class="num">Dikirim</th>
                <th class="num">Keluar (pcs)</th>
                <th class="num">Gantung</th>
                <th class="num">Batal</th>
                <th v-if="mode === 'monthly'" class="num">Hari Aktif</th>
                <th>Pemenuhan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in filteredSales" :key="s.sales_id" class="row-click" @click="selected = s">
                <td>
                  <div class="s-name">{{ s.sales_name }}</div>
                  <small class="text-muted">{{ s.branch_name || '-' }}</small>
                </td>
                <td class="num">{{ s.request_count }}</td>
                <td class="num">{{ formatNumber(s.request_qty) }}</td>
                <td class="num">{{ s.shipped_count }}</td>
                <td class="num strong">{{ formatNumber(s.shipped_qty) }}</td>
                <td class="num">
                  <span v-if="s.pending_count" class="pill pill-warn">{{ s.pending_count }} · {{ formatNumber(s.pending_qty) }}</span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td class="num">
                  <span v-if="s.cancelled_count" class="pill pill-red" :title="`${s.cancel_rate}% dari permintaan`">{{ s.cancelled_count }} · {{ s.cancel_rate }}%</span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td v-if="mode === 'monthly'" class="num">{{ s.active_days }}</td>
                <td>
                  <div class="bar"><div class="bar-fill" :style="{ width: Math.min(s.fulfillment_rate, 100) + '%' }"></div></div>
                  <small>{{ s.fulfillment_rate }}%</small>
                </td>
                <td><span class="pill" :class="activity(s).cls">{{ activity(s).label }}</span></td>
              </tr>
              <tr v-if="filteredSales.length === 0">
                <td :colspan="mode === 'monthly' ? 10 : 9" class="state-msg">Tidak ada data sales.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Job Gantung -->
      <div v-if="tab === 'pending'" class="pending-list">
        <div v-if="data.pending.length === 0" class="card state-msg">Tidak ada permintaan yang menggantung. 🎉</div>
        <div v-for="o in data.pending" :key="o.id" class="card pending-card" :class="ageClass(o.age_hours)">
          <div class="p-head">
            <strong>{{ o.order_no }}</strong>
            <span class="pill" :class="ageClass(o.age_hours)">{{ formatAge(o.age_hours) }}</span>
          </div>
          <div class="text-muted small">{{ o.sales_name }} · {{ o.request_date }} {{ o.request_time }}</div>
          <div class="p-items">
            <span v-for="it in o.items" :key="it.product_id" class="item-chip">{{ it.name }} × {{ it.qty }}</span>
          </div>
          <div class="p-foot">{{ formatNumber(o.total_qty) }} pcs · {{ o.items.length }} barang</div>
        </div>
      </div>

      <!-- Dibatalkan -->
      <div v-if="tab === 'cancelled'">
        <div v-if="data.cancel_reasons.length" class="card reason-card">
          <h4 class="sec-title first">Alasan Pembatalan</h4>
          <div v-for="r in data.cancel_reasons" :key="r.reason" class="reason-row">
            <span class="reason-text">{{ r.reason }}</span>
            <div class="bar wide"><div class="bar-fill red" :style="{ width: (r.count / data.cancelled.length * 100) + '%' }"></div></div>
            <strong>{{ r.count }}</strong>
          </div>
        </div>
        <div class="pending-list">
          <div v-if="data.cancelled.length === 0" class="card state-msg">Tidak ada permintaan yang dibatalkan di periode ini.</div>
          <div v-for="o in data.cancelled" :key="o.id" class="card pending-card cancel">
            <div class="p-head">
              <strong>{{ o.order_no }}</strong>
              <span class="pill pill-red">Batal {{ o.cancel_date }}</span>
            </div>
            <div class="text-muted small">{{ o.sales_name }} · diminta {{ o.request_date }} {{ o.request_time }}</div>
            <div class="cancel-reason">“{{ o.cancel_reason }}”</div>
            <div v-if="o.cancelled_by" class="text-muted small">Dibatalkan oleh {{ o.cancelled_by }}<span v-if="o.cancelled_by_role"> ({{ o.cancelled_by_role }})</span></div>
            <div class="p-items">
              <span v-for="it in o.items" :key="it.product_id" class="item-chip">{{ it.name }} × {{ it.qty }}</span>
            </div>
            <div class="p-foot">{{ formatNumber(o.total_qty) }} pcs · {{ o.items.length }} barang</div>
          </div>
        </div>
      </div>

      <!-- Tren Harian (Mode Bulanan) -->
      <div v-if="tab === 'daily' && mode === 'monthly'" class="card chart-card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Grafik Tren Harian (Qty Pcs) — {{ periodLabel }}</h3>
            <small class="text-muted">Perbandingan jumlah barang Diminta, Dikirim, dan Batal setiap tanggal</small>
          </div>
          <div class="legend">
            <span class="legend-item"><span class="lg req"></span> Diminta</span>
            <span class="legend-item"><span class="lg ship"></span> Dikirim</span>
            <span class="legend-item"><span class="lg cancel"></span> Batal</span>
          </div>
        </div>

        <div v-if="data.daily.length === 0" class="state-msg">Belum ada aktivitas transaksi di bulan ini.</div>
        
        <div v-else class="chart-scroll-wrap">
          <div class="chart-container">
            <div
              v-for="d in data.daily"
              :key="d.date"
              class="chart-col"
              :class="{ 'has-activity': d.request_qty > 0 || d.shipped_qty > 0 || d.cancelled_qty > 0 }"
              :title="`Tgl ${d.day} (${d.date}):\n• Diminta: ${formatNumber(d.request_qty)} pcs\n• Dikirim: ${formatNumber(d.shipped_qty)} pcs\n• Batal: ${formatNumber(d.cancelled_qty)} pcs`"
            >
              <!-- Angka Total Aktivitas Di Atas Bar jika ada -->
              <span class="col-top-qty" v-if="d.request_qty || d.shipped_qty || d.cancelled_qty">
                {{ formatNumber(Math.max(d.request_qty, d.shipped_qty, d.cancelled_qty)) }}
              </span>
              <span class="col-top-qty placeholder" v-else>&nbsp;</span>

              <!-- 3 Batang: Diminta (Biru), Dikirim (Hijau), Batal (Merah) -->
              <div class="chart-bars">
                <div
                  class="cb req"
                  :style="{ height: calcBarHeight(d.request_qty) + 'px' }"
                  :title="`Diminta: ${formatNumber(d.request_qty)} pcs`"
                ></div>
                <div
                  class="cb ship"
                  :style="{ height: calcBarHeight(d.shipped_qty) + 'px' }"
                  :title="`Dikirim: ${formatNumber(d.shipped_qty)} pcs`"
                ></div>
                <div
                  class="cb cancel"
                  :style="{ height: calcBarHeight(d.cancelled_qty) + 'px' }"
                  :title="`Batal: ${formatNumber(d.cancelled_qty)} pcs`"
                ></div>
              </div>

              <!-- Label Tanggal -->
              <div class="date-label">
                <strong>{{ d.day }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabel Ringkasan Akumulasi Harian -->
        <div class="daily-table-wrap">
          <table class="daily-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th class="num text-blue">Diminta (pcs)</th>
                <th class="num text-green">Dikirim (pcs)</th>
                <th class="num text-red">Batal (pcs)</th>
                <th class="num">Order Diminta</th>
                <th class="num">Order Batal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in activeDaysOnly" :key="d.date">
                <td><strong>{{ d.date }}</strong></td>
                <td class="num text-blue font-semibold">{{ formatNumber(d.request_qty) }}</td>
                <td class="num text-green font-semibold">{{ formatNumber(d.shipped_qty) }}</td>
                <td class="num text-red font-semibold">{{ formatNumber(d.cancelled_qty) }}</td>
                <td class="num">{{ d.request_count }} order</td>
                <td class="num">{{ d.cancelled_count ? d.cancelled_count + ' order' : '-' }}</td>
              </tr>
              <tr v-if="activeDaysOnly.length === 0">
                <td colspan="6" class="text-center text-muted" style="padding: 16px;">Belum ada aktivitas transaksi harian di bulan ini.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Detail Sales -->
    <div v-if="selected" class="sheet-overlay" @click.self="selected = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <div>
            <h3>{{ selected.sales_name }}</h3>
            <small class="text-muted">{{ selected.branch_name }} · {{ periodLabel }}</small>
          </div>
          <button class="sheet-close" @click="selected = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <div class="mini-stats">
            <div><span>Request</span><strong>{{ selected.request_count }}</strong></div>
            <div><span>Keluar</span><strong>{{ formatNumber(selected.shipped_qty) }} pcs</strong></div>
            <div><span>Gantung</span><strong>{{ selected.pending_count }}</strong></div>
            <div><span>Dibatalkan</span><strong>{{ selected.cancelled_count }} ({{ selected.cancel_rate }}%)</strong></div>
            <div><span>Qty Batal</span><strong>{{ formatNumber(selected.cancelled_qty) }} pcs</strong></div>
            <div><span>Req. Terakhir</span><strong>{{ selected.last_request || '-' }}</strong></div>
          </div>

          <h4 class="sec-title">Barang Keluar {{ periodLabel }}</h4>
          <div v-if="selected.products.length === 0" class="text-muted small">Belum ada barang keluar.</div>
          <div v-for="p in selected.products" :key="p.product_id" class="prod-row">
            <span>{{ p.name }}</span><strong>{{ formatNumber(p.qty) }} pcs</strong>
          </div>

          <h4 class="sec-title">Riwayat Permintaan</h4>
          <div v-if="selected.orders.length === 0" class="text-muted small">Tidak ada permintaan.</div>
          <div v-for="o in selected.orders" :key="o.id" class="order-row">
            <div class="p-head">
              <strong>{{ o.order_no }}</strong>
              <span class="pill" :class="statusClass(o.status)">{{ o.status }}</span>
            </div>
            <small class="text-muted">
              Diminta {{ o.request_date }} {{ o.request_time }}<span v-if="o.ship_date"> · Dikirim {{ o.ship_date }}</span><span v-if="o.cancel_date"> · Batal {{ o.cancel_date }}</span>
            </small>
            <div v-if="o.cancel_reason" class="cancel-reason">“{{ o.cancel_reason }}”<span v-if="o.cancelled_by" class="text-muted"> — {{ o.cancelled_by }}</span></div>
            <div class="p-items">
              <span v-for="it in o.items" :key="it.product_id" class="item-chip">
                {{ it.name }} × {{ it.qty }}<template v-if="o.status === 'Dikirim' && it.qty_shipped !== it.qty"> → {{ it.qty_shipped }}</template>
              </span>
            </div>
          </div>
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
import { formatNumber } from '../utils/format.js';

const appStore = useAppStore();
const wibToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().substring(0, 10);

const mode = ref('daily');
const selectedDate = ref(wibToday);
const selectedMonth = ref(wibToday.substring(0, 7));
const loading = ref(false);
const data = ref(null);
const tab = ref('matrix');
const search = ref('');
const selected = ref(null);

const periodLabel = computed(() => {
  if (mode.value === 'daily') return selectedDate.value === wibToday ? 'Hari Ini' : selectedDate.value;
  const [y, m] = selectedMonth.value.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
});

const filteredSales = computed(() => {
  const q = search.value.toLowerCase().trim();
  const list = data.value?.sales || [];
  if (!q) return list;
  return list.filter(s => (s.sales_name || '').toLowerCase().includes(q) || (s.branch_name || '').toLowerCase().includes(q));
});

const maxDaily = computed(() => {
  const list = data.value?.daily || [];
  if (list.length === 0) return 1;
  const max = Math.max(1, ...list.map(d => Math.max(d.request_qty || 0, d.shipped_qty || 0, d.cancelled_qty || 0)));
  return max;
});

function calcBarHeight(qty) {
  const val = Number(qty) || 0;
  if (val <= 0) return 0;
  // Rentang tinggi batang: 6px s.d 140px
  const maxH = 140;
  const h = Math.round((val / maxDaily.value) * maxH);
  return Math.max(6, Math.min(maxH, h));
}

const activeDaysOnly = computed(() => {
  return (data.value?.daily || []).filter(d => (d.request_qty > 0 || d.shipped_qty > 0 || d.cancelled_qty > 0));
});

function setMode(m) {
  if (mode.value === m) return;
  mode.value = m;
  if (m === 'daily' && tab.value === 'daily') tab.value = 'matrix';
  fetchData();
}

async function fetchData() {
  loading.value = true;
  try {
    const qs = mode.value === 'daily' ? `mode=daily&date=${selectedDate.value}` : `mode=monthly&month=${selectedMonth.value}`;
    const res = await apiFetch(`/api/tracking?${qs}&_t=${Date.now()}`);
    console.log('[TRACKING DATA]', res);
    data.value = {
      ...res,
      summary: { cancelled_count: 0, cancelled_qty: 0, ...(res?.summary || {}) },
      sales: res?.sales || [],
      pending: res?.pending || [],
      cancelled: res?.cancelled || [],
      cancel_reasons: res?.cancel_reasons || [],
      daily: res?.daily || []
    };
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function activity(s) {
  if (s.request_count === 0 && s.pending_count === 0) return { label: 'Pasif', cls: 'pill-muted' };
  if (mode.value === 'monthly') {
    if (s.active_days >= 15) return { label: 'Sangat Aktif', cls: 'pill-green' };
    if (s.active_days >= 5) return { label: 'Aktif', cls: 'pill-blue' };
    return { label: 'Kurang Aktif', cls: 'pill-warn' };
  }
  return s.request_count > 0 ? { label: 'Aktif', cls: 'pill-green' } : { label: 'Menunggu', cls: 'pill-warn' };
}

function ageClass(h) {
  if (h == null) return 'pill-muted';
  if (h >= 48) return 'pill-red';
  if (h >= 24) return 'pill-warn';
  return 'pill-blue';
}

function formatAge(h) {
  if (h == null) return '-';
  if (h < 1) return '< 1 jam';
  if (h < 24) return `${h} jam`;
  return `${Math.floor(h / 24)} hari ${h % 24} jam`;
}

function statusClass(st) {
  return st === 'Dikirim' ? 'pill-green' : st === 'Proses' ? 'pill-warn' : 'pill-red';
}

onMounted(fetchData);
</script>

<style scoped>
.tracking-page { padding: 16px; padding-bottom: 90px; }
.header-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.h-title { font-size: 17px; font-weight: 700; margin: 0 0 2px; }
.period-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.period-controls input { min-height: 34px; padding: 4px 10px; font-size: 13px; }
.mode-toggle { display: inline-flex; background: var(--bg, #f1f5f9); border-radius: 999px; padding: 3px; }
.mode-toggle button { border: none; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-muted); transition: all .2s; }
.mode-toggle button.active { background: var(--primary, #1d4ed8); color: #fff; box-shadow: 0 2px 8px rgba(29, 78, 216, .3); }

.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
}
.stat-card { border-radius: 12px; padding: 12px 14px; color: #fff; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 4px 14px rgba(0,0,0,.08); transition: transform .2s; }
.stat-card:hover { transform: translateY(-2px); }
.stat-card.warn { background: linear-gradient(135deg, #f59e0b, #ea580c); }
.stat-card.blue { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
.stat-card.green { background: linear-gradient(135deg, #10b981, #047857); }
.stat-card.purple { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
.stat-card.red { background: linear-gradient(135deg, #f43f5e, #be123c); cursor: pointer; }
.pending-card.cancel { border-left-color: #f43f5e; }
.cancel-reason { font-size: 12px; font-style: italic; color: #be123c; margin: 6px 0 2px; }
.reason-card { margin-bottom: 12px; }
.sec-title.first { margin-top: 0; }
.reason-row { display: grid; grid-template-columns: 1fr 120px 30px; gap: 10px; align-items: center; font-size: 13px; padding: 4px 0; }
.reason-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar.wide { width: 100%; }
.bar-fill.red { background: linear-gradient(90deg, #fb7185, #e11d48); }
.cancel-dot { background: #f43f5e; color: #fff; font-size: 9px; font-weight: 700; border-radius: 999px; min-width: 14px; height: 14px; line-height: 14px; text-align: center; padding: 0 3px; display: inline-block; }
.cancel-dot.static { margin-left: 8px; }
.stat-label { font-size: 12px; opacity: .9; }
.stat-val { font-size: 24px; font-weight: 800; }
.stat-val em { font-size: 13px; font-style: normal; font-weight: 600; opacity: .85; }
.stat-card small { font-size: 11px; opacity: .9; }

.tabs { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; }
.tabs button { border: 1px solid var(--border, #e2e8f0); background: var(--card, #fff); color: var(--text); padding: 8px 16px; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap; }
.tabs button.active { background: var(--primary, #1d4ed8); border-color: transparent; color: #fff; }
.tab-badge { background: #ef4444; color: #fff; border-radius: 999px; padding: 0 7px; font-size: 11px; margin-left: 4px; }

.search-input { width: 100%; margin-bottom: 10px; }
.table-wrap { overflow-x: auto; }
.matrix { width: 100%; border-collapse: collapse; font-size: 13px; }
.matrix th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); padding: 8px; border-bottom: 1px solid var(--border, #e2e8f0); white-space: nowrap; }
.matrix td { padding: 10px 8px; border-bottom: 1px solid var(--border, #f1f5f9); vertical-align: middle; }
.matrix .num { text-align: right; }
.matrix .strong { font-weight: 700; color: #047857; }
.row-click { cursor: pointer; transition: background .15s; }
.row-click:hover { background: rgba(59, 130, 246, .06); }
.s-name { font-weight: 600; }
.bar { width: 70px; height: 6px; border-radius: 6px; background: var(--border, #e2e8f0); overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); }

.pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.pill-green { background: #d1fae5; color: #047857; }
.pill-blue { background: #dbeafe; color: #1d4ed8; }
.pill-warn { background: #fef3c7; color: #b45309; }
.pill-red { background: #fee2e2; color: #b91c1c; }
.pill-muted { background: #f1f5f9; color: #64748b; }

.pending-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.pending-card { border-left: 4px solid #3b82f6; }
.pending-card.pill-warn { border-left-color: #f59e0b; background: var(--card, #fff); color: inherit; }
.pending-card.pill-red { border-left-color: #ef4444; background: var(--card, #fff); color: inherit; }
.pending-card.pill-blue { background: var(--card, #fff); color: inherit; }
.p-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.p-items { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 4px; }
.item-chip { font-size: 11px; background: var(--bg, #f1f5f9); padding: 3px 8px; border-radius: 6px; }
.p-foot { font-size: 12px; font-weight: 600; }
.small { font-size: 12px; }

.chart-card { padding: 18px 20px; margin-bottom: 16px; }
.chart-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
.chart-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
.legend { display: flex; gap: 16px; align-items: center; font-size: 13px; font-weight: 500; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.lg { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.lg.req, .cb.req { background: #3b82f6; }
.lg.ship, .cb.ship { background: #10b981; }
.lg.cancel, .cb.cancel { background: #ef4444; }

.chart-scroll-wrap { overflow-x: auto; padding-bottom: 12px; }
.chart-container { display: flex; align-items: flex-end; gap: 8px; min-width: 650px; height: 220px; padding: 25px 4px 6px; border-bottom: 2px solid var(--border-color); }
.chart-col { flex: 1; min-width: 20px; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; position: relative; cursor: pointer; transition: opacity .2s; }
.chart-col:hover { opacity: .85; }
.chart-col.has-activity .date-label strong { color: var(--primary); font-weight: 700; }

.col-top-qty { font-size: 10px; font-weight: 700; color: var(--text-muted); height: 14px; line-height: 14px; }
.col-top-qty.placeholder { visibility: hidden; }

.chart-bars { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
.cb { flex: 1; max-width: 10px; border-radius: 3px 3px 0 0; min-height: 0; transition: height .35s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

.date-label { font-size: 11px; color: var(--text-muted); text-align: center; }

.daily-table-wrap { margin-top: 20px; overflow-x: auto; border-top: 1px solid var(--border-color); padding-top: 14px; }
.daily-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.daily-table th { text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border-color); }
.daily-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-color); }
.daily-table .num { text-align: right; }
.text-blue { color: #2563eb; }
.text-green { color: #059669; }
.text-red { color: #dc2626; }
.font-semibold { font-weight: 600; }

.state-msg { text-align: center; padding: 24px; color: var(--text-muted); }

.sheet-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, .5); display: flex; justify-content: flex-end; z-index: 1000; }
.sheet-content { width: min(480px, 100%); height: 100%; background: var(--card, #fff); display: flex; flex-direction: column; animation: slideIn .25s ease; }
@keyframes slideIn { from { transform: translateX(100%); } to { transform: none; } }
.sheet-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; border-bottom: 1px solid var(--border, #e2e8f0); }
.sheet-head h3 { margin: 0; }
.sheet-close { border: none; background: transparent; cursor: pointer; color: var(--text); }
.sheet-body { padding: 16px; overflow-y: auto; }
.mini-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.mini-stats div { background: var(--bg, #f8fafc); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; }
.mini-stats span { font-size: 11px; color: var(--text-muted); }
.sec-title { font-size: 13px; margin: 18px 0 8px; }
.prod-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border, #e2e8f0); font-size: 13px; }
.order-row { padding: 10px 0; border-bottom: 1px solid var(--border, #f1f5f9); }
</style>
