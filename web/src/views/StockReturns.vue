<template>
  <div class="stock-returns-page">
    <!-- Header Halaman -->
    <div class="page-header">
      <div class="header-left">
        <h2>Kembalikan Stok</h2>
        <p class="subtitle">Pengembalian stok barang layak jual atau barang rusak dari sales ke admin</p>
      </div>
      <div class="header-actions">
        <button v-if="isSales" class="btn-primary-action" @click="openCreateModal">
          <Icon name="plus" size="16" />
          <span>Ajukan Pengembalian</span>
        </button>
      </div>
    </div>

    <!-- Quick Action Card for Sales (Mobile & Tablet) -->
    <div v-if="isSales" class="quick-create-card card" @click="openCreateModal">
      <div class="qc-content">
        <span class="qc-icon">📦</span>
        <div>
          <div class="qc-title">+ Buat Pengajuan Kembalikan Stok</div>
          <div class="qc-sub">Kembalikan stok layak jual atau laporkan barang rusak dari stok Anda</div>
        </div>
      </div>
      <span class="qc-btn">Ajukan Sekarang &raquo;</span>
    </div>

    <!-- Filter Status -->
    <div class="filter-bar">
      <button
        v-for="st in statusFilters"
        :key="st"
        class="pill-btn"
        :class="{ active: currentStatus === st }"
        @click="currentStatus = st"
      >
        {{ st }}
      </button>
    </div>

    <!-- Daftar Riwayat Pengajuan -->
    <div v-if="loading" class="empty">Memuat data pengembalian stok...</div>
    <div v-else-if="filteredReturns.length === 0" class="empty">
      <Icon name="package" size="38" />
      <h3>Belum Ada Pengajuan</h3>
      <p>Tidak ada riwayat pengembalian stok pada status ini.</p>
      <button v-if="isSales" class="btn-create-now" @click="openCreateModal">
        ➕ Buat Pengajuan Sekarang
      </button>
    </div>

    <div v-else class="ret-list">
      <div v-for="r in filteredReturns" :key="r.id" class="card ret-card" @click="selectedReturn = r">
        <div class="ret-top">
          <span class="ret-no"><strong>{{ r.return_no }}</strong></span>
          <span class="badge" :class="badgeClass(r.status)">{{ r.status }}</span>
        </div>

        <div class="ret-type-tag">
          <span v-if="r.type === 'DAMAGED_STOCK'" class="tag-damaged">⚠️ Barang Rusak / Reject</span>
          <span v-else class="tag-good">📦 Stok Layak Jual</span>
        </div>

        <div class="ret-sales">👤 Sales: <strong>{{ r.sales_name }}</strong> · Cabang: {{ r.branch_id || '-' }}</div>
        <div class="ret-reason">Alasan: "{{ r.reason || '-' }}"</div>
        <div class="ret-bottom">
          <span>{{ r.date }}</span>
          <div style="text-align: right;">
            <div><strong>{{ formatNumber(r.total_qty) }} pcs barang</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- POPUP MODAL: FORM AJUKAN PENGEMBALIAN STOK (DESKTOP & MOBILE) -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-dialog">
        <!-- Header Popup -->
        <div class="modal-header">
          <div class="modal-header-titles">
            <h3 class="modal-title">{{ editingReturn ? `Koreksi Pengajuan ${editingReturn.return_no}` : 'Ajukan Pengembalian Stok' }}</h3>
            <p class="modal-subtitle">{{ editingReturn ? 'Perbaiki jenis pengembalian, rincian barang, atau alasan' : 'Pilih jenis pengembalian dan produk dari stok sales Anda' }}</p>
          </div>
          <button class="modal-close-btn" @click="closeCreateModal" title="Tutup">
            <Icon name="x" size="20" />
          </button>
        </div>

        <!-- Body Popup -->
        <div class="modal-body">
          <!-- 1. Pilihan Jenis Pengembalian: Pilihan Enum -->
          <div class="form-section">
            <label class="form-section-title">1. Pilih Jenis Pengembalian (Enum)</label>
            <div class="enum-select-wrapper">
              <select v-model="returnType" class="form-control enum-select">
                <option :value="ReturnTypeEnum.RETURN_STOCK">📦 RETURN_STOCK — Kembalikan Stok Layak Jual ke Admin</option>
                <option :value="ReturnTypeEnum.DAMAGED_STOCK">⚠️ DAMAGED_STOCK — Barang Rusak / Reject (Buang Stok)</option>
              </select>
            </div>
            <div class="enum-desc-card" :class="returnType === ReturnTypeEnum.DAMAGED_STOCK ? 'desc-damaged' : 'desc-good'">
              <div v-if="returnType === ReturnTypeEnum.RETURN_STOCK">
                <strong>📦 Keterangan:</strong> Stok sales Anda berkurang dan <b>stok admin gudang bertambah</b> setelah disetujui admin.
              </div>
              <div v-else>
                <strong>⚠️ Keterangan:</strong> <b>Hanya memotong stok sales</b> Anda tanpa menambah stok admin (barang rusak/dimusnahkan) setelah disetujui admin.
              </div>
            </div>
          </div>

          <!-- 2. Pilih Barang Dari Stok Sales (Dengan Search Nama Produk) -->
          <div class="form-section">
            <div class="section-title-wrap">
              <label class="form-section-title">2. Pilih Produk dari Stok Anda</label>
              <span v-if="totalSelectedQty > 0" class="selected-pill">
                {{ totalSelectedProducts }} produk ({{ formatNumber(totalSelectedQty) }} pcs)
              </span>
            </div>
            <small class="form-hint">Jumlah yang dikembalikan tidak bisa melebihi stok yang Anda miliki saat ini.</small>

            <!-- Search Bar Produk -->
            <div class="product-search-bar">
              <Icon name="search" size="16" class="search-icon" />
              <input
                v-model="productSearch"
                type="text"
                placeholder="Cari nama produk di stok Anda..."
                class="search-input"
              />
              <button v-if="productSearch" class="clear-search" @click="productSearch = ''">
                <Icon name="x" size="14" />
              </button>
            </div>

            <!-- List Produk -->
            <div v-if="loadingItems" class="empty-box">Memuat daftar produk stok Anda...</div>
            <div v-else-if="salesStockItems.length === 0" class="empty-box">
              <p>Tidak ada stok yang tersedia di akun sales Anda saat ini.</p>
            </div>
            <div v-else-if="displayedStockItems.length === 0" class="empty-box">
              <p>Tidak ada produk yang cocok dengan pencarian "<strong>{{ productSearch }}</strong>"</p>
            </div>
            <div v-else class="product-selection-list">
              <div
                v-for="it in displayedStockItems"
                :key="it.product_id"
                class="product-row"
                :class="{ 'is-selected': it.return_qty > 0 }"
              >
                <div class="prod-info">
                  <span class="prod-name">{{ it.name }}</span>
                  <span class="prod-stock">
                    Stok Anda: <strong class="stock-num">{{ formatNumber(it.sales_stock) }} pcs</strong>
                  </span>
                </div>
                <div class="qty-stepper">
                  <button
                    type="button"
                    class="step-btn"
                    @click="decRetQty(it)"
                    :disabled="it.return_qty <= 0"
                  >−</button>
                  <input
                    v-model.number="it.return_qty"
                    type="number"
                    min="0"
                    :max="it.sales_stock"
                    class="step-input"
                    @input="validateQty(it)"
                    @change="validateQty(it)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="incRetQty(it)"
                    :disabled="it.return_qty >= it.sales_stock"
                  >+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Alasan Pengembalian -->
          <div class="form-section">
            <label class="form-section-title">3. Alasan Pengembalian ke Admin *</label>
            <input
              v-model="returnReason"
              type="text"
              class="form-control"
              :placeholder="returnType === 'DAMAGED_STOCK' ? 'Contoh: Kemasan bocor / basi / rusak dalam pengiriman' : 'Contoh: Kelebihan stok barang / ditarik kembali ke gudang'"
            />
          </div>
        </div>

        <!-- Footer Popup -->
        <div class="modal-footer">
          <button type="button" class="btn-cancel" @click="closeCreateModal" :disabled="submitting">
            Batal
          </button>
          <button
            type="button"
            class="btn-submit"
            :disabled="submitting || totalSelectedQty <= 0 || !returnReason.trim()"
            @click="submitReturnRequest"
          >
            <Icon name="check" size="18" />
            <span>
              {{ submitting ? (editingReturn ? 'Menyimpan Koreksi...' : 'Mengirim Pengajuan...') : (editingReturn ? `Simpan Koreksi (${totalSelectedQty} pcs)` : (returnType === 'DAMAGED_STOCK' ? `Kirim Pengajuan ${totalSelectedQty} pcs Barang Rusak` : `Kirim Pengembalian ${totalSelectedQty} pcs ke Admin`)) }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- DETAIL / APPROVAL MODAL -->
    <div v-if="selectedReturn" class="sheet-overlay" @click.self="selectedReturn = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <div>
            <h3>Pengajuan {{ selectedReturn.return_no }}</h3>
            <span class="badge" :class="badgeClass(selectedReturn.status)">{{ selectedReturn.status }}</span>
          </div>
          <button class="sheet-close" @click="selectedReturn = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="info-row">
            <span>Jenis Pengembalian</span>
            <strong>{{ selectedReturn.type === 'DAMAGED_STOCK' ? '⚠️ Barang Rusak / Reject' : '📦 Stok Layak Jual ke Admin' }}</strong>
          </div>
          <div class="info-row"><span>Sales</span><strong>{{ selectedReturn.sales_name }}</strong></div>
          <div class="info-row"><span>Cabang</span><span>{{ selectedReturn.branch_id || '-' }}</span></div>
          <div class="info-row"><span>Tanggal Pengajuan</span><span>{{ selectedReturn.date }}</span></div>
          <div class="info-row"><span>Alasan</span><span class="text-muted">{{ selectedReturn.reason }}</span></div>
          <div v-if="selectedReturn.approved_by_name" class="info-row">
            <span>Diproses Oleh</span><strong>{{ selectedReturn.approved_by_name }}</strong>
          </div>

          <h4 style="margin: 14px 0 6px;">Barang yang Dikembalikan</h4>
          <div v-for="it in selectedReturn.items" :key="it.id || it.product_id" class="info-row item-row-border">
            <span>{{ it.name }}</span>
            <strong>{{ formatNumber(it.qty) }} pcs</strong>
          </div>
          <div class="info-row total" style="margin-top: 8px;">
            <span>Total Qty</span><strong>{{ formatNumber(selectedReturn.total_qty) }} pcs</strong>
          </div>

          <!-- Aksi Sales: Koreksi / Batalkan (saat status Menunggu) -->
          <div v-if="isSales && selectedReturn.status === 'Menunggu'" class="sales-actions-bar">
            <button class="btn-sales-action btn-edit" :disabled="actionLoading" @click="openEditModal(selectedReturn)">
              <Icon name="edit" size="16" />
              <span>Koreksi Pengajuan</span>
            </button>
            <button class="btn-sales-action btn-cancel-return" :disabled="actionLoading" @click="handleCancelReturn(selectedReturn)">
              <Icon name="trash-2" size="16" />
              <span>Batalkan Pengajuan</span>
            </button>
          </div>
          <p v-if="isSales && selectedReturn.status === 'Menunggu'" class="hint">
            Selama masih berstatus <b>Menunggu</b>, Anda dapat mengubah rincian barang/alasan atau membatalkan pengajuan ini.
          </p>

          <!-- Aksi Admin: Setujui / Tolak -->
          <div v-if="isAdmin && selectedReturn.status === 'Menunggu'" class="action-buttons">
            <button class="btn-action btn-approve" :disabled="actionLoading" @click="handleAction('approve')">
              <Icon name="check" size="16" />
              <span>Setujui Pengembalian</span>
            </button>
            <button class="btn-action btn-reject" :disabled="actionLoading" @click="handleAction('reject')">
              <Icon name="x" size="16" />
              <span>Tolak Pengajuan</span>
            </button>
          </div>
          <p v-if="isAdmin && selectedReturn.status === 'Menunggu'" class="hint">
            {{ selectedReturn.type === 'DAMAGED_STOCK' ? 'Persetujuan akan memotong stok sales tanpa menambah stok admin gudang.' : 'Persetujuan akan memotong stok sales dan menambahkan kembali ke stok admin gudang.' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';
import { formatNumber } from '../utils/format.js';

const route = useRoute();
const authStore = useAuthStore();
const appStore = useAppStore();

const user = computed(() => authStore.user);
const isAdmin = computed(() => ['admin', 'manajer'].includes(user.value?.role?.toLowerCase()));
const isSales = computed(() => !isAdmin.value || user.value?.role?.toLowerCase() === 'sales');

const returns = ref([]);
const loading = ref(false);
const statusFilters = ['Semua', 'Menunggu', 'Disetujui', 'Ditolak', 'Dibatalkan'];
const currentStatus = ref('Semua');
const selectedReturn = ref(null);
const actionLoading = ref(false);

// Enum Pilihan Jenis Pengembalian
const ReturnTypeEnum = Object.freeze({
  RETURN_STOCK: 'RETURN_STOCK',
  DAMAGED_STOCK: 'DAMAGED_STOCK'
});

// State Modal Form Popup
const showCreateModal = ref(false);
const editingReturn = ref(null);
const returnType = ref(ReturnTypeEnum.RETURN_STOCK);
const salesStockItems = ref([]);
const loadingItems = ref(false);
const returnReason = ref('');
const submitting = ref(false);
const productSearch = ref('');

// Filter khusus pengembalian stok (RETURN_STOCK & DAMAGED_STOCK)
const stockReturnsList = computed(() => {
  return returns.value.filter(r => r.type === 'RETURN_STOCK' || r.type === 'DAMAGED_STOCK' || (!r.ref_id && !r.invoice_id));
});

const filteredReturns = computed(() => {
  if (currentStatus.value === 'Semua') return stockReturnsList.value;
  return stockReturnsList.value.filter(r => (r.status || 'Menunggu') === currentStatus.value);
});

// Produk stok sales yang ditampilkan (sesuai search keyword)
const displayedStockItems = computed(() => {
  const q = productSearch.value.trim().toLowerCase();
  if (!q) return salesStockItems.value;
  return salesStockItems.value.filter(it => (it.name || '').toLowerCase().includes(q));
});

const totalSelectedQty = computed(() => {
  return salesStockItems.value.reduce((s, it) => s + (parseInt(it.return_qty, 10) || 0), 0);
});

const totalSelectedProducts = computed(() => {
  return salesStockItems.value.filter(it => (parseInt(it.return_qty, 10) || 0) > 0).length;
});

function openCreateModal() {
  editingReturn.value = null;
  returnType.value = ReturnTypeEnum.RETURN_STOCK;
  returnReason.value = '';
  productSearch.value = '';
  salesStockItems.value.forEach(it => { it.return_qty = 0; });
  showCreateModal.value = true;
  loadSalesStock();
}

async function openEditModal(ret) {
  if (!ret || ret.status !== 'Menunggu') {
    return appStore.showToast('Hanya pengajuan berstatus Menunggu yang dapat dikoreksi', 'warning');
  }
  editingReturn.value = ret;
  returnType.value = ret.type || ReturnTypeEnum.RETURN_STOCK;
  returnReason.value = ret.reason || '';
  productSearch.value = '';
  selectedReturn.value = null;
  showCreateModal.value = true;

  // Muat stok sales terbaru dan isi return_qty dengan item pengajuan retur yang sedang diedit
  loadingItems.value = true;
  try {
    const res = await apiFetch('/api/products/sales-stock');
    const returnItemMap = new Map((ret.items || []).map(it => [it.product_id, parseInt(it.qty, 10) || 0]));

    const items = (res.data || [])
      .filter(p => (parseInt(p.stock, 10) || 0) > 0 || returnItemMap.has(p.product_id))
      .map(p => {
        const prevQty = returnItemMap.get(p.product_id) || 0;
        return {
          product_id: p.product_id,
          name: p.product_name,
          sales_stock: parseInt(p.stock, 10) || 0,
          return_qty: prevQty
        };
      });

    // Jika ada produk pada pengajuan yang tidak ada di list salesStock
    for (const item of ret.items || []) {
      if (!items.some(it => it.product_id === item.product_id)) {
        items.unshift({
          product_id: item.product_id,
          name: item.name || item.product_id,
          sales_stock: parseInt(item.qty, 10) || 0,
          return_qty: parseInt(item.qty, 10) || 0
        });
      }
    }
    salesStockItems.value = items;
  } catch (e) {
    appStore.showToast(`Gagal memuat stok: ${e.message}`, 'error');
  } finally {
    loadingItems.value = false;
  }
}

async function handleCancelReturn(ret) {
  if (!ret || ret.status !== 'Menunggu') {
    return appStore.showToast('Hanya pengajuan berstatus Menunggu yang dapat dibatalkan', 'warning');
  }
  if (!confirm(`Apakah Anda yakin ingin membatalkan pengajuan ${ret.return_no}?`)) return;

  actionLoading.value = true;
  try {
    await apiFetch(`/api/returns/${ret.id}/cancel`, { method: 'POST' });
    appStore.showToast(`Pengajuan ${ret.return_no} berhasil dibatalkan.`, 'success');
    selectedReturn.value = null;
    await loadReturns();
  } catch (e) {
    appStore.showToast(`Gagal membatalkan pengajuan: ${e.message}`, 'error');
  } finally {
    actionLoading.value = false;
  }
}

function closeCreateModal() {
  if (submitting.value) return;
  showCreateModal.value = false;
  editingReturn.value = null;
}

function badgeClass(st) {
  if (st === 'Disetujui') return 'badge-disetujui';
  if (st === 'Ditolak') return 'badge-ditolak';
  if (st === 'Dibatalkan') return 'badge-dibatalkan';
  return 'badge-menunggu';
}

function decRetQty(it) {
  if (it.return_qty > 0) it.return_qty--;
}

function incRetQty(it) {
  const current = parseInt(it.return_qty, 10) || 0;
  if (current < it.sales_stock) {
    it.return_qty = current + 1;
  } else {
    appStore.showToast(`Maksimal ${it.sales_stock} pcs (sesuai stok yang Anda miliki)`, 'warning');
  }
}

function validateQty(it) {
  if (it.return_qty < 0 || !it.return_qty) {
    it.return_qty = 0;
    return;
  }
  if (it.return_qty > it.sales_stock) {
    it.return_qty = it.sales_stock;
    appStore.showToast(`Tidak bisa melebihi stok yang ada (maksimal ${it.sales_stock} pcs)`, 'warning');
  }
}

async function loadSalesStock() {
  if (!isSales.value) return;
  loadingItems.value = true;
  try {
    const res = await apiFetch('/api/products/sales-stock');
    const existingMap = new Map(salesStockItems.value.map(it => [it.product_id, it.return_qty]));
    salesStockItems.value = (res.data || [])
      .filter(p => (parseInt(p.stock, 10) || 0) > 0)
      .map(p => ({
        product_id: p.product_id,
        name: p.product_name,
        sales_stock: parseInt(p.stock, 10) || 0,
        return_qty: existingMap.get(p.product_id) || 0
      }));
  } catch (e) {
    appStore.showToast(`Gagal memuat stok sales: ${e.message}`, 'error');
  } finally {
    loadingItems.value = false;
  }
}

async function loadReturns() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/returns');
    returns.value = res.data || [];
  } catch (e) {
    appStore.showToast(`Gagal memuat riwayat pengembalian: ${e.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

async function submitReturnRequest() {
  const items = salesStockItems.value
    .filter(it => it.return_qty > 0)
    .map(it => ({ product_id: it.product_id, qty: parseInt(it.return_qty, 10) }));

  if (!items.length) return appStore.showToast('Pilih minimal 1 barang untuk dikembalikan', 'warning');
  if (!returnReason.value.trim()) return appStore.showToast('Isi alasan pengembalian ke admin', 'warning');

  // Validasi akhir di client agar tidak melebihi stok
  for (const it of salesStockItems.value) {
    if (it.return_qty > it.sales_stock) {
      return appStore.showToast(`Qty ${it.name} melebihi stok yang dimiliki (${it.sales_stock} pcs)`, 'error');
    }
  }

  submitting.value = true;
  try {
    const payload = {
      return_action: returnType.value,
      reason: returnReason.value.trim(),
      items
    };

    if (editingReturn.value) {
      // Mode Koreksi (PUT)
      const res = await apiFetch(`/api/returns/${editingReturn.value.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      appStore.showToast(res.message || 'Koreksi pengajuan berhasil disimpan!', 'success');
    } else {
      // Mode Pengajuan Baru (POST)
      const res = await apiFetch('/api/returns', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      appStore.showToast(res.message || 'Pengajuan pengembalian stok berhasil dikirim! Menunggu persetujuan admin.', 'success');
    }

    showCreateModal.value = false;
    editingReturn.value = null;
    returnReason.value = '';
    productSearch.value = '';
    // Reset qty
    salesStockItems.value.forEach(it => { it.return_qty = 0; });
    await loadSalesStock();
    await loadReturns();
  } catch (e) {
    appStore.showToast(`Gagal memproses pengajuan: ${e.message}`, 'error');
  } finally {
    submitting.value = false;
  }
}

async function handleAction(action) {
  const label = action === 'approve' ? 'setujui' : 'tolak';
  if (!confirm(`Apakah Anda yakin ingin ${label} pengajuan pengembalian stok ini?`)) return;

  actionLoading.value = true;
  try {
    await apiFetch(`/api/returns/${selectedReturn.value.id}/${action}`, { method: 'POST' });
    appStore.showToast(action === 'approve' ? 'Pengembalian stok disetujui! Stok berhasil diperbarui.' : 'Pengajuan ditolak.', 'success');
    selectedReturn.value = null;
    await loadReturns();
  } catch (e) {
    appStore.showToast(`Gagal: ${e.message}`, 'error');
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  if (route.query.tab === 'create' || route.query.action === 'create') {
    openCreateModal();
  }
  loadReturns();
  loadSalesStock();
});
</script>

<style scoped>
.stock-returns-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  padding-bottom: 90px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.header-left h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-main, #1e293b);
}
.subtitle {
  font-size: 12px;
  color: var(--text-muted, #64748b);
  margin: 2px 0 0;
}
.btn-primary-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  background: var(--primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.2s ease;
}
.btn-primary-action:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
}

/* Quick Create Card */
.quick-create-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(37,99,235,0.08), rgba(245,158,11,0.08));
  border: 1px dashed var(--primary, #2563eb);
  cursor: pointer;
  border-radius: 10px;
  transition: transform 0.15s;
}
.quick-create-card:hover { transform: translateY(-2px); }
.qc-content { display: flex; align-items: center; gap: 10px; }
.qc-icon { font-size: 22px; }
.qc-title { font-weight: 700; font-size: 13px; color: var(--primary, #2563eb); }
.qc-sub { font-size: 11px; color: var(--text-muted, #64748b); }
.qc-btn { font-size: 12px; font-weight: 700; color: var(--primary, #2563eb); padding: 4px 8px; background: rgba(37,99,235,0.1); border-radius: 6px; }

.filter-bar { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.pill-btn { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border-color, #e2e8f0); background: transparent; cursor: pointer; font-size: 13px; color: var(--text-muted, #64748b); }
.pill-btn.active { background: var(--primary, #2563eb); color: #fff; border-color: transparent; font-weight: 600; }
.ret-list { display: flex; flex-direction: column; gap: 10px; }
.ret-card { padding: 14px; cursor: pointer; border: 1px solid var(--border-color, #e2e8f0); }
.ret-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.ret-top, .ret-bottom { display: flex; justify-content: space-between; align-items: center; }
.ret-type-tag { margin: 6px 0 4px; }
.tag-good { font-size: 11px; font-weight: 700; color: #059669; background: rgba(16,185,129,0.12); padding: 2px 8px; border-radius: 6px; }
.tag-damaged { font-size: 11px; font-weight: 700; color: #dc2626; background: rgba(239,68,68,0.12); padding: 2px 8px; border-radius: 6px; }
.ret-sales { font-size: 13px; margin: 4px 0; }
.ret-reason { font-size: 12px; color: var(--text-muted, #64748b); font-style: italic; }
.badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-menunggu { background: rgba(245,158,11,.15); color: #d97706; }
.badge-disetujui { background: rgba(16,185,129,.15); color: #059669; }
.badge-ditolak { background: rgba(239,68,68,.15); color: #dc2626; }
.badge-dibatalkan { background: rgba(100,116,139,.18); color: #475569; }
.empty { text-align: center; color: var(--text-muted, #888); padding: 30px; font-size: 13px; }
.btn-create-now { margin-top: 12px; padding: 8px 16px; background: var(--primary, #2563eb); color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }

/* MODAL POPUP DIALOG (DI WEBSITE MUNCUL SEBAGAI POPUP MODERN DI TENGAH) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 16px;
  animation: fadeIn 0.15s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-dialog {
  background: var(--bg-card, #ffffff);
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color, #e2e8f0);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
}
.modal-header-titles .modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main, #0f172a);
}
.modal-header-titles .modal-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted, #64748b);
}
.modal-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #64748b);
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-main, #0f172a);
}

.modal-body {
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-section-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-main, #1e293b);
}
.section-title-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.selected-pill {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--primary, #2563eb);
  background: rgba(37, 99, 235, 0.1);
  padding: 2px 8px;
  border-radius: 999px;
}
.form-hint {
  font-size: 11.5px;
  color: var(--text-muted, #64748b);
  margin-bottom: 6px;
}

/* Enum Select Styling */
.enum-select-wrapper {
  position: relative;
  width: 100%;
}
.enum-select {
  width: 100%;
  padding: 11px 14px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  border: 1.5px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #ffffff);
  color: var(--text-main, #0f172a);
  cursor: pointer;
  appearance: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.enum-select:focus {
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.enum-desc-card {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
.enum-desc-card.desc-good {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #065f46;
}
.enum-desc-card.desc-damaged {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #991b1b;
}

/* Product Search Bar */
.product-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-body, #f8fafc);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 8px;
  margin-bottom: 8px;
}
.search-icon { color: var(--text-muted, #94a3b8); }
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-main, #1e293b);
}
.clear-search {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #94a3b8);
  display: flex;
  align-items: center;
  padding: 2px;
}

/* Product Selection List */
.product-selection-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  padding: 6px 12px;
  background: var(--bg-card, #fff);
}
.product-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color, #f1f5f9);
}
.product-row:last-child { border-bottom: none; }
.product-row.is-selected { background: rgba(37, 99, 235, 0.02); }
.prod-info { display: flex; flex-direction: column; gap: 2px; }
.prod-name { font-size: 13px; font-weight: 600; color: var(--text-main, #1e293b); }
.prod-stock { font-size: 11.5px; color: var(--text-muted, #64748b); }
.stock-num { color: var(--primary, #2563eb); }

/* Stepper */
.qty-stepper { display: flex; align-items: center; gap: 4px; }
.step-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #fff);
  cursor: pointer;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main, #1e293b);
}
.step-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.step-input {
  width: 44px;
  height: 30px;
  text-align: center;
  border-radius: 6px;
  border: 1px solid var(--border-color, #cbd5e1);
  font-weight: 700;
  font-size: 13px;
  color: var(--text-main, #1e293b);
}

.empty-box {
  padding: 24px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted, #64748b);
  border: 1px dashed var(--border-color, #cbd5e1);
  border-radius: 8px;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: transparent;
  font-size: 13px;
  color: var(--text-main, #1e293b);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
}
.btn-cancel {
  padding: 9px 16px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: transparent;
  color: var(--text-main, #334155);
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.btn-cancel:hover { background: rgba(0,0,0,0.03); }
.btn-submit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  background: var(--primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

/* Detail Modal Styles */
.sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.sheet-content { background: var(--bg-card, #fff); width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto; border-radius: 16px; padding: 18px; border: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
.sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.sheet-close { background: none; border: none; cursor: pointer; font-size: 18px; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.item-row-border { border-bottom: 1px dashed var(--border-color, #eee); }
.info-row.total { border-top: 1px solid var(--border-color, #eee); margin-top: 8px; padding-top: 8px; font-size: 14px; }
.action-buttons { display: flex; gap: 8px; margin-top: 16px; }
.btn-action { flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; }
.btn-approve { background: linear-gradient(135deg, #10b981, #059669); }
.btn-reject { background: linear-gradient(135deg, #ef4444, #dc2626); }

/* Tombol Aksi Sales (Koreksi / Batalkan) */
.sales-actions-bar {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.btn-sales-action {
  flex: 1;
  padding: 11px 14px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.btn-edit {
  background: #f8fafc;
  color: var(--primary, #2563eb);
  border: 1.5px solid var(--primary, #2563eb);
}
.btn-edit:hover {
  background: rgba(37, 99, 235, 0.08);
}
.btn-cancel-return {
  background: #fff;
  color: #dc2626;
  border: 1.5px solid #ef4444;
}
.btn-cancel-return:hover {
  background: rgba(239, 68, 68, 0.08);
}
.btn-sales-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint { font-size: 11.5px; color: var(--text-muted, #64748b); margin-top: 8px; text-align: center; line-height: 1.4; }
</style>
