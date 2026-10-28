<template>
  <div class="pos-page">
    <div class="pos-header">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: tab === 'pos' }" @click="tab = 'pos'">
          🛒 Kasir Penjualan
        </button>
        <button class="tab-btn" :class="{ active: tab === 'history' }" @click="tab = 'history'">
          📄 Riwayat Transaksi ({{ fmt(transactions.length) }})
        </button>
      </div>
    </div>

    <!-- TAB 1: KASIR TRANSAKSI BARU -->
    <div v-if="tab === 'pos'" class="pos-body">
      <!-- Pilih Pelanggan -->
      <div class="card p-14 pos-section-card">
        <div class="sec-title">
          <span class="step-num">1</span>
          <span>Pilih Pelanggan</span>
        </div>
        <div class="cust-row">
          <!-- Dropdown Search Pelanggan -->
          <div class="cust-select-dropdown" ref="customerDropdownRef">
            <div
              class="cust-trigger"
              :class="{ 'is-open': showCustomerDropdown, 'has-selected': !!selectedCustomer }"
              @click="toggleCustomerDropdown"
            >
              <div class="trigger-content">
                <span v-if="!selectedCustomer" class="placeholder">-- Cari atau Pilih Pelanggan --</span>
                <div v-else class="selected-cust-info">
                  <span class="cust-main-name">
                    <span v-if="selectedCustomer.balance > 0" class="mini-warning-tag">⚠️ Ada Bon</span>
                    {{ selectedCustomer.name }}
                  </span>
                  <small class="cust-phone-sub">{{ selectedCustomer.phone || 'Tanpa No HP' }}</small>
                </div>
              </div>
              <div class="trigger-actions">
                <button
                  v-if="selectedCustomerId"
                  type="button"
                  class="btn-clear-cust"
                  @click.stop="clearCustomerSelection"
                  title="Batalkan pilihan"
                >
                  <Icon name="x" size="14" />
                </button>
                <span class="dropdown-chevron">{{ showCustomerDropdown ? '▲' : '▼' }}</span>
              </div>
            </div>

            <!-- Menu Dropdown dengan Search Bar -->
            <div v-if="showCustomerDropdown" class="cust-dropdown-menu">
              <div class="cust-search-box">
                <Icon name="search" size="14" class="cust-search-icon" />
                <input
                  ref="custSearchInputRef"
                  v-model="customerSearchQuery"
                  type="text"
                  placeholder="Ketik nama / no HP pelanggan..."
                  class="cust-search-input"
                  @click.stop
                />
                <button
                  v-if="customerSearchQuery"
                  type="button"
                  class="btn-clear-cust-search"
                  @click.stop="customerSearchQuery = ''"
                >
                  <Icon name="x" size="12" />
                </button>
              </div>

              <div class="cust-options-list">
                <div
                  v-if="filteredCustomers.length === 0"
                  class="no-cust-found"
                >
                  Pelanggan "{{ customerSearchQuery }}" tidak ditemukan
                </div>
                <div
                  v-for="c in filteredCustomers"
                  :key="c.id"
                  class="cust-option-item"
                  :class="{ active: c.id === selectedCustomerId, 'has-debt': c.balance > 0 }"
                  @click="selectCustomer(c)"
                >
                  <div class="opt-left">
                    <span class="opt-name">{{ c.name }}</span>
                    <small class="opt-sub">{{ c.phone || 'Tanpa No HP' }} · {{ c.address || 'Tanpa Alamat' }}</small>
                  </div>
                  <div class="opt-right">
                    <span v-if="c.balance > 0" class="opt-debt-badge">
                      Bon: Rp {{ fmt(c.balance) }}
                    </span>
                    <span v-else class="opt-lunas-badge">Lunas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="selectedCustomer" class="cust-meta">
          <div class="meta-item">
            <span class="meta-lbl">Alamat:</span>
            <span class="meta-val">{{ selectedCustomer.address || '-' }}</span>
          </div>
          <div class="meta-item" :class="{ 'meta-has-balance': selectedCustomer.balance > 0 }">
            <span class="meta-lbl">Piutang / Bon:</span>
            <span class="meta-val font-bold">
              {{ selectedCustomer.balance > 0 ? '⚠️ Rp ' + fmt(selectedCustomer.balance) + ' (Belum Lunas)' : 'Rp 0 (Lunas)' }}
            </span>
          </div>
          <div class="meta-item">
            <span class="meta-lbl">Batas Kredit:</span>
            <span class="meta-val">{{ selectedCustomer.credit_limit > 0 ? 'Rp ' + fmt(selectedCustomer.credit_limit) : 'Tanpa Batas' }}</span>
          </div>
        </div>
      </div>

      <!-- Pilih Barang dari Stok Sales Sendiri -->
      <div class="card p-14 pos-section-card">
        <div class="sec-title-bar">
          <div class="sec-title">
            <span class="step-num">2</span>
            <span>Pilih Barang (Stok Saya)</span>
          </div>
          <small class="stock-summary-badge">{{ filteredStock.length }} barang</small>
        </div>

        <div class="search-input-wrapper">
          <Icon name="search" size="16" class="search-icon" />
          <input
            v-model="search"
            type="text"
            placeholder="Cari nama barang di stok Anda..."
            class="search-input"
          />
          <button v-if="search" class="clear-btn" @click="search = ''" title="Hapus pencarian">
            <Icon name="x" size="14" />
          </button>
        </div>

        <div v-if="loadingStock" class="empty">Memuat stok Anda...</div>
        <div v-else-if="filteredStock.length === 0" class="empty">
          <Icon name="package" size="32" class="empty-icon" />
          <p>Tidak ada stok yang cocok.</p>
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
            <div class="tile-thumb">
              <img v-if="isValidImage(s.image)" :src="s.image" :alt="s.product_name" class="tile-img" @error="s.image = ''" />
              <span v-else class="stock-emoji">{{ s.emoji || '📦' }}</span>
            </div>
            <div class="tile-info">
              <span class="stock-name">{{ s.product_name }}</span>
              <div class="tile-meta-row">
                <span class="stock-qty" :class="{ danger: s.stock <= 0 }">Stok: {{ fmt(s.stock) }}</span>
                <span v-if="hasCustomPrice(s.product_id)" class="stock-price custom-price-highlight" title="Harga Khusus Pelanggan">
                  <span class="disc-strike">Rp {{ fmt(s.price) }}</span>
                  <span>Rp {{ fmt(getProductPrice(s)) }}</span>
                  <span class="custom-badge-tag">Khusus</span>
                </span>
                <span v-else class="stock-price">Rp {{ fmt(s.price) }}</span>
              </div>
            </div>
            <span v-if="cartQtyOf(s.product_id) > 0" class="stock-badge">{{ fmt(cartQtyOf(s.product_id)) }}</span>
          </button>
        </div>
      </div>

      <!-- Keranjang & Checkout -->
      <div class="card p-14 pos-section-card">
        <div class="sec-title-bar">
          <div class="sec-title">
            <span class="step-num">3</span>
            <span>Keranjang Penjualan</span>
          </div>
          <small class="stock-summary-badge">{{ cart.length }} item</small>
        </div>
        <div v-if="cart.length === 0" class="empty">
          <Icon name="shopping-cart" size="32" class="empty-icon" />
          <p>Keranjang masih kosong.</p>
          <small class="text-muted">Ketuk barang pada daftar di atas untuk menambahkan.</small>
        </div>
        <div v-else class="cart-list">
          <div v-for="(it, idx) in cart" :key="it.product_id" class="cart-row">
            <div class="cart-main-line">
              <div class="cart-info">
                <div class="cart-name">
                  {{ it.emoji }} {{ it.product_name }}
                  <span v-if="it.isCustomPrice" class="custom-badge-tag">Harga Khusus</span>
                </div>
                <small class="text-muted">
                  <span v-if="it.isCustomPrice && it.defaultPrice && it.defaultPrice !== it.price" class="disc-strike">@ Rp {{ fmt(it.defaultPrice) }} </span>
                  @ Rp {{ fmt(it.price) }} · Maks stok: {{ fmt(it.maxStock) }}
                </small>
              </div>
              <div class="cart-ctrl">
                <div class="qty-btn-group">
                  <button type="button" @click="decCart(idx)">−</button>
                  <input
                    v-model.number="it.qty"
                    type="number"
                    min="1"
                    :max="it.maxStock"
                    inputmode="numeric"
                    @focus="onQtyFocus($event)"
                    @click="onQtyFocus($event)"
                    @input="onQtyInput(it)"
                    @blur="onQtyBlur(it)"
                  />
                  <button type="button" :disabled="it.qty >= it.maxStock" @click="it.qty++">+</button>
                </div>
                <div class="cart-subtotal">
                  <div>Rp {{ fmt((it.qty * it.price) - (it.discount || 0)) }}</div>
                  <div v-if="it.discount > 0" class="item-disc-tag">Potongan: -Rp {{ fmt(it.discount) }}</div>
                </div>
              </div>
            </div>

            <!-- Kolom Input Potongan / Diskon (Selalu Tampak) -->
            <div class="cart-discount-input-row">
              <div class="disc-label-group">
                <Icon name="tag" size="13" class="disc-icon" />
                <span class="disc-title">Potongan / Diskon:</span>
              </div>
              <div class="disc-input-box">
                <span class="disc-prefix">Rp</span>
                <input
                  type="text"
                  inputmode="numeric"
                  :value="it.discount ? fmt(it.discount) : ''"
                  @input="onItemDiscountInput(it, $event)"
                  placeholder="0"
                  class="disc-field"
                  title="Masukkan nominal potongan diskon barang ini"
                />
                <button
                  v-if="it.discount > 0"
                  type="button"
                  class="btn-clear-disc"
                  @click="it.discount = 0; if (payMethod !== 'Tempo') paidAmount = totalDue;"
                  title="Hapus potongan"
                >✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Ringkasan & Pembayaran -->
        <div v-if="cart.length > 0" class="checkout-box">
          <div class="sum-row">
            <span>Subtotal Penjualan</span>
            <strong>Rp {{ fmt(cartGrossSubtotal) }}</strong>
          </div>
          <div class="sum-row text-danger font-bold" v-if="cartTotalDiscount > 0">
            <span>Diskon / Potongan Total</span>
            <span>- Rp {{ fmt(cartTotalDiscount) }}</span>
          </div>
          <div class="sum-row" v-if="cartTotalDiscount > 0">
            <span>Subtotal Setelah Diskon</span>
            <strong>Rp {{ fmt(cartNetSubtotal) }}</strong>
          </div>
          <div class="sum-row">
            <span>Bon / Piutang Sebelumnya</span>
            <span :class="selectedCustomer?.balance > 0 ? 'text-danger font-bold' : ''">Rp {{ fmt(selectedCustomer?.balance || 0) }}</span>
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
              <input
                type="text"
                inputmode="numeric"
                :value="formattedPaidAmount"
                @input="onPaidAmountInput($event)"
                placeholder="0"
                class="currency-input"
              />
              <div v-if="paidAmount > totalDue" class="change-info">
                <span>Kembalian:</span>
                <strong>Rp {{ fmt(paidAmount - totalDue) }}</strong>
              </div>
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
      <div v-else-if="transactions.length === 0" class="empty">Belum ada transaksi kasir.</div>
          <div v-else class="inv-list">
            <div
              v-for="tx in transactions"
              :key="tx.id + tx.type"
              class="card inv-card"
              :class="{
                'payment-card': tx.type === 'Pelunasan',
                'has-return-card': tx.has_return
              }"
              @click="tx.type === 'Invoice' && viewInvoice(tx)"
            >
              <div class="inv-top">
                <strong><Icon :name="tx.type === 'Invoice' ? 'file-text' : 'dollar-sign'" size="14" /> {{ tx.title }}</strong>
                <div class="badges-row">
                  <span v-if="tx.has_return" class="badge badge-retur-flag" title="Ada pengembalian/retur barang">
                    ↩ Ada Retur{{ tx.return_total_qty ? ` (${tx.return_total_qty} pcs)` : '' }}
                  </span>
                  <span v-if="tx.type === 'Invoice'" class="badge" :class="parseFloat(tx.remaining) <= 0 ? 'badge-lunas' : 'badge-tempo'">
                    {{ parseFloat(tx.remaining) <= 0 ? 'Lunas' : 'Sisa Rp ' + fmt(tx.remaining) }}
                  </span>
                  <span v-else class="badge badge-lunas">Pembayaran Masuk</span>
                </div>
              </div>
              <div class="inv-cust">{{ tx.customer_name || tx.customer }}</div>
              <div class="inv-bottom">
                <span>{{ tx.invoice_date || tx.tx_date || tx.date }}</span>
                <strong>{{ tx.type === 'Invoice' ? 'Rp ' + fmt(tx.total_due) : '+ Rp ' + fmt(tx.amount) }}</strong>
              </div>
              <div v-if="tx.has_return && tx.total_returned_amount" class="inv-return-info">
                <small class="text-danger">Potongan retur: - Rp {{ fmt(tx.total_returned_amount) }}</small>
              </div>
              <small v-if="tx.type === 'Pelunasan' && tx.method" class="payment-method">
                Metode: {{ tx.method }}
              </small>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';
