<template>
  <div class="pos-page">
    <div class="pos-header">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: tab === 'pos' }" @click="tab = 'pos'">
          🛒 Kasir Penjualan
        </button>
        <button class="tab-btn" :class="{ active: tab === 'history' }" @click="tab = 'history'">
          📄 Riwayat Transaksi ({{ invoices.length }})
        </button>
      </div>
    </div>

    <!-- TAB 1: KASIR TRANSAKSI BARU -->
    <div v-if="tab === 'pos'" class="pos-body">
      <!-- Pilih Pelanggan -->
      <div class="card p-14">
        <div class="sec-title">1. Pilih Pelanggan</div>
        <div class="cust-row">
          <select v-model="selectedCustomerId" class="pos-select" @change="onCustomerChange">
            <option value="">-- Pilih Pelanggan End Customer --</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.phone || 'Tanpa No HP' }})
            </option>
          </select>
        </div>
        <div v-if="selectedCustomer" class="cust-meta">
          <div><strong>Alamat:</strong> {{ selectedCustomer.address || '-' }}</div>
          <div><strong>Piutang/Bon:</strong> Rp {{ fmt(selectedCustomer.balance) }}</div>
          <div><strong>Batas Kredit:</strong> {{ selectedCustomer.credit_limit > 0 ? 'Rp ' + fmt(selectedCustomer.credit_limit) : 'Tanpa Batas' }}</div>
        </div>
      </div>

      <!-- Pilih Barang dari Stok Sales Sendiri -->
      <div class="card p-14">
        <div class="sec-title">2. Pilih Barang (Dari Stok Saya)</div>
        <div class="search-wrap">
          <Icon name="search" size="14" />
          <input v-model="search" type="text" placeholder="Cari nama barang di stok Anda..." />
        </div>

        <div v-if="loadingStock" class="empty">Memuat stok Anda...</div>
        <div v-else-if="filteredStock.length === 0" class="empty">
          <p>Tidak ada stok yang tersedia.</p>
          <small class="text-muted">Minta barang ke admin lewat menu Permintaan Barang bila stok kosong.</small>
        </div>
        <div v-else class="stock-grid">
          <button
            v-for="s in filteredStock"
            :key="s.product_id"
            type="button"
            class="stock-tile"
            :class="{ zero: s.stock <= 0, chosen: cartQtyOf(s.product_id) > 0 }"
            :disabled="s.stock <= 0"
            @click="addToCart(s)"
          >
            <span class="stock-emoji">{{ s.emoji || '📦' }}</span>
            <span class="stock-name">{{ s.product_name }}</span>
            <span class="stock-qty" :class="{ danger: s.stock <= 0 }">Stok: {{ s.stock }} pcs</span>
            <span class="stock-price">Rp {{ fmt(s.price) }}</span>
            <span v-if="cartQtyOf(s.product_id) > 0" class="stock-badge">{{ cartQtyOf(s.product_id) }}</span>
          </button>
        </div>
      </div>

      <!-- Keranjang & Checkout -->
      <div class="card p-14">
        <div class="sec-title">3. Keranjang Penjualan ({{ cart.length }})</div>
        <div v-if="cart.length === 0" class="empty">Keranjang kosong. Pilih barang di atas.</div>
        <div v-else class="cart-list">
          <div v-for="(it, idx) in cart" :key="it.product_id" class="cart-row">
            <div class="cart-info">
              <div class="cart-name">{{ it.emoji }} {{ it.product_name }}</div>
              <small class="text-muted">@ Rp {{ fmt(it.price) }} · Maks stok: {{ it.maxStock }}</small>
            </div>
            <div class="cart-ctrl">
              <div class="qty-btn-group">
                <button type="button" @click="decCart(idx)">−</button>
                <input v-model.number="it.qty" type="number" min="1" :max="it.maxStock" @input="clampQty(it)" />
                <button type="button" :disabled="it.qty >= it.maxStock" @click="it.qty++">+</button>
              </div>
              <div class="cart-subtotal">Rp {{ fmt(it.qty * it.price) }}</div>
            </div>
          </div>
        </div>

        <!-- Ringkasan & Pembayaran -->
        <div v-if="cart.length > 0" class="checkout-box">
          <div class="sum-row">
            <span>Subtotal Penjualan</span>
            <strong>Rp {{ fmt(cartTotal) }}</strong>
          </div>
          <div class="sum-row">
            <span>Bon / Piutang Sebelumnya</span>
            <span>Rp {{ fmt(selectedCustomer?.balance || 0) }}</span>
          </div>
          <div class="sum-row total">
            <span>Total Tagihan</span>
            <strong class="total-big">Rp {{ fmt(totalDue) }}</strong>
          </div>

          <div class="pay-form">
            <div class="form-group">
              <label>Metode Pembayaran</label>
              <select v-model="payMethod" class="pos-select" @change="onPayMethodChange">
                <option value="Tunai">Tunai</option>
                <option value="Transfer">Transfer</option>
                <option value="Tempo">Tempo (Hutang)</option>
              </select>
            </div>
            <div class="form-group" v-if="payMethod !== 'Tempo'">
              <div class="flex-between">
                <label>Nominal Diterima</label>
                <button type="button" class="btn-quick" @click="paidAmount = totalDue">Uang Pas</button>
              </div>
              <input v-model.number="paidAmount" type="number" min="0" />
            </div>
            <div class="form-group">
              <label>Catatan Transaksi</label>
              <input v-model="txNote" type="text" placeholder="Catatan opsional..." />
            </div>
            <button
              class="btn-checkout"
              :disabled="submitting || !selectedCustomerId || cart.length === 0"
              @click="submitTransaction"
            >
              <Icon name="check" size="18" />
              <span>{{ submitting ? 'Menyimpan...' : 'Selesaikan Transaksi (Cetak/Simpan)' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: RIWAYAT TRANSAKSI / INVOICE -->
    <div v-if="tab === 'history'" class="pos-history">
      <div v-if="loadingInvoices" class="empty">Memuat riwayat transaksi...</div>
      <div v-else-if="invoices.length === 0" class="empty">Belum ada transaksi kasir.</div>
      <div v-else class="inv-list">
        <div v-for="inv in invoices" :key="inv.id" class="card inv-card" @click="viewInvoice(inv)">
          <div class="inv-top">
            <strong><Icon name="file-text" size="14" /> {{ inv.invoice_no }}</strong>
            <span class="badge" :class="parseFloat(inv.remaining) <= 0 ? 'badge-lunas' : 'badge-tempo'">
              {{ parseFloat(inv.remaining) <= 0 ? 'Lunas' : 'Sisa Rp ' + fmt(inv.remaining) }}
            </span>
          </div>
          <div class="inv-cust">{{ inv.customer_name }}</div>
          <div class="inv-bottom">
            <span>{{ inv.invoice_date || inv.tx_date }}</span>
            <strong>Rp {{ fmt(inv.total_due) }}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Pratinjau Invoice -->
    <div v-if="activeInvoice" class="sheet-overlay" @click.self="activeInvoice = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Invoice {{ activeInvoice.invoice_no }}</h3>
          <button class="sheet-close" @click="activeInvoice = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <InvoiceView :invoice="activeInvoice" />
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
import InvoiceView from '../components/InvoiceView.vue';

const authStore = useAuthStore();
const appStore = useAppStore();

const tab = ref('pos');
const customers = ref([]);
const stock = ref([]);
const invoices = ref([]);
const cart = ref([]);

const selectedCustomerId = ref('');
const search = ref('');
const payMethod = ref('Tunai');
const paidAmount = ref(0);
const txNote = ref('');
const submitting = ref(false);
const loadingStock = ref(true);
const loadingInvoices = ref(false);
const activeInvoice = ref(null);

const selectedCustomer = computed(() => customers.value.find(c => c.id === selectedCustomerId.value));

const filteredStock = computed(() => {
  const q = search.value.toLowerCase().trim();
  return stock.value.filter(s => !q || (s.product_name || '').toLowerCase().includes(q));
});

const cartTotal = computed(() => cart.value.reduce((s, it) => s + (it.qty * it.price), 0));
const totalDue = computed(() => cartTotal.value + parseFloat(selectedCustomer.value?.balance || 0));

function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('id-ID');
}

function cartQtyOf(prodId) {
  return cart.value.find(i => i.product_id === prodId)?.qty || 0;
}

function addToCart(s) {
  const ex = cart.value.find(i => i.product_id === s.product_id);
  if (ex) {
    if (ex.qty < s.stock) ex.qty++;
    else appStore.showToast('Jumlah mencapai batas stok Anda', 'warning');
  } else {
    cart.value.push({
      product_id: s.product_id,
      product_name: s.product_name,
      emoji: s.emoji || '📦',
      price: s.price || 0,
      qty: 1,
      maxStock: s.stock
    });
  }
}

function decCart(idx) {
  if (cart.value[idx].qty > 1) cart.value[idx].qty--;
  else cart.value.splice(idx, 1);
}

function clampQty(it) {
  if (it.qty > it.maxStock) it.qty = it.maxStock;
  if (it.qty < 1) it.qty = 1;
}

function onCustomerChange() {
  paidAmount.value = totalDue.value;
}

function onPayMethodChange() {
  if (payMethod.value === 'Tempo') paidAmount.value = 0;
  else paidAmount.value = totalDue.value;
}

async function loadData() {
  try {
    const [custRes, stockRes] = await Promise.all([
      apiFetch('/api/customers'),
      apiFetch('/api/products/sales-stock')
    ]);
    customers.value = (custRes.data || []).filter(c => c.active !== false);
    stock.value = stockRes.data || [];
  } catch (e) {
    appStore.showToast(`Gagal memuat: ${e.message}`, 'error');
  } finally {
    loadingStock.value = false;
  }
}

async function loadInvoices() {
  loadingInvoices.value = true;
  try {
    const res = await apiFetch('/api/invoices?limit=50');
    invoices.value = res.data || [];
  } catch (e) {
    appStore.showToast(`Gagal memuat invoice: ${e.message}`, 'error');
  } finally {
    loadingInvoices.value = false;
  }
}

async function submitTransaction() {
  if (!selectedCustomerId.value) return appStore.showToast('Pilih pelanggan terlebih dahulu', 'warning');
  if (cart.value.length === 0) return appStore.showToast('Keranjang masih kosong', 'warning');

  submitting.value = true;
  const clientKey = crypto.randomUUID();
  try {
    const res = await apiFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': clientKey },
      body: JSON.stringify({
        customer_id: selectedCustomerId.value,
        pay_method: payMethod.value,
        paid_amount: paidAmount.value,
        note: txNote.value,
        client_key: clientKey,
        items: cart.value.map(it => ({
          product_id: it.product_id,
          qty: it.qty,
          price: it.price
        }))
      })
    });

    appStore.showToast('Transaksi berhasil disimpan!', 'success');
    activeInvoice.value = res.data;
    cart.value = [];
    selectedCustomerId.value = '';
    await loadData();
    await loadInvoices();
  } catch (e) {
    appStore.showToast(`Transaksi gagal: ${e.message}`, 'error');
  } finally {
    submitting.value = false;
  }
}

