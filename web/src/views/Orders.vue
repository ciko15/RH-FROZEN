<template>
  <div class="orders-page">
    <!-- Header bar pencarian & tombol tambah -->
    <div class="header-action">
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari pelanggan / nomor order..."
          class="search-input"
        />
      </div>
      <router-link to="/orders/new" class="btn-add-order" v-if="canCreateOrder">
        <Icon name="plus" size="16" />
        <span>Buat Order Baru</span>
      </router-link>
    </div>

    <!-- Tab filter status -->
    <div class="status-tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab-btn"
        :class="{ active: currentTab === tab }"
        @click="currentTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Antrean Offline (jika ada) -->
    <div v-if="offlineQueue.length > 0" class="offline-section">
      <div class="offline-header">
        <span>Menunggu Sinkronisasi ({{ offlineQueue.length }})</span>
        <button class="btn-sync" @click="syncOfflineOrders" :disabled="syncing">
          {{ syncing ? 'Mengirim...' : 'Kirim Sekarang' }}
        </button>
      </div>
      <div
        v-for="item in offlineQueue"
        :key="item.client_key"
        class="card order-card offline-card"
      >
        <div class="order-top">
          <span class="order-no"># {{ item.client_key.substring(0, 8) }}</span>
          <span class="badge" :class="item.status === 'Gagal' ? 'badge-gagal' : 'badge-menunggu'">
            {{ item.status }}
          </span>
        </div>
        <div class="order-cust">{{ item.customer_name || 'Pelanggan' }}</div>
        <div class="order-bottom">
          <span class="order-date">{{ item.created_at.substring(0, 10) }}</span>
          <span class="order-items-count">{{ item.items?.length }} Barang</span>
        </div>
        <p v-if="item.fail_reason" class="fail-reason">Alasan: {{ item.fail_reason }}</p>
      </div>
    </div>

    <!-- Daftar Order Online -->
    <div v-if="loading && orders.length === 0" class="loading-state">
      <p>Memuat daftar order...</p>
    </div>

    <div v-else-if="orders.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="orders" size="38" /></div>
      <h3>Belum Ada Order</h3>
      <p>Tidak ada order pada status ini.</p>
    </div>

    <div v-else class="order-list">
      <div
        v-for="order in orders"
        :key="order.id"
        class="card order-card"
        @click="openDetail(order)"
      >
        <div class="order-top">
          <span class="order-no"><Icon name="package" size="14" /> {{ order.order_no }}</span>
          <span class="badge" :class="getStatusBadgeClass(order.status)">
            {{ order.status }}
          </span>
        </div>
        <div class="order-cust">{{ order.customer_name }}</div>
        <div class="order-bottom">
          <span class="order-date">{{ order.order_date }} {{ order.order_time }}</span>
          <span class="order-total">Rp {{ formatNumber(order.total_amount) }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Sheet Detail Order -->
    <div v-if="selectedOrder" class="sheet-overlay" @click.self="selectedOrder = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <div class="sheet-title">
            <h3>{{ selectedOrder.order_no }}</h3>
            <span class="badge" :class="getStatusBadgeClass(selectedOrder.status)">
              {{ selectedOrder.status }}
            </span>
          </div>
          <button class="sheet-close" @click="selectedOrder = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="info-row">
            <span>Pelanggan:</span>
            <strong>{{ selectedOrder.customer?.name || selectedOrder.customer_name }}</strong>
          </div>
          <div class="info-row">
            <span>No. WhatsApp:</span>
            <span class="phone-link">
              <strong>{{ selectedOrder.customer_phone || selectedOrder.customer?.phone || '-' }}</strong>
              <button
                v-if="canEditOrder"
                class="btn-edit-phone-inline"
                @click="openEditOrderModal"
                title="Edit Nomor HP"
              >
                <Icon name="edit" size="13" /> Ubah
              </button>
              <a
                v-if="selectedOrder.customer_phone || selectedOrder.customer?.phone"
                :href="'https://wa.me/' + (selectedOrder.customer_phone || selectedOrder.customer?.phone || '').replace(/\D/g, '').replace(/^0/, '62')"
                target="_blank"
                class="wa-tag"
              >
                <Icon name="message-circle" size="13" /> Hubungi
              </a>
            </span>
          </div>
          <div class="info-row">
            <span>Tanggal:</span>
            <span>{{ selectedOrder.order_date }} {{ selectedOrder.order_time }}</span>
          </div>
          <div class="info-row" v-if="selectedOrder.sales_name">
            <span>Sales:</span>
            <span>{{ selectedOrder.sales_name }}</span>
          </div>
          <div class="info-row" v-if="selectedOrder.note">
            <span>Catatan:</span>
            <span class="text-muted">{{ selectedOrder.note }}</span>
          </div>

          <!-- Tabel Barang -->
          <h4 class="items-title">Daftar Barang</h4>
          <div class="items-table">
            <div
              v-for="it in selectedOrder.items"
              :key="it.id"
              class="item-row"
            >
              <div class="item-info">
                <span class="item-name">{{ it.emoji }} {{ it.name }}</span>
                <span class="item-calc">{{ it.qty }} x Rp {{ formatNumber(it.price) }}</span>
                <small v-if="it.discount > 0" class="item-disc">Diskon: Rp {{ formatNumber(it.discount) }}</small>
              </div>
              <span class="item-total">Rp {{ formatNumber(it.line_total) }}</span>
            </div>
          </div>

          <div class="order-summary-row">
            <span>Total Belanja:</span>
            <span class="total-big">Rp {{ formatNumber(selectedOrder.total_amount) }}</span>
          </div>

          <!-- Aksi Sesuai Role & Status -->
          <div class="action-buttons">
            <button
              v-if="canEditOrder"
              class="btn-action btn-edit-order"
              @click="openEditOrderModal"
            >
              <Icon name="edit" size="16" />
              <span>Edit Order & No HP</span>
            </button>

            <button
              v-if="canShipOrder"
              class="btn-action btn-ship"
              @click="handleShip"
              :disabled="actionLoading"
            >
              <Icon name="truck" size="16" />
              <span>Tandai Dikirim</span>
            </button>

            <button
              v-if="canCancelOrder"
              class="btn-action btn-cancel"
              @click="handleCancel"
              :disabled="actionLoading"
            >
              <Icon name="x" size="16" />
              <span>Batalkan Order</span>
            </button>

            <!-- Tombol Cetak Nota Pesanan (Bisa Dicetak Walau Belum Bayar) -->
            <button
              v-if="selectedOrder.status !== 'Dibatalkan'"
              class="btn-action btn-print-order"
              @click="openOrderInvoicePreview"
            >
              <Icon name="printer" size="16" />
              <span>{{ selectedOrder.invoice_id || selectedOrder.status === 'Selesai' ? 'Lihat / Cetak Struk Invoice' : 'Cetak / Kirim Nota (Belum Bayar)' }}</span>
            </button>

            <button
              v-if="canPayOrder"
              class="btn-action btn-pay"
              @click="goToPayment"
            >
              <Icon name="cash" size="16" />
              <span>Proses Pembayaran</span>
            </button>
          </div>
        </div>

        <!-- Action bar bawah untuk menutup detail pesanan -->
        <div class="sheet-footer">
          <button class="btn-secondary" style="flex:1;" @click="selectedOrder = null">
            <Icon name="x" size="16" /> Tutup Rincian
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Form Edit Order (Admin & Manajer) -->
    <div v-if="showEditModal" class="sheet-overlay" @click.self="showEditModal = false">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Edit Order {{ selectedOrder?.order_no }}</h3>
          <button class="sheet-close" @click="showEditModal = false"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan</label>
            <input v-model="editForm.customer_name" type="text" placeholder="Nama Pelanggan" />
          </div>
          <div class="form-group">
            <label>Nomor HP / WhatsApp Tujuan *</label>
            <input v-model="editForm.customer_phone" type="tel" placeholder="Contoh: 081234567890" />
            <small class="hint">Nomor ini yang akan dihubungi saat kirim struk / WA</small>
          </div>
          <div class="form-group">
            <label>Catatan Order</label>
            <textarea v-model="editForm.note" rows="2" placeholder="Catatan pesanan / alamat pengiriman..."></textarea>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showEditModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button class="btn-primary" @click="submitEditOrder" :disabled="editLoading">
            <Icon name="check" size="16" /> {{ editLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Lihat Invoice Penuh (dari menu Pesanan) -->
    <div v-if="orderInvoiceModal" class="sheet-overlay" @click.self="orderInvoiceModal = null">
      <div class="sheet-content sheet-inv">
        <div class="sheet-header">
          <h3>Invoice {{ orderInvoiceModal.invoice_no }}</h3>
          <button class="sheet-close" @click="orderInvoiceModal = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <InvoiceView :invoice="orderInvoiceModal" />
        </div>
        <div class="sheet-footer">
          <button class="btn-secondary" style="flex:1;" @click="orderInvoiceModal = null">
            <Icon name="x" size="16" /> Tutup Invoice
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import { useOfflineStore } from '../stores/offline.js';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const offlineStore = useOfflineStore();
const orderInvoiceModal = ref(null);

const user = computed(() => authStore.user);
const canCreateOrder = computed(() => ['admin', 'manajer', 'sales'].includes(user.value?.role));

const tabs = ['Semua', 'Proses', 'Dikirim', 'Selesai'];
const currentTab = ref('Semua');
const searchQuery = ref('');
const loading = ref(false);
const actionLoading = ref(false);
const orders = ref([]);
const selectedOrder = ref(null);

const offlineQueue = computed(() => offlineStore.queue);
const syncing = computed(() => offlineStore.syncing);

// Role action checkers
const canShipOrder = computed(() => {
  return ['admin', 'manajer'].includes(user.value?.role) && selectedOrder.value?.status === 'Proses';
});
const canCancelOrder = computed(() => {
  return ['admin', 'manajer'].includes(user.value?.role) && 
    (selectedOrder.value?.status === 'Proses' || selectedOrder.value?.status === 'Dikirim') &&
    !selectedOrder.value?.invoice_id;
});
const canPayOrder = computed(() => {
  return ['admin', 'manajer', 'kasir', 'sales'].includes(user.value?.role) && 
    (selectedOrder.value?.status === 'Proses' || selectedOrder.value?.status === 'Dikirim');
});
const canEditOrder = computed(() => {
  return ['admin', 'manajer', 'sales'].includes(user.value?.role) && selectedOrder.value?.status !== 'Dibatalkan';
});

// Edit Order Modal States
const showEditModal = ref(false);
const editLoading = ref(false);
const editForm = ref({
  customer_name: '',
  customer_phone: '',
  note: ''
});

function openEditOrderModal() {
  if (!selectedOrder.value) return;
  editForm.value = {
    customer_name: selectedOrder.value.customer?.name || selectedOrder.value.customer_name || '',
    customer_phone: selectedOrder.value.customer_phone || selectedOrder.value.customer?.phone || '',
    note: selectedOrder.value.note || ''
  };
  showEditModal.value = true;
}

async function submitEditOrder() {
  if (!editForm.value.customer_phone) {
    appStore.showToast('Nomor HP/WhatsApp tujuan wajib diisi', 'warning');
    return;
  }
  editLoading.value = true;
  try {
    await apiFetch(`/api/orders/${selectedOrder.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        customer_name: editForm.value.customer_name,
        customer_phone: editForm.value.customer_phone,
        note: editForm.value.note
      })
    });

    appStore.showToast('Data order & nomor tujuan berhasil diperbarui!', 'success');
    showEditModal.value = false;
    
    // Refresh detail order
    const refreshRes = await apiFetch(`/api/orders/${selectedOrder.value.id}`);
    selectedOrder.value = {
      ...refreshRes.data,
      total_amount: selectedOrder.value.total_amount
    };
    fetchOrders();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    editLoading.value = false;
  }
}

async function fetchOrders() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (currentTab.value !== 'Semua') params.append('status', currentTab.value);
    if (searchQuery.value) params.append('search', searchQuery.value);

    const res = await apiFetch(`/api/orders?${params.toString()}`);
    orders.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

// Debounce search
let searchTimer = null;
watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchOrders, 300);
});

watch(currentTab, fetchOrders);

async function openDetail(order) {
  try {
    const res = await apiFetch(`/api/orders/${order.id}`);
    selectedOrder.value = {
      ...res.data,
      total_amount: order.total_amount
    };
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

async function handleShip() {
  if (!confirm('Ubah status order ini menjadi Dikirim?')) return;
  actionLoading.value = true;
  try {
    await apiFetch(`/api/orders/${selectedOrder.value.id}/ship`, { method: 'POST' });
    appStore.showToast('Order berhasil ditandai Dikirim!', 'success');
    selectedOrder.value = null;
    fetchOrders();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    actionLoading.value = false;
  }
}

async function handleCancel() {
  const reason = prompt('Masukkan alasan pembatalan order:');
  if (!reason) return;
  actionLoading.value = true;
  try {
    await apiFetch(`/api/orders/${selectedOrder.value.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    appStore.showToast('Order berhasil dibatalkan dan stok dikembalikan!', 'success');
    selectedOrder.value = null;
    fetchOrders();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    actionLoading.value = false;
  }
}

function goToPayment() {
  router.push(`/sales?order_id=${selectedOrder.value.id}`);
}

async function openOrderInvoicePreview() {
  if (!selectedOrder.value) return;

  // 1. Jika sudah ada invoice resmi (sudah bayar / tempo)
  let invId = selectedOrder.value.invoice_id;
  if (!invId && selectedOrder.value.status === 'Selesai') {
    try {
      const resInv = await apiFetch(`/api/invoices?search=${selectedOrder.value.order_no}`);
      const found = (resInv.data || []).find(i => i.order_id === selectedOrder.value.id);
      if (found) invId = found.id;
    } catch (e) {
      // Abaikan
    }
  }

  if (invId) {
    try {
      const res = await apiFetch(`/api/invoices/${invId}`);
      orderInvoiceModal.value = res.data;
      return;
    } catch (err) {
      // Lanjut ke nota pesanan
    }
  }

  // 2. Jika belum bayar: Buat format Nota Pesanan (Belum Bayar) lengkap
  const ord = selectedOrder.value;
  const items = (ord.items || []).map(it => ({
    id: it.id,
    name: it.name,
    qty: it.qty,
    price: it.price,
    discount: it.discount || 0,
    line_total: it.line_total || ((parseInt(it.qty, 10) * parseFloat(it.price)) - parseFloat(it.discount || 0))
  }));
  const totalQty = items.reduce((sum, it) => sum + parseInt(it.qty, 10), 0);
  const subtotal = items.reduce((sum, it) => sum + it.line_total, 0);

  orderInvoiceModal.value = {
    id: ord.id,
    doc_title: 'NOTA PESANAN',
    badge_text: 'BELUM DIBAYAR',
    invoice_no: ord.order_no,
    invoice_date: ord.order_date,
    invoice_time: ord.order_time,
    customer_id: ord.customer_id,
    customer_name: ord.customer?.name || ord.customer_name,
    customer_address: ord.customer?.address || '-',
    customer_phone: ord.customer_phone || ord.customer?.phone || '',
    sales_name: ord.sales_name || '-',
    items: items,
    total_qty: totalQty,
    subtotal: subtotal,
    previous_balance: 0,
    total_due: subtotal,
    paid_amount: 0,
    remaining: subtotal,
    pay_method: 'Menunggu Pembayaran',
    note: (ord.note ? `Catatan: ${ord.note} | ` : '') + '*** PERHATIAN: TAGIHAN / NOTA INI BELUM DIBAYAR ***',
    config: {
      business_name: 'RH FROZEN FOOD',
      business_address: 'Distributor Frozen Food Terpercaya',
      business_phone: '',
      invoice_footer: 'Nota pesanan ini merupakan tanda pemesanan resmi (Belum Lunas).'
    }
  };
}

async function syncOfflineOrders() {
  await offlineStore.syncQueue();
  fetchOrders();
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Proses': return 'badge-proses';
    case 'Dikirim': return 'badge-dikirim';
    case 'Selesai': return 'badge-selesai';
    case 'Dibatalkan': return 'badge-dibatalkan';
    default: return '';
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchOrders();
  offlineStore.loadQueue();
});
</script>

<style scoped>
.orders-page {
  padding: 16px;
  padding-bottom: 90px;
}
.header-action {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding-left: 36px !important;
}
.btn-add-order {
  padding: 0 16px;
  min-height: 44px;
  background: var(--primary);
  color: white;
  border-radius: var(--radius-btn);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.15s ease;
}
.btn-add-order:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
.status-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  overflow-x: auto;
}
.tab-btn {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: 8px;
}
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Offline Queue */
.offline-section {
  margin-bottom: 16px;
  background: #fff7ed;
  padding: 12px;
  border-radius: var(--radius-card);
  border: 1px solid #fed7aa;
}
.offline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #c2410c;
  margin-bottom: 8px;
}
.btn-sync {
  background: #ea580c;
  color: white;
  font-size: 11px;
  padding: 4px 8px;
  min-height: 30px;
}
.offline-card {
  margin-bottom: 6px;
}
.fail-reason {
  font-size: 11px;
  color: var(--danger);
  margin-top: 4px;
}

/* Orders List */
.order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.order-card {
  cursor: pointer;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.order-top, .order-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.order-no {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
}
.order-cust {
  font-size: 15px;
  font-weight: 600;
}
.order-date {
  font-size: 12px;
  color: var(--text-muted);
}
.order-total {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

/* Floating Action Button */
.fab {
  position: fixed;
  bottom: calc(var(--safe-bottom) + 65px);
  right: calc(50% - 220px);
  width: 52px;
  height: 52px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35);
  z-index: 40;
}
@media (max-width: 480px) {
  .fab {
    right: 20px;
  }
}

/* Bottom Sheet styles are handled globally in styles.css */
.detail-sec {
  margin-bottom: 16px;
}
.sheet-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet-title h3 {
  font-size: 16px;
}
.sheet-close {
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  min-height: 36px;
  padding: 4px;
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.items-title {
  font-size: 13px;
  font-weight: 700;
  margin-top: 6px;
}
.items-table {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  border-bottom: 1px dashed var(--border-color);
  padding-bottom: 6px;
}
.item-row:last-child {
  border-bottom: none;
}
.item-info {
  display: flex;
  flex-direction: column;
}
.item-name {
  font-weight: 600;
}
.item-calc {
  font-size: 11px;
  color: var(--text-muted);
}
.item-disc {
  font-size: 10px;
  color: var(--danger);
}
.item-total {
  font-weight: 700;
}
.order-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
}
.total-big {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.btn-action {
  width: 100%;
  color: white;
  min-height: 44px;
}
.btn-edit-order {
  background: #3b82f6;
}
.btn-print-order {
  background: #0ea5e9;
}
.btn-ship { background: var(--success); }
.btn-cancel { background: var(--danger); }
.btn-pay { background: var(--primary); }

.phone-link {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-edit-phone-inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  color: var(--primary);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.wa-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #dcfce7;
  color: #15803d;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
}
.hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.btn-save-order {
  background: var(--primary);
  color: white;
  min-height: 44px;
  width: 100%;
  font-size: 14px;
  margin-top: 10px;
}
</style>