import { formatNumber } from '../utils/format.js';

const authStore = useAuthStore();
const appStore = useAppStore();

const tab = ref('pos');
const customers = ref([]);
const stock = ref([]);
const invoices = ref([]);
const payments = ref([]);
const cart = ref([]);

const selectedCustomerId = ref('');
const showCustomerDropdown = ref(false);
const customerSearchQuery = ref('');
const customerDropdownRef = ref(null);
const custSearchInputRef = ref(null);
const customerPrices = ref(new Map()); // Map: product_id -> custom_price

function getProductPrice(s) {
  if (selectedCustomerId.value && customerPrices.value.has(s.product_id)) {
    return customerPrices.value.get(s.product_id);
  }
  return s.price || 0;
}

function hasCustomPrice(productId) {
  return selectedCustomerId.value && customerPrices.value.has(productId);
}

const filteredCustomers = computed(() => {
  if (!customerSearchQuery.value) return customers.value;
  const q = customerSearchQuery.value.toLowerCase().trim();
  return customers.value.filter(c =>
    (c.name && String(c.name).toLowerCase().includes(q)) ||
    (c.phone && String(c.phone).includes(q)) ||
    (c.address && String(c.address).toLowerCase().includes(q))
  );
});

function toggleCustomerDropdown() {
  showCustomerDropdown.value = !showCustomerDropdown.value;
  if (showCustomerDropdown.value) {
    customerSearchQuery.value = '';
    setTimeout(() => {
      if (custSearchInputRef.value) custSearchInputRef.value.focus();
    }, 100);
  }
}