async function viewInvoice(inv) {
  try {
    const res = await apiFetch(`/api/invoices/${inv.id}`);
    activeInvoice.value = res.data;
  } catch (e) {
    activeInvoice.value = inv;
  }
}

onMounted(() => {
  loadData();
  loadInvoices();
});
</script>

<style scoped>
.pos-page { display: flex; flex-direction: column; gap: 14px; padding-bottom: 90px; }
.tabs { display: flex; gap: 8px; }
.tab-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--border, #ddd); background: var(--card-bg, #fff); font-weight: 600; cursor: pointer; }
.tab-btn.active { background: var(--primary, #2563eb); color: #fff; border-color: transparent; }
.p-14 { padding: 14px; }
.sec-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.pos-select { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border, #ddd); background: transparent; }
.cust-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px; font-size: 12px; margin-top: 8px; padding: 8px; background: rgba(0,0,0,.03); border-radius: 8px; }
.search-wrap { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
.search-wrap input { border: none; outline: none; flex: 1; background: transparent; }
.stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; max-height: 380px; overflow-y: auto; }
.stock-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border: 1.5px solid var(--border, #e5e5e5); border-radius: 10px; background: var(--card-bg, #fff); cursor: pointer; text-align: center; }
.stock-tile.chosen { border-color: var(--primary, #2563eb); }
.stock-tile.zero { opacity: .4; cursor: not-allowed; }
.stock-emoji { font-size: 32px; }
.stock-name { font-size: 12px; font-weight: 600; line-height: 1.2; }
.stock-qty { font-size: 11px; font-weight: 700; color: #059669; }
.stock-qty.danger { color: #dc2626; }
.stock-price { font-size: 12px; font-weight: 700; color: var(--primary, #2563eb); }
.stock-badge { position: absolute; top: 6px; right: 6px; background: var(--primary, #2563eb); color: #fff; border-radius: 999px; min-width: 20px; height: 20px; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cart-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.cart-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border, #eee); }
.cart-name { font-weight: 600; font-size: 13px; }
.cart-ctrl { display: flex; align-items: center; gap: 12px; }
.qty-btn-group { display: flex; align-items: center; gap: 4px; }
.qty-btn-group button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border, #ddd); background: transparent; cursor: pointer; }
.qty-btn-group input { width: 44px; text-align: center; }
.cart-subtotal { font-weight: 700; font-size: 13px; min-width: 70px; text-align: right; }
.checkout-box { border-top: 2px solid var(--border, #eee); padding-top: 12px; }
.sum-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.sum-row.total { padding: 8px 0; font-size: 15px; border-top: 1px dashed var(--border, #ddd); margin-top: 6px; }
.total-big { color: var(--primary, #2563eb); font-size: 18px; }
.pay-form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.btn-quick { border: none; background: none; color: var(--primary, #2563eb); font-weight: 600; cursor: pointer; font-size: 12px; }
.btn-checkout { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border: none; border-radius: 12px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; }
.btn-checkout:disabled { opacity: .5; cursor: not-allowed; }
.empty { text-align: center; color: var(--text-muted, #888); padding: 24px; font-size: 13px; }
.inv-list { display: flex; flex-direction: column; gap: 10px; }
.inv-card { padding: 14px; cursor: pointer; }
.inv-top, .inv-bottom { display: flex; justify-content: space-between; align-items: center; }
.inv-cust { margin: 6px 0; font-size: 14px; font-weight: 600; }
.badge-lunas { background: rgba(16,185,129,.15); color: #059669; }
.badge-tempo { background: rgba(239,68,68,.15); color: #dc2626; }
.sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; z-index: 1000; }
.sheet-content { background: var(--card-bg, #fff); width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 18px; }
.sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.sheet-close { background: none; border: none; cursor: pointer; }
</style>
