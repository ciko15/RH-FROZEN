<template>
  <div class="orders-page">
    <div class="header-action">
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari nomor permintaan / sales..."
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''" title="Hapus pencarian">
          <Icon name="x" size="14" />
        </button>
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
        <div v-if="o.shortage_total > 0 && o.status === 'Proses'" class="shortage">⚠️ Stok admin kurang {{ formatNumber(o.shortage_total) }} pcs ({{ formatNumber(o.shortage_items) }} barang)</div>
        <div class="order-bottom">
          <span>{{ o.order_date }} {{ o.order_time }}</span>
          <div class="order-qty-info">
            <template v-if="o.status === 'Dikirim' && o.total_qty_shipped !== null && o.total_qty_shipped !== undefined">
              <span class="qty-compare-badge" :class="{ 'partial-badge': o.total_qty_shipped !== o.total_qty }">
                Minta: <strong>{{ formatNumber(o.total_qty) }}</strong> | Dikirim: <strong>{{ formatNumber(o.total_qty_shipped) }}</strong> pcs
              </span>
            </template>
            <strong v-else>{{ formatNumber(o.total_qty) }} pcs · {{ formatNumber(o.items_count) }} barang</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Order -->
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

          <h4 class="items-title">{{ selected.status === 'Dikirim' ? 'Rincian Pengiriman Barang' : 'Barang Diminta' }}</h4>
          <div v-for="it in selected.items" :key="it.id" class="item-row">
            <div class="item-info">
              <div class="item-name">{{ it.product_name || it.name }}</div>
              <small v-if="selected.status === 'Proses' && it.shortage > 0" class="text-danger">⚠️ Stok admin kurang {{ formatNumber(it.shortage) }} pcs</small>
              <div v-if="selected.status === 'Dikirim'" class="item-shipped-details">
                <span class="sub-qty text-muted">Permintaan: {{ formatNumber(it.qty) }} pcs</span>
                <span v-if="it.qty_shipped !== null && it.qty_shipped !== undefined && it.qty_shipped !== it.qty" class="sub-diff" :class="it.qty_shipped < it.qty ? 'text-warning' : 'text-success'">
                  ({{ it.qty_shipped < it.qty ? `Kurang ${formatNumber(it.qty - it.qty_shipped)}` : `Lebih ${formatNumber(it.qty_shipped - it.qty)}` }})
                </span>
              </div>
            </div>
            <div class="item-qty-col">
              <template v-if="selected.status === 'Dikirim'">
                <div class="shipped-pill" :class="{ 'pill-warning': it.qty_shipped !== it.qty }">
                  <span class="pill-label">Dikirim</span>
                  <strong>{{ formatNumber(it.qty_shipped !== null && it.qty_shipped !== undefined ? it.qty_shipped : it.qty) }} pcs</strong>
                </div>
              </template>
              <strong v-else>{{ formatNumber(it.qty) }} pcs</strong>
            </div>
          </div>

          <div class="info-row total">
            <span>Total Permintaan</span>
            <strong>{{ formatNumber(selected.total_qty) }} pcs</strong>
          </div>
          <div v-if="selected.status === 'Dikirim' && selected.total_qty_shipped !== null && selected.total_qty_shipped !== undefined" class="info-row total-shipped">
            <span>Total Dikirim</span>
            <strong :class="{ 'text-primary': selected.total_qty_shipped === selected.total_qty, 'text-warning': selected.total_qty_shipped !== selected.total_qty }">
              {{ formatNumber(selected.total_qty_shipped) }} pcs
            </strong>
          </div>

          <div class="action-buttons">
            <button v-if="canShip" class="btn-action btn-ship" :disabled="actionLoading" @click="openShipModal">
              <Icon name="truck" size="16" />
              <span>Konfirmasi Pengiriman</span>
            </button>
            <button v-if="canCancel" class="btn-action btn-cancel" :disabled="actionLoading" @click="handleCancel">
              <Icon name="x" size="16" />
              <span>Batalkan</span>
            </button>
          </div>
          <p v-if="canShip" class="hint">Klik konfirmasi untuk memeriksa & mengubah jumlah barang yang dikirim.</p>
        </div>
      </div>
    </div>

    <!-- MODAL KONFIRMASI PENGIRIMAN (ADMIN DAPAT UBAH JUMLAH KIRIM) -->
    <div v-if="showShipModal" class="sheet-overlay ship-modal-overlay" @click.self="closeShipModal">
      <div class="sheet-content ship-modal-content">
        <div class="sheet-header">
          <div>
            <h3>Konfirmasi Pengiriman Barang</h3>
            <span class="ship-modal-sub">Order {{ selected?.order_no }} · Sales: <strong>{{ selected?.sales_name }}</strong></span>
          </div>
          <button class="sheet-close" @click="closeShipModal"><Icon name="x" size="18" /></button>
        </div>

        <div class="ship-modal-body">
          <div class="ship-guide-banner">
            <Icon name="info" size="18" class="banner-icon" />
            <div>
              <strong>Sesuaikan Jumlah Kirim:</strong>
              <p>Anda dapat mengubah jumlah barang yang dikirim jika stok kurang atau ingin mengirim sebagian.</p>
            </div>
          </div>

          <div class="ship-items-list">
            <div v-for="item in shippingItems" :key="item.product_id" class="ship-item-card">
              <div class="ship-item-header">
                <div class="ship-item-name">{{ item.product_name }}</div>
                <div class="ship-item-stock-info">
                  Stok Admin: <span :class="item.admin_stock < item.qty ? 'text-danger fw-bold' : 'text-success fw-bold'">{{ formatNumber(item.admin_stock) }} pcs</span>
                </div>
              </div>

              <div class="ship-item-grid">
                <div class="ship-stat-box">
                  <span class="stat-lbl">Permintaan Sales</span>
                  <span class="stat-val req-val">{{ formatNumber(item.qty) }} pcs</span>
                </div>

                <div class="ship-input-box">
                  <label class="stat-lbl" :for="'ship-input-' + item.product_id">Jumlah Dikirim</label>
                  <div class="stepper-wrap">
                    <button type="button" class="btn-step" @click="decrementShipQty(item)" :disabled="item.qty_shipped <= 0">−</button>
                    <input
                      :id="'ship-input-' + item.product_id"
                      v-model.number="item.qty_shipped"
                      type="number"
                      min="0"
                      class="ship-qty-input"
                      @input="sanitizeShipQty(item)"
                    />
                    <button type="button" class="btn-step" @click="incrementShipQty(item)">+</button>
                  </div>
                </div>
              </div>

              <div class="ship-item-footer">
                <span v-if="item.qty_shipped === item.qty" class="ship-tag tag-equal">Sesuai Permintaan</span>
                <span v-else-if="item.qty_shipped < item.qty" class="ship-tag tag-less">
                  Dikirim sebagian (Kurang {{ formatNumber(item.qty - item.qty_shipped) }} pcs)
                </span>
                <span v-else class="ship-tag tag-more">
                  Kirim lebih (Lebih {{ formatNumber(item.qty_shipped - item.qty) }} pcs)
                </span>

                <button type="button" class="btn-quick-fill" @click="fillMaxStock(item)" title="Set sesuai stok admin">
                  Max: {{ formatNumber(item.admin_stock) }}
                </button>
              </div>
            </div>
          </div>

          <div class="ship-summary-panel">
            <div class="summary-line">
              <span>Total Permintaan:</span>
              <strong>{{ formatNumber(selected?.total_qty || 0) }} pcs</strong>
            </div>
            <div class="summary-line highlight">
              <span>Total Yang Akan Dikirim:</span>
              <strong>{{ formatNumber(totalShippingQty) }} pcs</strong>
            </div>
          </div>

          <div class="action-buttons ship-dialog-actions">
            <button type="button" class="btn-secondary" :disabled="actionLoading" @click="closeShipModal">
              Kembali
            </button>
            <button type="button" class="btn-action btn-ship confirm-btn" :disabled="actionLoading || totalShippingQty <= 0" @click="submitShipment">
              <Icon name="truck" size="16" />
              <span>{{ actionLoading ? 'Mengirim...' : 'Kirim Sekarang' }}</span>
            </button>
          </div>
          <p class="hint">Stok admin akan berkurang {{ formatNumber(totalShippingQty) }} pcs dan langsung masuk ke akun {{ selected?.sales_name }}.</p>
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