async function selectCustomer(c) {
  selectedCustomerId.value = c.id;
  showCustomerDropdown.value = false;
  customerSearchQuery.value = '';
  await loadCustomerPrices(c.id);
  onCustomerChange();
}

function clearCustomerSelection() {
  selectedCustomerId.value = '';
  customerPrices.value.clear();
  // Kembalikan harga cart ke harga reguler
  for (const it of cart.value) {
    it.price = it.defaultPrice || it.price;
    it.isCustomPrice = false;
    if (it.discount > it.qty * it.price) {
      it.discount = it.qty * it.price;
    }
  }
  showCustomerDropdown.value = false;
  customerSearchQuery.value = '';
  onCustomerChange();
}

async function loadCustomerPrices(custId) {
  customerPrices.value.clear();
  if (!custId) return;
  try {
    const res = await apiFetch(`/api/customers/${custId}/prices`);
    if (res?.data && Array.isArray(res.data)) {
      for (const item of res.data) {
        if (item.custom_price !== null && item.custom_price !== undefined && item.custom_price > 0) {
          customerPrices.value.set(item.product_id, item.custom_price);
        }
      }
    }
  } catch (err) {
    console.error('Gagal memuat harga khusus pelanggan:', err);
  }

  // Update harga barang yang sudah terlanjur ada di keranjang
  for (const it of cart.value) {
    if (!it.defaultPrice) it.defaultPrice = it.price;
    if (customerPrices.value.has(it.product_id)) {
      it.price = customerPrices.value.get(it.product_id);
      it.isCustomPrice = true;
    } else {
      it.price = it.defaultPrice;
      it.isCustomPrice = false;
    }
    if (it.discount > it.qty * it.price) {
      it.discount = it.qty * it.price;
    }
  }
}

