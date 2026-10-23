<template>
  <div class="sales-page">
    <!-- Header Tab Penjualan -->
    <div class="sales-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'waiting' }"
        @click="activeTab = 'waiting'"
      >
        Menunggu Pembayaran ({{ waitingOrders.length }})
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'completed' }"
        @click="activeTab = 'completed'"
      >
        Penjualan Selesai
      </button>
    </div>

    <!-- Tab 1: Menunggu Pembayaran -->
    <div v-if="activeTab === 'waiting'" class="tab-content">
      <div v-if="loadingWaiting" class="state-msg">Memuat data pesanan...</div>
      <div v-else-if="waitingOrders.length === 0" class="empty-state">
        <div class="empty-icon-box"><Icon name="check" size="38" /></div>
        <h3>Semua Beres!</h3>
        <p>Tidak ada pesanan yang menunggu pembayaran saat ini.</p>
      </div>
      <div v-else class="orders-grid">
        <div
          v-for="o in waitingOrders"
          :key="o.id"
          class="card waiting-card"
          @click="openPayModal(o)"
        >
          <div class="card-head">
            <span class="order-no"><Icon name="package" size="14" /> {{ o.order_no }}</span>
            <span class="badge" :class="o.status === 'Proses' ? 'badge-proses' : 'badge-dikirim'">
              {{ o.status }}
            </span>
          </div>
          <div class="cust-name">{{ o.customer_name }}</div>
          <div class="card-foot">
            <span class="date">{{ o.order_date }}</span>
            <span class="amount">Rp {{ formatNumber(o.total_amount) }}</span>
          </div>
          <button class="btn-pay-now"><Icon name="dollar-sign" size="15" /> Proses Pembayaran</button>
        </div>
      </div>
    </div>

    <!-- Tab 2: Penjualan Selesai (Invoices) -->
    <div v-if="activeTab === 'completed'" class="tab-content">
      <div v-if="loadingCompleted" class="state-msg">Memuat riwayat invoice...</div>
      <div v-else-if="completedInvoices.length === 0" class="empty-state">
        <div class="empty-icon-box"><Icon name="file-text" size="38" /></div>
        <h3>Belum Ada Penjualan Selesai</h3>
      </div>
      <div v-else class="invoices-grid">
        <div
          v-for="inv in completedInvoices"
          :key="inv.id"
          class="card invoice-card"
          @click="openInvoiceDetail(inv)"
        >
          <div class="card-head">
            <span class="inv-no"><Icon name="file-text" size="14" /> {{ inv.invoice_no }}</span>
            <span class="badge" :class="parseFloat(inv.remaining) <= 0 ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ parseFloat(inv.remaining) <= 0 ? 'Lunas' : 'Sisa Rp ' + formatNumber(inv.remaining) }}
            </span>
          </div>
          <div class="cust-name">{{ inv.customer_name }}</div>
          <div class="card-foot">
            <span class="date">{{ inv.invoice_date }}</span>
            <span class="amount">Total: Rp {{ formatNumber(inv.total_due) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Form Pembayaran (Sesuai Pratinjau Invoice Bagian 10) -->
    <div v-if="payModalOrder" class="sheet-overlay" @click.self="payModalOrder = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Pembayaran Order {{ payModalOrder.order_no }}</h3>
          <button class="sheet-close" @click="payModalOrder = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <!-- Rincian Belanja -->
          <div class="calc-box">
            <div class="calc-row">
              <span>Total Belanja:</span>
              <strong>Rp {{ formatNumber(payModalOrder.total_amount) }}</strong>
            </div>
            <div class="calc-row">
              <span>Bon Sebelumnya:</span>
              <strong>Rp {{ formatNumber(payCustomerBalance) }}</strong>
            </div>
            <div class="calc-row total-row">
              <span>Total Tagihan:</span>
              <strong class="total-big">Rp {{ formatNumber(payTotalDue) }}</strong>
            </div>
          </div>

          <!-- Form Input Pembayaran -->
          <div class="form-group">
            <label>Metode Pembayaran</label>
            <select v-model="payMethod" @change="onMethodChange">
              <option value="Tunai">Tunai</option>
              <option value="Transfer">Transfer</option>
              <option value="Tempo">Tempo (Hutang)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Jumlah Bayar (Rp)</label>
            <input
              v-model.number="paidAmount"
              type="number"
              min="0"
              :max="payTotalDue"
              inputmode="numeric"
              :disabled="payMethod === 'Tempo'"
            />
          </div>

          <!-- Sisa Hutang Real-time -->
          <div class="balance-preview" :class="payRemaining <= 0 ? 'lunas-box' : 'tempo-box'">
            <span>Sisa kekurangan / hutang:</span>
            <strong class="bal-huge">Rp {{ formatNumber(payRemaining) }}</strong>
          </div>

          <div class="form-group">
            <label>Catatan Pembayaran (Opsional)</label>
            <input v-model="payNote" type="text" placeholder="Contoh: Transfer BCA" />
          </div>

          <button
            class="btn-save-invoice"
            @click="submitPayment"
            :disabled="payLoading || paidAmount > payTotalDue || !isOnline"
          >
            {{ !isOnline ? 'Pembayaran Tidak Dapat Dilakukan Saat Offline' : (payLoading ? 'Memproses...' : 'Simpan & Terbitkan Invoice') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Lihat Invoice Penuh -->
    <div v-if="selectedInvoice" class="sheet-overlay" @click.self="selectedInvoice = null">
      <div class="sheet-content sheet-inv">
        <div class="sheet-close-bar">
          <button class="sheet-close" @click="selectedInvoice = null"><Icon name="x" size="16" /> Tutup</button>
        </div>
        <InvoiceView :invoice="selectedInvoice" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { useOfflineStore } from '../stores/offline.js';
import InvoiceView from '../components/InvoiceView.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const appStore = useAppStore();
const offlineStore = useOfflineStore();
const isOnline = computed(() => offlineStore.isOnline);

const activeTab = ref('waiting');
const loadingWaiting = ref(false);
const loadingCompleted = ref(false);
const waitingOrders = ref([]);
const completedInvoices = ref([]);

// State Pembayaran
const payModalOrder = ref(null);
const payCustomerBalance = ref(0);
const payMethod = ref('Tunai');
const paidAmount = ref(0);
const payNote = ref('');
const payLoading = ref(false);

const selectedInvoice = ref(null);

const payTotalDue = computed(() => {
  if (!payModalOrder.value) return 0;
  return (payModalOrder.value.total_amount || 0) + payCustomerBalance.value;
});

const payRemaining = computed(() => {
  const rem = payTotalDue.value - (paidAmount.value || 0);
  return Math.max(rem, 0);
});

function onMethodChange() {
  if (payMethod.value === 'Tempo') {
    paidAmount.value = 0;
  } else {
    paidAmount.value = payTotalDue.value;
  }
}

async function fetchWaitingOrders() {
  loadingWaiting.value = true;
  try {
    const res = await apiFetch('/api/orders?status=Proses');
    const prosesOrders = res.data || [];
    const resDikirim = await apiFetch('/api/orders?status=Dikirim');
    const dikirimOrders = resDikirim.data || [];
    waitingOrders.value = [...prosesOrders, ...dikirimOrders];

    // Jika ada order_id dari query URL
    const queryOrderId = route.query.order_id;
    if (queryOrderId) {
      const match = waitingOrders.value.find(o => o.id === queryOrderId);
      if (match) openPayModal(match);
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loadingWaiting.value = false;
  }
}

async function fetchCompletedInvoices() {
  loadingCompleted.value = true;
  try {
    const res = await apiFetch('/api/invoices');
    completedInvoices.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loadingCompleted.value = false;
  }
}

async function openPayModal(order) {
  payModalOrder.value = order;
  payMethod.value = 'Tunai';
  payNote.value = '';
  payLoading.value = false;

  // Ambil saldo hutang pelanggan terkini
  try {
    const resCust = await apiFetch('/api/orders/options');
    const cust = (resCust.data?.customers || []).find(c => c.id === order.customer_id);
    payCustomerBalance.value = cust ? parseFloat(cust.balance || 0) : 0;
  } catch (e) {
    payCustomerBalance.value = 0;
  }

  paidAmount.value = (order.total_amount || 0) + payCustomerBalance.value;
}

async function submitPayment() {
  if (paidAmount.value > payTotalDue.value) {
    appStore.showToast('Pembayaran tidak boleh melebihi total tagihan', 'warning');
    return;
  }

  payLoading.value = true;
  const idempotencyKey = crypto.randomUUID();

  try {
    const res = await apiFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        order_id: payModalOrder.value.id,
        pay_method: payMethod.value,
        paid_amount: paidAmount.value,
        note: payNote.value
      })
    });

    appStore.showToast('Pembayaran berhasil diproses!', 'success');
    payModalOrder.value = null;

    // Tampilkan invoice yang baru terbit
    await openInvoiceDetail(res.data);
    fetchWaitingOrders();
    fetchCompletedInvoices();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    payLoading.value = false;
  }
}

async function openInvoiceDetail(inv) {
  try {
    const res = await apiFetch(`/api/invoices/${inv.id}`);
    selectedInvoice.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchWaitingOrders();
  fetchCompletedInvoices();
});
</script>

<style scoped>
.sales-page {
  padding: 16px;
  padding-bottom: 90px;
}
.sales-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.tab-btn {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  min-height: 40px;
  border-radius: var(--radius-btn);
}
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
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
.orders-grid, .invoices-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.waiting-card, .invoice-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-head, .card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.order-no, .inv-no {
  font-weight: 700;
  color: var(--primary);
  font-size: 14px;
}
.cust-name {
  font-weight: 600;
  font-size: 15px;
}
.date {
  font-size: 12px;
  color: var(--text-muted);
}
.amount {
  font-weight: 700;
  font-size: 14px;
}
.btn-pay-now {
  background: var(--success);
  color: white;
  width: 100%;
  margin-top: 6px;
  min-height: 38px;
  font-size: 13px;
}

/* Modal Bottom Sheet */
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
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-inv {
  padding: 12px;
  background: var(--bg-app);
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 14px;
}
.sheet-close {
  background: transparent;
  font-size: 16px;
  min-height: 36px;
  padding: 4px;
}
.sheet-close-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.calc-box {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.calc-row {
  display: flex;
  justify-content: space-between;
}
.total-row {
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  font-size: 15px;
}
.total-big {
  color: var(--primary);
  font-size: 18px;
}
.balance-preview {
  padding: 12px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.lunas-box {
  background: #dcfce7;
  color: #15803d;
}
.tempo-box {
  background: #fee2e2;
  color: #b91c1c;
}
.bal-huge {
  font-size: 20px;
  font-weight: 800;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-save-invoice {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}
</style>