// Modal Konfirmasi Pengiriman
const showShipModal = ref(false);
const shippingItems = ref([]);

const totalPendingQty = computed(() => pendingSummary.value.reduce((s, it) => s + (it.total_qty || 0), 0));
const shortageCount = computed(() => pendingSummary.value.filter(ps => ps.shortage > 0).length);

const totalShippingQty = computed(() => {
  return shippingItems.value.reduce((sum, it) => sum + (parseInt(it.qty_shipped, 10) || 0), 0);
});

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

    // Jika sedang membuka modal detail, refresh juga data selected
    if (selected.value) {
      const refreshed = orders.value.find(o => o.id === selected.value.id);
      if (refreshed) selected.value = refreshed;
    }
  } catch (e) {
    appStore.showToast(`Gagal memuat: ${e.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

function openShipModal() {
  if (!selected.value) return;
  // Siapkan data shipping items dengan default qty_shipped = requested qty (atau stok admin jika kurang)
  shippingItems.value = (selected.value.items || []).map(it => {
    const reqQty = parseInt(it.qty, 10) || 0;
    const adminStock = it.admin_stock !== undefined ? parseInt(it.admin_stock, 10) : reqQty;
    // Default: jika stok admin kurang dari permintaan, otomatis set ke stok admin atau requested
    const defaultShipped = adminStock >= 0 ? Math.min(reqQty, adminStock) : reqQty;

    return {
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name || it.name || 'Produk',
      qty: reqQty,
      admin_stock: adminStock,
      qty_shipped: defaultShipped
    };
  });
  showShipModal.value = true;
}

function closeShipModal() {
  showShipModal.value = false;
  shippingItems.value = [];
}

function incrementShipQty(item) {
  item.qty_shipped = (parseInt(item.qty_shipped, 10) || 0) + 1;
}

function decrementShipQty(item) {
  const current = parseInt(item.qty_shipped, 10) || 0;
  if (current > 0) item.qty_shipped = current - 1;
}

function fillMaxStock(item) {
  item.qty_shipped = Math.max(0, parseInt(item.admin_stock, 10) || 0);
}

function sanitizeShipQty(item) {
  if (item.qty_shipped === '' || isNaN(item.qty_shipped)) {
    item.qty_shipped = 0;
  } else {
    item.qty_shipped = Math.max(0, Math.floor(Number(item.qty_shipped)));
  }
}

async function submitShipment() {
  if (!selected.value) return;

  const total = totalShippingQty.value;
  if (total <= 0) {
    appStore.showToast('Jumlah barang yang dikirim tidak boleh 0', 'warning');
    return;
  }

  // Cek apakah ada barang yang melebihi stok admin
  const overStock = shippingItems.value.find(it => it.qty_shipped > it.admin_stock);
  if (overStock) {
    if (!confirm(`Peringatan: Jumlah kirim ${overStock.product_name} (${overStock.qty_shipped} pcs) melebihi stok admin yang tersedia (${overStock.admin_stock} pcs). Lanjutkan?`)) {
      return;
    }
  }

  actionLoading.value = true;
  try {
    const payload = {
      items: shippingItems.value.map(it => ({
        id: it.id,
        product_id: it.product_id,
        qty: it.qty,
        qty_shipped: parseInt(it.qty_shipped, 10) || 0
      }))
    };

    await apiFetch(`/api/orders/${selected.value.id}/ship`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    appStore.showToast(`Berhasil mengirim ${total} pcs ke ${selected.value.sales_name}`, 'success');
    closeShipModal();
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
.orders-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 90px;
}
.header-action {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 42px;
  padding: 0 36px 0 36px;
  border-radius: var(--radius-card, 10px);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.clear-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.clear-btn:hover {
  color: var(--text-main);
  background: var(--bg-app);
}
.btn-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  padding: 0 16px;
  border-radius: var(--radius-card, 10px);
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  transition: all 0.15s ease;
}
.btn-add:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
.status-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.tab-btn {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.tab-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
}

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

/* Status & Comparison Badges */
.order-qty-info {
  display: flex;
  align-items: center;
}
.qty-compare-badge {
  font-size: 12px;
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 6px;
  padding: 3px 8px;
}
.qty-compare-badge.partial-badge {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.3);
}

.item-shipped-details {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-top: 2px;
}
.text-muted { color: var(--text-muted, #64748b); }
.text-warning { color: #d97706; font-weight: 600; }
.text-success { color: #059669; font-weight: 600; }
.text-primary { color: var(--primary, #2563eb); }
.fw-bold { font-weight: 700; }

.shipped-pill {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 3px 8px;
}
.shipped-pill.pill-warning {
  background: #fffbeb;
  border-color: #fde68a;
}
.pill-label {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.total-shipped {
  background: rgba(37, 99, 235, 0.05);
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 4px;
}

/* Shipment Confirmation Modal */
.ship-modal-overlay {
  z-index: 1100;
}
.ship-modal-content {
  max-width: 580px;
  padding: 20px;
}
.ship-modal-sub {
  font-size: 12px;
  color: var(--text-muted, #64748b);
  display: block;
  margin-top: 2px;
}
.ship-guide-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  color: #1e40af;
  margin-bottom: 14px;
}
.ship-guide-banner p {
  margin: 2px 0 0;
  color: #3b82f6;
}
.banner-icon {
  flex-shrink: 0;
  color: #2563eb;
  margin-top: 1px;
}

.ship-items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}
.ship-item-card {
  background: var(--bg-app, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ship-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.ship-item-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-main, #1e293b);
}
.ship-item-stock-info {
  font-size: 12px;
  color: var(--text-muted, #64748b);
  background: #fff;
  border: 1px solid var(--border-color, #e2e8f0);
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.ship-item-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 10px;
  align-items: center;
}
.ship-stat-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
}
.stat-lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  display: block;
}
.stat-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #1e293b);
}
.req-val {
  color: #2563eb;
}

.ship-input-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stepper-wrap {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1.5px solid var(--primary, #2563eb);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.1);
}
.btn-step {
  width: 38px;
  height: 38px;
  border: none;
  background: #f1f5f9;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main, #1e293b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.btn-step:hover:not(:disabled) {
  background: #e2e8f0;
}
.btn-step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ship-qty-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  border: none;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main, #1e293b);
  outline: none;
  background: transparent;
}

.ship-item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
.ship-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}
.tag-equal {
  background: #dcfce7;
  color: #15803d;
}
.tag-less {
  background: #fef3c7;
  color: #b45309;
}
.tag-more {
  background: #e0e7ff;
  color: #4338ca;
}
.btn-quick-fill {
  background: #fff;
  border: 1px dashed var(--border-color, #cbd5e1);
  color: var(--text-muted, #64748b);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-quick-fill:hover {
  border-color: var(--primary, #2563eb);
  color: var(--primary, #2563eb);
}

.ship-summary-panel {
  margin-top: 14px;
  background: #fff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-muted, #64748b);
}
.summary-line.highlight {
  font-size: 15px;
  font-weight: 700;
  color: #10b981;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color, #e2e8f0);
}

.ship-dialog-actions {
  margin-top: 16px;
}
.btn-secondary {
  flex: 0 0 100px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  padding: 12px;
}
.btn-secondary:hover {
  background: #e2e8f0;
}
.confirm-btn {
  flex: 1;
}
</style>