function handleClickOutside(e) {
  if (customerDropdownRef.value && !customerDropdownRef.value.contains(e.target)) {
    showCustomerDropdown.value = false;
  }
}

const search = ref('');
const payMethod = ref('Tunai');
const paidAmount = ref(0);
const formattedPaidAmount = computed(() => {
  if (paidAmount.value === 0 || !paidAmount.value) return '';
  return formatNumber(paidAmount.value);
});

function onPaidAmountInput(e) {
  const el = e.target;
  const raw = el.value.replace(/\D/g, '');
  paidAmount.value = raw ? parseInt(raw, 10) : 0;
  // restore cursor: reformat and put cursor at end of digits
  const formatted = paidAmount.value ? formatNumber(paidAmount.value) : '';
  el.value = formatted;
}
const txNote = ref('');
const submitting = ref(false);
const loadingStock = ref(true);
const loadingInvoices = ref(false);
const activeInvoice = ref(null);
const transactions = computed(() => [
  ...invoices.value.map(invoice => ({
    ...invoice,
    type: 'Invoice',
    title: invoice.title || `Faktur #${invoice.invoice_no}`
  })),
  ...payments.value.filter(payment => payment.type === 'Pelunasan')
].sort((a, b) => {
  const dateA = a.invoice_date || a.tx_date || a.date || '';
  const dateB = b.invoice_date || b.tx_date || b.date || '';
  return new Date(dateB) - new Date(dateA);
}));

