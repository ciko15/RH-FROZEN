<template>
  <div class="orders-page">
    <div class="header-action">
      <div class="search-wrap">
        <Icon name="search" size="16" />
        <input v-model="searchQuery" type="text" placeholder="Cari nomor permintaan / sales..." />
      </div>
      <router-link v-if="isSales" to="/orders/new" class="btn-add">
        <Icon name="plus" size="16" />
        <span>Minta Barang</span>
      </router-link>
    </div>

    <div class="status-tabs">
      <button v-for="tab in tabs" :key="tab" class="tab-btn" :class="{ active: currentTab === tab }" @click="currentTab = tab">
        {{ tab }}
      </button>
    </div>

    <!-- REKAPAN PRODUK BELUM TERKIRIM (KHUSUS ADMIN) -->
    <div v-if="isAdmin && pendingSummary.length > 0" class="card pending-summary-card" :class="{ 'has-shortage': shortageCount > 0 }">
      <div class="summary-head" @click="showSummaryDetails = !showSummaryDetails">
        <div class="summary-title-wrap">
          <span class="summary-icon">📦</span>
          <div>
            <div class="summary-title">Rekap Orderan Belum Terkirim (Total Semua Sales)</div>
            <small class="summary-subtitle">{{ formatNumber(pendingSummary.length) }} jenis produk · {{ formatNumber(totalPendingQty) }} pcs harus disiapkan</small>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span v-if="shortageCount > 0" class="shortage-alert-badge">⚠️ {{ formatNumber(shortageCount) }} barang stok kurang</span>
          <button type="button" class="btn-toggle-summary">
            {{ showSummaryDetails ? 'Sembunyikan ▲' : 'Lihat Detail ▼' }}
          </button>
        </div>
      </div>

      <div v-if="showSummaryDetails" class="summary-body">
        <div v-for="ps in pendingSummary" :key="ps.product_id" class="summary-item" :class="{ 'shortage-item': ps.shortage > 0 }">
          <div class="sum-prod-head">
            <div class="sum-name-col">
              <strong>{{ ps.name }}</strong>
              <!-- Badge stok kurang atau cukup -->
              <span v-if="ps.shortage > 0" class="stock-badge stock-badge--low">⚠️ Stok kurang {{ formatNumber(ps.shortage) }} pcs</span>
              <span v-else class="stock-badge stock-badge--ok">✅ Stok cukup</span>
            </div>
            <div class="sum-qty-col">
              <span class="sum-prod-total">Dibutuhkan: <strong>{{ formatNumber(ps.total_qty) }} pcs</strong></span>
              <span class="sum-admin-stock" :class="ps.shortage > 0 ? 'stock-low' : 'stock-ok'">Stok admin: {{ formatNumber(ps.admin_stock) }} pcs</span>
            </div>
          </div>
          <!-- Rincian per sales -->
          <div class="sum-breakdown">
            <span v-for="(sb, i) in ps.sales_breakdown" :key="i" class="breakdown-chip">
              👤 {{ sb.sales_name }}: <strong>{{ formatNumber(sb.qty) }} pcs</strong> ({{ sb.order_no }})
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading && orders.length === 0" class="empty">Memuat permintaan...</div>
    <div v-else-if="filteredOrders.length === 0" class="empty">
      <Icon name="orders" size="38" />
      <h3>Belum Ada Permintaan</h3>
      <p>{{ isSales ? 'Tekan "Minta Barang" untuk meminta stok ke admin.' : 'Belum ada permintaan dari sales.' }}</p>
    </div>

    <div v-else class="order-list">
      <div v-for="o in filteredOrders" :key="o.id" class="card order-card" @click="selected = o">
        <div class="order-top">
          <span class="order-no"><Icon name="package" size="14" /> {{ o.order_no }}</span>
          <span class="badge" :class="badgeClass(o.status)">{{ o.status }}</span>
        </div>
        <div class="order-sales">👤 {{ o.sales_name }}</div>
        <div v-if="o.shortage_total > 0" class="shortage">⚠️ Stok admin kurang {{ formatNumber(o.shortage_total) }} pcs ({{ formatNumber(o.shortage_items) }} barang)</div>
        <div class="order-bottom">
          <span>{{ o.order_date }} {{ o.order_time }}</span>
          <strong>{{ formatNumber(o.total_qty) }} pcs · {{ formatNumber(o.items_count) }} barang</strong>
        </div>
      </div>
    </div>

    <!-- Detail -->
    <div v-if="selected" class="sheet-overlay" @click.self="selected = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <div>
            <h3>{{ selected.order_no }}</h3>
            <span class="badge" :class="badgeClass(selected.status)">{{ selected.status }}</span>
          </div>
          <button class="sheet-close" @click="selected = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <div class="info-row"><span>Sales</span><strong>{{ selected.sales_name }}</strong></div>
          <div class="info-row"><span>Tanggal</span><span>{{ selected.order_date }} {{ selected.order_time }}</span></div>
          <div v-if="selected.note" class="info-row"><span>Catatan</span><span>{{ selected.note }}</span></div>

          <h4 class="items-title">Barang Diminta</h4>
          <div v-for="it in selected.items" :key="it.id" class="item-row">
            <div>
              <div class="item-name">{{ it.product_name || it.name }}</div>
              <small v-if="it.shortage > 0" class="text-danger">⚠️ Stok admin kurang {{ formatNumber(it.shortage) }}</small>
            </div>
            <strong>{{ formatNumber(it.qty) }} pcs</strong>
          </div>
          <div class="info-row total"><span>Total</span><strong>{{ formatNumber(selected.total_qty) }} pcs</strong></div>

          <div class="action-buttons">
            <button v-if="canShip" class="btn-action btn-ship" :disabled="actionLoading" @click="handleShip">
              <Icon name="truck" size="16" />
              <span>{{ actionLoading ? 'Memproses...' : 'Kirim ke Sales' }}</span>
            </button>
            <button v-if="canCancel" class="btn-action btn-cancel" :disabled="actionLoading" @click="handleCancel">
              <Icon name="x" size="16" />
              <span>Batalkan</span>
            </button>
          </div>
          <p v-if="canShip" class="hint">Saat dikirim: stok admin berkurang, stok {{ selected.sales_name }} bertambah.</p>
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
const role = computed(() => authStore.user?.role);
const isSales = computed(() => role.value === 'sales');
const isAdmin = computed(() => ['admin', 'manajer'].includes(role.value));