const selectedCustomer = computed(() => customers.value.find(c => c.id === selectedCustomerId.value));

const filteredStock = computed(() => {
  const q = search.value.toLowerCase().trim();
  return stock.value.filter(s => !q || (s.product_name || '').toLowerCase().includes(q));
});

const cartGrossSubtotal = computed(() => cart.value.reduce((s, it) => s + (it.qty * it.price), 0));
const cartTotalDiscount = computed(() => cart.value.reduce((s, it) => s + (Number(it.discount) || 0), 0));
const cartNetSubtotal = computed(() => Math.max(0, cartGrossSubtotal.value - cartTotalDiscount.value));
const cartTotal = computed(() => cartNetSubtotal.value);
const totalDue = computed(() => cartNetSubtotal.value + parseFloat(selectedCustomer.value?.balance || 0));

function fmt(n) {
  return formatNumber(n);
}

function onItemDiscountInput(item, event) {
  const raw = event.target.value.replace(/\D/g, '');
  const val = raw ? parseInt(raw, 10) : 0;
  const maxDisc = item.qty * item.price;
  item.discount = Math.min(val, maxDisc);
  event.target.value = item.discount ? formatNumber(item.discount) : '';
  if (payMethod.value !== 'Tempo') {
    paidAmount.value = totalDue.value;
  }
}

function cartQtyOf(prodId) {
  return cart.value.find(i => i.product_id === prodId)?.qty || 0;
}

function isValidImage(img) {
  if (!img || typeof img !== 'string') return false;
  const s = img.trim();
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function addToCart(s) {
  const effectivePrice = getProductPrice(s);
  const isCustom = hasCustomPrice(s.product_id);
  const ex = cart.value.find(i => i.product_id === s.product_id);
  if (ex) {
    if (ex.qty < s.stock) ex.qty++;
    else appStore.showToast('Jumlah mencapai batas stok Anda', 'warning');
  } else {
    cart.value.push({
      product_id: s.product_id,
      product_name: s.product_name,
      emoji: s.emoji || '📦',
      image: s.image || '',
      defaultPrice: s.price || 0,
      price: effectivePrice,
      isCustomPrice: isCustom,
      qty: 1,
      maxStock: s.stock,
      discount: 0,
      showDisc: false
    });
  }
  if (payMethod.value !== 'Tempo') {
    paidAmount.value = totalDue.value;
  }
}

function decCart(idx) {
  if (cart.value[idx].qty > 1) {
    cart.value[idx].qty--;
    if (cart.value[idx].discount > cart.value[idx].qty * cart.value[idx].price) {
      cart.value[idx].discount = cart.value[idx].qty * cart.value[idx].price;
    }
  } else {
    cart.value.splice(idx, 1);
  }
  if (payMethod.value !== 'Tempo') {
    paidAmount.value = totalDue.value;
  }
}

function onQtyFocus(e) {
  if (e && e.target && typeof e.target.select === 'function') {
    e.target.select();
  }
}

function onQtyInput(it) {
  // Hanya batasi jika melebihi stok maksimal agar user bisa bebas menghapus/mengetik angka baru tanpa langsung dipaksa kembali ke 1
  if (it.qty > it.maxStock) {
    it.qty = it.maxStock;
  }
  if (it.discount > (it.qty || 0) * it.price) {
    it.discount = (it.qty || 0) * it.price;
  }
  if (payMethod.value !== 'Tempo') {
    paidAmount.value = totalDue.value;
  }
}

function onQtyBlur(it) {
  // Saat selesai mengetik / pindah kursor, pastikan angka valid minimal 1 dan tidak lebih dari maxStock
  if (!it.qty || it.qty < 1 || isNaN(it.qty)) {
    it.qty = 1;
  } else if (it.qty > it.maxStock) {
    it.qty = it.maxStock;
  }
  if (it.discount > it.qty * it.price) {
    it.discount = it.qty * it.price;
  }
  if (payMethod.value !== 'Tempo') {
    paidAmount.value = totalDue.value;
  }
}

function clampQty(it) {
  onQtyBlur(it);
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
    const [invoiceRes, historyRes] = await Promise.all([
      apiFetch('/api/invoices?limit=50'),
      apiFetch('/api/history')
    ]);
    invoices.value = invoiceRes.data || [];
    payments.value = historyRes.data || [];
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
        paid_amount: payMethod.value === 'Tempo' ? 0 : Math.min(Number(paidAmount.value) || 0, totalDue.value),
        note: (txNote.value ? txNote.value + ' ' : '') + (paidAmount.value > totalDue.value ? `(Diterima Rp ${fmt(paidAmount.value)}, Kembalian Rp ${fmt(paidAmount.value - totalDue.value)})` : '').trim(),
        client_key: clientKey,
        items: cart.value.map(it => ({
          product_id: it.product_id,
          qty: Number(it.qty) || 1,
          price: Number(it.price) || 0,
          discount: Number(it.discount) || 0
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
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.pos-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 90px;
}
.tabs {
  display: flex;
  gap: 8px;
}
.tab-btn {
  flex: 1;
  padding: 11px 14px;
  border-radius: var(--radius-card, 12px);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.pos-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pos-section-card {
  padding: 16px;
  border-radius: var(--radius-card, 12px);
}

.sec-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-main);
  margin-bottom: 12px;
}
.sec-title-bar .sec-title {
  margin-bottom: 0;
}

.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stock-summary-badge {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.cust-select-dropdown {
  position: relative;
  width: 100%;
}

.cust-trigger {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cust-trigger:hover {
  border-color: #93c5fd;
}
.cust-trigger.is-open {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.cust-trigger.has-selected {
  background: var(--bg-card);
}

.trigger-content {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.placeholder {
  color: var(--text-muted);
  font-size: 13px;
}
.selected-cust-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cust-main-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-warning-tag {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.cust-phone-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.trigger-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.btn-clear-cust {
  background: var(--bg-app);
  border: none;
  color: var(--text-muted);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-clear-cust:hover {
  background: #fee2e2;
  color: #dc2626;
}
.dropdown-chevron {
  font-size: 10px;
  color: var(--text-muted);
}

/* Dropdown Menu Popup */
.cust-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 500;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cust-search-box {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border-color);
}
.cust-search-icon {
  position: absolute;
  left: 18px;
  color: var(--text-muted);
  pointer-events: none;
}
.cust-search-input {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}
.cust-search-input:focus {
  border-color: var(--primary);
}
.btn-clear-cust-search {
  position: absolute;
  right: 16px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.cust-options-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.no-cust-found {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.cust-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.03);
  transition: background 0.15s ease;
}
.cust-option-item:hover {
  background: var(--bg-app);
}
.cust-option-item.active {
  background: #eff6ff;
  border-left: 3px solid var(--primary);
}
.cust-option-item.has-debt {
  background: #fffbfb;
}
.cust-option-item.has-debt:hover {
  background: #fef2f2;
}

.opt-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.opt-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
.opt-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.opt-right {
  flex-shrink: 0;
  margin-left: 8px;
}
.opt-debt-badge {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.opt-lunas-badge {
  background: #dcfce7;
  color: #15803d;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.pos-select {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.pos-select:focus {
  border-color: var(--primary);
}

.cust-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  font-size: 12px;
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-app);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.meta-lbl {
  color: var(--text-muted);
  font-size: 11px;
}
.meta-val {
  color: var(--text-main);
  font-size: 12px;
}
.meta-has-balance .meta-val {
  color: #dc2626;
  font-size: 13px;
}

/* Search bar styling */
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 40px;
  padding: 0 36px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.search-input:focus {
  border-color: var(--primary);
  background: var(--bg-card);
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

/* Stock Tiles Grid */
.stock-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
  padding: 2px;
}
.stock-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: center;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.stock-tile:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: #93c5fd;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}
.stock-tile.chosen {
  border-color: var(--primary);
  background: #f0f7ff;
}
.stock-tile.zero {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(80%);
}

.tile-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--bg-app);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tile-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stock-emoji {
  font-size: 26px;
}
.tile-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 100%;
}
.stock-name {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-main);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 28px;
}
.tile-meta-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.stock-qty {
  font-size: 11px;
  font-weight: 700;
  color: #15803d;
}
.stock-qty.danger {
  color: #dc2626;
}
.stock-price {
  font-size: 12px;
  font-weight: 800;
  color: var(--primary);
}
.custom-price-highlight {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: #d97706;
}
.disc-strike {
  text-decoration: line-through;
  opacity: 0.6;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.custom-badge-tag {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  display: inline-block;
  margin-left: 4px;
  text-transform: uppercase;
}
.stock-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--primary);
  color: #fff;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.35);
}

/* Cart & Checkout */
.cart-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.cart-row {
  display: flex;
  flex-direction: column;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-color);
  gap: 8px;
}
.cart-main-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.cart-name {
  font-weight: 700;
  font-size: 13px;
}
.cart-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.qty-btn-group {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px;
  flex-shrink: 0;
}
.qty-btn-group button {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background: var(--bg-card);
  color: var(--text-main);
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.qty-btn-group input {
  width: 58px;
  min-width: 54px;
  padding: 0 4px;
  text-align: center;
  border: none;
  background: transparent;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-main);
  box-sizing: border-box;
  -moz-appearance: textfield;
}
.qty-btn-group input::-webkit-outer-spin-button,
.qty-btn-group input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.cart-subtotal {
  font-weight: 800;
  font-size: 13px;
  min-width: 76px;
  text-align: right;
  color: var(--text-main);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.item-disc-tag {
  font-size: 10.5px;
  font-weight: 700;
  color: #dc2626;
}

/* Kolom Input Diskon Item (Permanen & Rapi) */
.cart-discount-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(245, 158, 11, 0.05);
  border: 1px dashed rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  padding: 5px 10px;
}
[data-theme="dark"] .cart-discount-input-row {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.35);
}
.disc-label-group {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d97706;
}
[data-theme="dark"] .disc-label-group {
  color: #fbbf24;
}
.disc-icon {
  flex-shrink: 0;
}
.disc-title {
  font-size: 11.5px;
  font-weight: 600;
}
.disc-input-box {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px 8px;
  height: 28px;
  transition: border-color 0.15s ease;
}
.disc-input-box:focus-within {
  border-color: #d97706;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}
.disc-prefix {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
}
.disc-field {
  width: 75px;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  outline: none;
  padding: 0;
  text-align: right;
}
.btn-clear-disc {
  background: transparent;
  border: none;
  color: #dc2626;
  font-size: 11px;
  cursor: pointer;
  padding: 0 3px;
  font-weight: 800;
}

.checkout-box {
  border-top: 2px solid var(--border-color);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sum-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
}
.sum-row.total {
  padding: 8px 0;
  font-size: 15px;
  border-top: 1px dashed var(--border-color);
  margin-top: 6px;
  color: var(--text-main);
}
.total-big {
  color: var(--primary);
  font-size: 18px;
}

.pay-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-quick {
  border: none;
  background: none;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 12px;
}
.currency-input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 16px;
  font-weight: 800;
}
.change-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #047857;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 4px;
}
.btn-checkout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  margin-top: 6px;
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.3);
  transition: all 0.15s ease;
}
.btn-checkout:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-checkout:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 32px 16px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.empty-icon {
  color: var(--text-muted);
  opacity: 0.6;
}

/* History */
.inv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inv-card {
  padding: 14px 16px;
  border-radius: var(--radius-card, 12px);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.inv-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.inv-card.payment-card {
  cursor: default;
}
.payment-method {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
}
.inv-top, .inv-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.inv-cust {
  margin: 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.badge-lunas {
  background: rgba(16, 185, 129, 0.15);
  color: #059669;
}
.badge-tempo {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}
.badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.badge-retur-flag {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  font-weight: 700;
}
.has-return-card {
  border-left: 4px solid #ef4444;
}
.inv-return-info {
  margin-top: 4px;
  font-weight: 600;
}

/* Modal */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}
.sheet-content {
  background: var(--bg-card);
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  padding: 18px;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-close {
  background: none;
  border: none;
  cursor: pointer;
}
</style>