const tabs = ['Semua', 'Proses', 'Dikirim', 'Dibatalkan'];
const currentTab = ref('Proses');
const searchQuery = ref('');
const orders = ref([]);
const pendingSummary = ref([]);
const showSummaryDetails = ref(true);
const loading = ref(false);
const selected = ref(null);
const actionLoading = ref(false);

const totalPendingQty = computed(() => pendingSummary.value.reduce((s, it) => s + (it.total_qty || 0), 0));
const shortageCount = computed(() => pendingSummary.value.filter(ps => ps.shortage > 0).length);


const filteredOrders = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  return orders.value
    .filter(o => currentTab.value === 'Semua' || o.status === currentTab.value)
    .filter(o => !q || (o.order_no || '').toLowerCase().includes(q) || (o.sales_name || '').toLowerCase().includes(q));
});

const canShip = computed(() => isAdmin.value && selected.value?.status === 'Proses');
const canCancel = computed(() => selected.value?.status === 'Proses' && (isAdmin.value || isSales.value));

function badgeClass(s) {
  return { Proses: 'badge-proses', Dikirim: 'badge-dikirim', Dibatalkan: 'badge-batal' }[s] || '';
}

async function load() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/orders?limit=50');
    orders.value = res.data || [];
    pendingSummary.value = res.meta?.pending_summary || [];
  } catch (e) {
    appStore.showToast(`Gagal memuat: ${e.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

async function handleShip() {
  if (!confirm(`Kirim ${selected.value.total_qty} pcs ke ${selected.value.sales_name}?`)) return;
  actionLoading.value = true;
  try {
    await apiFetch(`/api/orders/${selected.value.id}/ship`, { method: 'POST' });
    appStore.showToast('Barang dikirim. Stok sales bertambah.', 'success');
    selected.value = null;
    await load();
  } catch (e) {
    appStore.showToast(`Gagal kirim: ${e.message}`, 'error');
  } finally {
    actionLoading.value = false;
  }
}

async function handleCancel() {
  if (!confirm('Batalkan permintaan ini?')) return;
  actionLoading.value = true;
  try {
    await apiFetch(`/api/orders/${selected.value.id}/cancel`, { method: 'POST' });
    appStore.showToast('Permintaan dibatalkan', 'success');
    selected.value = null;
    await load();
  } catch (e) {
    appStore.showToast(`Gagal batal: ${e.message}`, 'error');
  } finally {
    actionLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.orders-page { display: flex; flex-direction: column; gap: 12px; padding-bottom: 90px; }
.header-action { display: flex; gap: 10px; flex-wrap: wrap; }
.search-wrap { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border, #ddd); border-radius: 10px; padding: 8px 12px; background: var(--card-bg, #fff); }
.search-wrap input { border: none; outline: none; flex: 1; background: transparent; }
.btn-add { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; background: linear-gradient(135deg, var(--primary, #2563eb), #4f46e5); color: #fff; font-weight: 600; text-decoration: none; }
.status-tabs { display: flex; gap: 6px; overflow-x: auto; }
.tab-btn { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border, #ddd); background: transparent; cursor: pointer; white-space: nowrap; }
.tab-btn.active { background: var(--primary, #2563eb); color: #fff; border-color: transparent; }

/* Pending summary card */
.pending-summary-card {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border: 1.5px solid #bfdbfe;
  padding: 14px;
}
.summary-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  gap: 10px;
}
.summary-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.summary-icon {
  font-size: 24px;
}
.summary-title {
  font-weight: 700;
  font-size: 14px;
  color: #1e3a8a;
}
.summary-subtitle {
  color: #64748b;
  font-size: 12px;
}
.btn-toggle-summary {
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.summary-body {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #bfdbfe;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color .2s;
}
.shortage-item {
  border-color: #fca5a5;
  background: #fff7f7;
}
.pending-summary-card.has-shortage {
  border-color: #fca5a5;
  background: linear-gradient(135deg, #fff7f7 0%, #fef2f2 100%);
}
.shortage-alert-badge {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.sum-prod-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 14px;
  gap: 8px;
}
.sum-name-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sum-qty-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.sum-prod-total {
  color: #2563eb;
  font-size: 13px;
}
.sum-admin-stock {
  font-size: 11px;
  font-weight: 600;
}
.stock-ok { color: #059669; }
.stock-low { color: #b91c1c; }
.stock-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
}
.stock-badge--low {
  background: #fee2e2;
  color: #b91c1c;
}
.stock-badge--ok {
  background: #dcfce7;
  color: #15803d;
}
.sum-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.breakdown-chip {
  background: #f1f5f9;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  color: #475569;
}

.empty { text-align: center; padding: 40px 16px; color: var(--text-muted, #888); }
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card { padding: 14px; cursor: pointer; transition: transform .15s; }
.order-card:hover { transform: translateY(-2px); }
.order-top, .order-bottom { display: flex; justify-content: space-between; align-items: center; }
.order-no { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.order-sales { margin: 6px 0; font-size: 14px; }
.order-bottom { font-size: 13px; color: var(--text-muted, #888); }
.shortage, .text-danger { color: var(--danger, #ef4444); font-size: 12px; }
.badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-proses { background: rgba(245, 158, 11, .15); color: #d97706; }
.badge-dikirim { background: rgba(16, 185, 129, .15); color: #059669; }
.badge-batal { background: rgba(239, 68, 68, .15); color: #dc2626; }
.sheet-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: flex-end; justify-content: center; z-index: 1000; }
.sheet-content { background: var(--card-bg, #fff); width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 18px; }
.sheet-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.sheet-header h3 { margin: 0 0 4px; }
.sheet-close { background: none; border: none; cursor: pointer; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
.info-row.total { border-top: 1px solid var(--border, #eee); margin-top: 8px; padding-top: 10px; }
.items-title { margin: 14px 0 6px; }
.item-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border, #eee); }
.item-name { font-weight: 600; }
.action-buttons { display: flex; gap: 8px; margin-top: 16px; }
.btn-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; color: #fff; }
.btn-action:disabled { opacity: .5; }
.btn-ship { background: linear-gradient(135deg, #10b981, #059669); }
.btn-cancel { background: linear-gradient(135deg, #ef4444, #dc2626); }
.hint { font-size: 12px; color: var(--text-muted, #888); margin-top: 8px; text-align: center; }
</style>
