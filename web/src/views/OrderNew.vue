<template>
  <div class="order-new-page">
    <div class="form-card card">
      <div class="section-title">Informasi Pesanan</div>

      <div class="form-group">
        <label>Tanggal Order *</label>
        <input 
          v-model="form.order_date" 
          type="date" 
          required 
        />
      </div>

      <div class="form-group">
        <div class="label-with-action">
          <label>Pilih Pelanggan *</label>
          <button type="button" class="btn-text-action" @click="openQuickCustomerModal">
            <Icon name="plus" size="14" />
            <span>Pelanggan Baru</span>
          </button>
        </div>
        <div class="cust-select-wrapper">
          <select v-model="form.customer_id" required @change="onCustomerChange">
            <option value="">-- Pilih Pelanggan --</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">
              {{ c.name }} ({{ c.phone || 'Tanpa No. Telp' }})
            </option>
          </select>
        </div>
      </div>

      <!-- Info Pelanggan Terpilih -->
      <div v-if="selectedCustomer" class="customer-info-box">
        <div><strong>Alamat:</strong> {{ selectedCustomer.address || '-' }}</div>
        <div><strong>No Telp:</strong> {{ selectedCustomer.phone || '-' }}</div>
        <div><strong>Piutang Saat Ini:</strong> Rp {{ formatNumber(selectedCustomer.balance) }}</div>
        <div><strong>Batas Kredit:</strong> {{ selectedCustomer.credit_limit > 0 ? 'Rp ' + formatNumber(selectedCustomer.credit_limit) : 'Tanpa Batas' }}</div>
      </div>

      <div class="form-group">
        <label>Catatan (Opsional)</label>
        <input v-model="form.note" type="text" placeholder="Contoh: Titip di pos depan" />
      </div>
    </div>

    <!-- Rincian Barang -->
    <div class="items-card card">
      <div class="items-header">
        <div class="section-title">Detail Barang ({{ form.items.length }})</div>
      </div>

      <!-- Dropdown Pilih Barang Cepat dengan Pencarian Langsung -->
      <div class="quick-product-select-box">
        <label class="qp-label">Pilih & Tambah Barang dari Menu:</label>
        
        <!-- Search bar instan untuk memfilter dropdown -->
        <div class="qp-search-wrap">
          <Icon name="search" size="14" class="qp-search-icon" />
          <input
            v-model="dropdownSearchQuery"
            type="text"
            placeholder="Ketik nama produk untuk menyaring..."
            class="qp-search-input"
          />
          <button
            v-if="dropdownSearchQuery"
            type="button"
            class="qp-search-clear"
            @click="dropdownSearchQuery = ''"
            title="Bersihkan pencarian"
          >
            ×
          </button>
        </div>

        <div class="qp-row">
          <select v-model="selectedProductId" class="qp-select" @change="onDropdownProductSelect">
            <option value="">-- Pilih Barang ({{ dropdownFilteredProducts.length }} tersedia) --</option>
            <option
              v-for="p in dropdownFilteredProducts"
              :key="p.id"
              :value="p.id"
            >
              {{ p.emoji || '📦' }} {{ p.name }} (Stok: {{ p.stock }}) - Rp {{ formatNumber(getCustomerPrice(p.id, p.price)) }} {{ parseInt(p.stock, 10) <= 0 ? ' [HABIS - tetap bisa order]' : '' }}
            </option>
          </select>
          <button type="button" class="btn-browse-modal" @click="showItemSheet = true" title="Buka Daftar Visual Barang">
            <Icon name="search" size="15" />
            <span>Katalog</span>
          </button>
        </div>
      </div>

      <div v-if="form.items.length === 0" class="empty-items">
        Belum ada barang dipilih. Silakan pilih barang dari menu dropdown di atas.
      </div>

      <div v-else class="items-list">
        <div
          v-for="(item, index) in form.items"
          :key="item.product_id"
          class="item-card"
          :class="{ 'item-card-warning': item.qty > item.stock || item.stock <= 0 }"
        >
          <div class="item-head">
            <span class="item-name">{{ item.emoji }} {{ item.name }}</span>
            <button class="btn-remove" @click="removeItem(index)" title="Hapus Barang">
              <Icon name="trash" size="16" />
            </button>
          </div>
          
          <div class="item-inputs">
            <div class="input-col">
              <label>Qty</label>
              <input
                v-model.number="item.qty"
                type="number"
                min="1"
                inputmode="numeric"
                :class="{ 'input-error': item.qty > item.stock || item.stock <= 0 }"
                @input="calculateSubtotal(item)"
              />
            </div>

            <div class="input-col">
              <label>Harga Satuan</label>
              <input
                :value="formatNumber(item.price)"
                type="text"
                disabled
              />
            </div>

            <div class="input-col">
              <label>Diskon (Rp)</label>
              <input
                v-model.number="item.discount"
                type="number"
                min="0"
                inputmode="numeric"
                @input="calculateSubtotal(item)"
              />
            </div>
          </div>

          <!-- Alert jika jumlah yang diminta melebihi sisa stok -->
          <div v-if="item.qty > item.stock" class="item-stock-alert">
            ⚠️ Stok kurang {{ item.qty - Math.max(item.stock, 0) }} (tersedia {{ Math.max(item.stock, 0) }}). Order tetap bisa disimpan.
          </div>

          <div class="item-footer">
            <small class="stock-info" :class="{ 'text-danger': item.stock <= 0 }">
              Sisa stok: {{ item.stock }}
            </small>
            <span class="line-total">Subtotal: Rp {{ formatNumber(item.subtotal) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Total & Tombol Aksi Simpan / Bayar Langsung -->
    <div class="summary-card card">
      <div class="total-row">
        <span>Total Pesanan:</span>
        <span class="total-amount">Rp {{ formatNumber(totalOrder) }}</span>
      </div>

      <div class="summary-actions">
        <!-- Tombol Bayar Langsung (Kasir / Checkout Langsung) -->
        <button
          type="button"
          class="btn-pay-direct"
          @click="openDirectPayModal"
          :disabled="loading || form.items.length === 0"
        >
          <Icon name="dollar-sign" size="18" />
          <span>Bayar Langsung (Kasir)</span>
        </button>

        <!-- Tombol Simpan Order Biasa (Tanpa Bayar Sekarang) -->
        <button
          type="button"
          class="btn-submit-order"
          @click="handleSubmit"
          :disabled="loading || form.items.length === 0"
        >
          <Icon name="check" size="18" v-if="!loading" />
          <span>{{ loading ? 'Menyimpan...' : 'Simpan Order Saja' }}</span>
        </button>
      </div>
    </div>

    <!-- Bottom Sheet Pemilihan Barang -->
    <div v-if="showItemSheet" class="sheet-overlay" @click.self="showItemSheet = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Pilih Barang</h3>
          <button class="btn-close" @click="showItemSheet = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <input
          v-model="productSearch"
          type="text"
          placeholder="Cari nama barang..."
          class="sheet-search"
        />

        <!-- Filter Kategori Dinamis -->
        <div class="category-tabs-sheet">
          <button
            v-for="cat in productCategories"
            :key="cat"
            type="button"
            class="cat-chip"
            :class="{ active: selectedCategory === cat }"
            @click="selectedCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <div class="product-picker-list">
          <div
            v-for="p in filteredProducts"
            :key="p.id"
            class="product-picker-item"
            @click="selectProduct(p)"
          >
            <div class="picker-left">
              <span class="p-emoji">{{ p.emoji || '📦' }}</span>
              <div class="p-info">
                <strong>{{ p.name }}</strong>
                <small>Stok: {{ p.stock }} | Rp {{ formatNumber(getCustomerPrice(p.id, p.price)) }}</small>
              </div>
            </div>
            <button class="btn-pick" title="Pilih Barang">
              <Icon name="plus" size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Pelanggan Baru Cepat -->
    <div v-if="showQuickCustomerModal" class="sheet-overlay" @click.self="showQuickCustomerModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Pelanggan Baru</h3>
          <button class="sheet-close" @click="showQuickCustomerModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan / Toko *</label>
            <input v-model="quickCust.name" type="text" placeholder="Contoh: Toko Berkah Jaya" required />
          </div>

          <div class="form-group">
            <label>Alamat Lengkap</label>
            <input v-model="quickCust.address" type="text" placeholder="Jl. Raya No. ..." />
          </div>

          <div class="form-group">
            <label>Nomor Telepon (WhatsApp)</label>
            <input v-model="quickCust.phone" type="text" placeholder="08..." />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Batas Kredit (Rp)</label>
              <input v-model.number="quickCust.credit_limit" type="number" min="0" placeholder="0 = Bebas" />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input v-model.number="quickCust.term_days" type="number" min="1" />
            </div>
          </div>

          <button
            type="button"
            class="btn-save-cust"
            @click="submitQuickCustomer"
            :disabled="quickCustLoading || !quickCust.name"
          >
            <Icon name="check" size="16" v-if="!quickCustLoading" />
            <span>{{ quickCustLoading ? 'Menyimpan Pelanggan...' : 'Simpan & Pilih Pelanggan Ini' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Bayar Langsung (Kasir) & Cicilan / Sebagian -->
    <div v-if="showDirectPayModal" class="sheet-overlay" @click.self="showDirectPayModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Pembayaran Langsung (Kasir)</h3>
          <button class="sheet-close" @click="showDirectPayModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <!-- Rincian Total Belanja & Bon Sebelumnya -->
          <div class="calc-box">
            <div class="calc-row">
              <span>Total Belanja Sekarang:</span>
              <strong>Rp {{ formatNumber(totalOrder) }}</strong>
            </div>
            <div class="calc-row">
              <span>Hutang/Bon Sebelumnya:</span>
              <strong>Rp {{ formatNumber(customerPreviousBalance) }}</strong>
            </div>
            <div class="calc-row total-row-calc">
              <span>Total Keseluruhan Tagihan:</span>
              <strong class="total-big-calc">Rp {{ formatNumber(directPayTotalDue) }}</strong>
            </div>
          </div>

          <!-- Opsi Metode Pembayaran -->
          <div class="form-group">
            <label>Metode Pembayaran *</label>
            <select v-model="directPayMethod" @change="onDirectPayMethodChange">
              <option value="Tunai">Tunai</option>
              <option value="Transfer">Transfer Bank</option>
              <option value="Tempo">Tempo (Bayar Nanti Penuh)</option>
            </select>
          </div>

          <!-- Input Jumlah Bayar -->
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label>Jumlah Bayar (Rp) *</label>
              <span style="font-size:11px; color:var(--text-muted);">Bisa bayar penuh atau sebagian (cicil)</span>
            </div>
            <input
              v-model="formattedDirectPaidAmount"
              type="text"
              inputmode="numeric"
              :disabled="directPayMethod === 'Tempo'"
              placeholder="0"
            />
            <!-- Quick Preset Buttons -->
            <div class="quick-pay-presets" v-if="directPayMethod !== 'Tempo'">
              <button type="button" class="btn-preset" @click="setDirectPaidAmount(directPayTotalDue)">Bayar Lunas (100%)</button>
              <button type="button" class="btn-preset" @click="setDirectPaidAmount(Math.round(directPayTotalDue / 2))">Bayar 50%</button>
              <button type="button" class="btn-preset" @click="setDirectPaidAmount(0)">Bayar Nanti (Rp 0)</button>
            </div>
          </div>

          <!-- Sisa Tagihan / Hutang Berikutnya Real-time -->
          <div class="balance-preview-box" :class="directPayRemaining <= 0 ? 'lunas-box' : 'tempo-box'">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span>{{ directPayRemaining <= 0 ? 'Status Pembayaran:' : 'Sisa Tagihan / Hutang Berikutnya:' }}</span>
              <span class="badge" :class="directPayRemaining <= 0 ? 'badge-dikirim' : 'badge-dibatalkan'">
                {{ directPayRemaining <= 0 ? 'LUNAS' : (directPaidAmount > 0 ? 'SEBAGIAN / CICIL' : 'TEMPO / BELUM BAYAR') }}
              </span>
            </div>
            <strong class="bal-huge">Rp {{ formatNumber(directPayRemaining) }}</strong>
            <small v-if="directPayRemaining > 0" style="font-size:11px; opacity:0.85; display:block; margin-top:4px;">
              * Sisa Rp {{ formatNumber(directPayRemaining) }} akan otomatis tersimpan sebagai piutang pelanggan untuk pembayaran berikutnya.
            </small>
          </div>

          <div class="form-group">
            <label>Catatan Pembayaran (Opsional)</label>
            <input v-model="directPayNote" type="text" placeholder="Contoh: Titip tunai / Transfer Mandiri" />
          </div>

          <button
            type="button"
            class="btn-save-and-pay"
            @click="submitDirectPay"
            :disabled="directPayLoading || directPaidAmount > directPayTotalDue"
          >
            <Icon name="check" size="18" v-if="!directPayLoading" />
            <span>{{ directPayLoading ? 'Memproses Pesanan & Bayar...' : '✓ Selesaikan Pesanan & Terbitkan Invoice' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Pratinjau Invoice Hasil Bayar Langsung -->
    <div v-if="completedInvoice" class="sheet-overlay" @click.self="finishAndCloseInvoice">
      <div class="sheet-content sheet-inv">
        <div class="sheet-close-bar">
          <button class="sheet-close" @click="finishAndCloseInvoice"><Icon name="x" size="16" /> Selesai & Kembali</button>
        </div>
        <InvoiceView :invoice="completedInvoice" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import { useOfflineStore } from '../stores/offline.js';
import { cacheCustomers, cacheProducts, getCachedCustomers, getCachedProducts, queueOfflineOrder } from '../db.js';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const offlineStore = useOfflineStore();

const orderDateInput = ref(null);

function triggerNativeDate() {
  if (orderDateInput.value) {
    if (typeof orderDateInput.value.showPicker === 'function') {
      orderDateInput.value.showPicker();
    } else {
      orderDateInput.value.focus();
    }
  }
}

const loading = ref(false);
const customers = ref([]);
const products = ref([]);
const customerPrices = ref([]);
const showItemSheet = ref(false);
const productSearch = ref('');
const dropdownSearchQuery = ref('');
const selectedProductId = ref('');

const dropdownFilteredProducts = computed(() => {
  const q = dropdownSearchQuery.value.toLowerCase().trim();
  if (!q) return products.value;
  return products.value.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.category && p.category.toLowerCase().includes(q))
  );
});

function onDropdownProductSelect() {
  if (!selectedProductId.value) return;
  const p = products.value.find(prod => prod.id === selectedProductId.value);
  if (p) {
    selectProduct(p);
  }
  selectedProductId.value = ''; // Reset select dropdown setelah dipilih
}

// State Quick Add Customer
const showQuickCustomerModal = ref(false);
const quickCustLoading = ref(false);
const quickCust = ref({
  name: '',
  address: '',
  phone: '',
  credit_limit: 0,
  term_days: 14
});

function openQuickCustomerModal() {
  quickCust.value = {
    name: '',
    address: '',
    phone: '',
    credit_limit: 0,
    term_days: 14
  };
  showQuickCustomerModal.value = true;
}

async function submitQuickCustomer() {
  if (!quickCust.value.name.trim()) {
    appStore.showToast('Nama pelanggan wajib diisi', 'warning');
    return;
  }

  quickCustLoading.value = true;
  try {
    const branchId = authStore.user?.branch_id || 'BR-SOLO';
    const payload = {
      name: quickCust.value.name.trim(),
      address: quickCust.value.address.trim(),
      phone: quickCust.value.phone.trim(),
      branch_id: branchId,
      credit_limit: Number(quickCust.value.credit_limit) || 0,
      term_days: Number(quickCust.value.term_days) || 14,
      active: true
    };

    let newAddedCust = null;
    if (navigator.onLine) {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      newAddedCust = res.data;
    } else {
      // Offline fallback: simpan dengan ID lokal sementara
      newAddedCust = {
        id: 'cust-local-' + Date.now(),
        ...payload,
        balance: 0
      };
    }

    // Tambahkan ke daftar pilihan pelanggan lokal & IndexedDB
    customers.value.unshift(newAddedCust);
    await cacheCustomers(customers.value);

    // Langsung pilih pelanggan baru ini pada form order
    form.value.customer_id = newAddedCust.id;
    onCustomerChange();

    appStore.showToast(`Pelanggan "${newAddedCust.name}" berhasil ditambahkan & dipilih`, 'success');
    showQuickCustomerModal.value = false;
  } catch (err) {
    appStore.showToast(err.message || 'Gagal menambahkan pelanggan', 'error');
  } finally {
    quickCustLoading.value = false;
  }
}

const form = ref({
  customer_id: '',
  order_date: new Date().toISOString().substring(0, 10),
  note: '',
  items: []
});

const selectedCustomer = computed(() => {
  return customers.value.find(c => c.id === form.value.customer_id);
});

const selectedCategory = ref('Semua');

const productCategories = computed(() => {
  const cats = new Set();
  products.value.forEach(p => {
    if (p.category && p.category.trim()) {
      cats.add(p.category.trim());
    }
  });
  const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b));
  return ['Semua', ...sorted];
});

const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value !== 'Semua') {
    list = list.filter(p => p.category === selectedCategory.value);
  }
  const q = productSearch.value.toLowerCase().trim();
  if (q) {
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  return list;
});

const totalOrder = computed(() => {
  return form.value.items.reduce((sum, it) => sum + (it.subtotal || 0), 0);
});

function getCustomerPrice(productId, defaultPrice) {
  if (!form.value.customer_id) return defaultPrice;
  const cp = customerPrices.value.find(c => c.customer_id === form.value.customer_id && c.product_id === productId);
  return cp && cp.price ? parseFloat(cp.price) : parseFloat(defaultPrice);
}

function onCustomerChange() {
  // Update harga barang jika ada harga khusus pelanggan
  form.value.items.forEach(it => {
    it.price = getCustomerPrice(it.product_id, it.default_price);
    calculateSubtotal(it);
  });
}

function selectProduct(p) {
  const stock = parseInt(p.stock, 10) || 0;
  const existing = form.value.items.find(it => it.product_id === p.id);
  if (existing) {
    existing.qty += 1;
    calculateSubtotal(existing);
    if (existing.qty > stock) {
      appStore.showToast(`Stok ${p.name} kurang ${existing.qty - Math.max(stock, 0)} (order tetap disimpan)`, 'warning');
    }
  } else {
    if (stock <= 0) {
      appStore.showToast(`Stok ${p.name} kosong, order tetap bisa disimpan`, 'warning');
    }
    const unitPrice = getCustomerPrice(p.id, p.price);
    const newItem = {
      product_id: p.id,
      name: p.name,
      emoji: p.emoji || '📦',
      stock: stock,
      default_price: parseFloat(p.price),
      price: unitPrice,
      qty: 1,
      discount: 0,
      subtotal: unitPrice
    };
    form.value.items.push(newItem);
  }
  showItemSheet.value = false;
}

function removeItem(index) {
  form.value.items.splice(index, 1);
}

function calculateSubtotal(item) {
  const q = item.qty || 1;
  const p = item.price || 0;
  const d = item.discount || 0;
  item.subtotal = (q * p) - d;
}

async function fetchOptions() {
  try {
    if (navigator.onLine) {
      const res = await apiFetch('/api/orders/options');
      customers.value = res.data?.customers || [];
      products.value = res.data?.products || [];
      customerPrices.value = res.data?.customerPrices || [];

      // Jika data products kosong dari endpoint options, ambil dari /api/products
      if (products.value.length === 0) {
        const prodRes = await apiFetch('/api/products');
        if (prodRes.data && prodRes.data.length > 0) {
          products.value = prodRes.data;
        }
      }

      // Jika data customers kosong, ambil dari /api/customers
      if (customers.value.length === 0) {
        const custRes = await apiFetch('/api/customers');
        if (custRes.data && custRes.data.length > 0) {
          customers.value = custRes.data;
        }
      }

      // Update IndexedDB cache untuk mode offline
      if (customers.value.length > 0) await cacheCustomers(customers.value);
      if (products.value.length > 0) await cacheProducts(products.value);
    } else {
      // Ambil dari cache IndexedDB
      customers.value = await getCachedCustomers();
      products.value = await getCachedProducts();
    }
  } catch (err) {
    // Fallback bila error jaringan
    const cachedC = await getCachedCustomers();
    const cachedP = await getCachedProducts();
    if (cachedC && cachedC.length > 0) customers.value = cachedC;
    if (cachedP && cachedP.length > 0) products.value = cachedP;
  }
}

async function handleSubmit() {
  if (!form.value.customer_id) {
    appStore.showToast('Silakan pilih pelanggan terlebih dahulu', 'warning');
    return;
  }
  if (form.value.items.length === 0) {
    appStore.showToast('Minimal pilih 1 barang', 'warning');
    return;
  }


  loading.value = true;
  const clientKey = crypto.randomUUID();

  const payload = {
    customer_id: form.value.customer_id,
    order_date: form.value.order_date,
    note: form.value.note,
    client_key: clientKey,
    items: form.value.items.map(it => ({
      product_id: it.product_id,
      qty: it.qty,
      discount: it.discount || 0
    }))
  };

  // INSTANT OPTIMISTIC SAVE: Pengguna langsung melihat sukses tanpa menunggu Google Sheets
  appStore.showToast('Pesanan berhasil disimpan! (Menyinkronkan di latar belakang...)', 'success');
  appStore.startSync();

  // Jalankan sinkronisasi di latar belakang
  (async () => {
    try {
      if (navigator.onLine) {
        await apiFetch('/api/orders', {
          method: 'POST',
          headers: { 'Idempotency-Key': clientKey },
          body: JSON.stringify(payload)
        });
      } else {
        await queueOfflineOrder({
          ...payload,
          customer_name: selectedCustomer.value?.name,
          total_amount: totalOrder.value
        });
        await offlineStore.loadQueue();
      }
    } catch (err) {
      console.error('[BACKGROUND ORDER SYNC ERROR]:', err);
      appStore.showToast(`Gagal sync order: ${err.message}`, 'error');
    } finally {
      appStore.finishSync();
    }
  })();

  // Langsung navigasi seketika (< 0.1 detik)
  router.push('/orders');
  loading.value = false;
}

// ==========================================
// State & Logika Bayar Langsung (Kasir / Checkout Langsung)
// ==========================================
const showDirectPayModal = ref(false);
const directPayLoading = ref(false);
const directPayMethod = ref('Tunai');
const directPaidAmount = ref(0);
const directPayNote = ref('');
const completedInvoice = ref(null);

const customerPreviousBalance = computed(() => {
  return selectedCustomer.value ? parseFloat(selectedCustomer.value.balance || 0) : 0;
});

const directPayTotalDue = computed(() => {
  return totalOrder.value + customerPreviousBalance.value;
});

const directPayRemaining = computed(() => {
  const rem = directPayTotalDue.value - (directPaidAmount.value || 0);
  return Math.max(rem, 0);
});

// Pemisah ribuan otomatis untuk input bayar langsung kasir
const formattedDirectPaidAmount = computed({
  get() {
    if (directPaidAmount.value === 0) return '0';
    return (directPaidAmount.value || '').toLocaleString('id-ID');
  },
  set(val) {
    const raw = String(val).replace(/\D/g, '');
    directPaidAmount.value = raw ? parseInt(raw, 10) : 0;
  }
});

function setDirectPaidAmount(val) {
  directPaidAmount.value = val;
}

function onDirectPayMethodChange() {
  if (directPayMethod.value === 'Tempo') {
    directPaidAmount.value = 0;
  } else {
    directPaidAmount.value = directPayTotalDue.value;
  }
}

function openDirectPayModal() {
  if (!form.value.customer_id) {
    appStore.showToast('Silakan pilih pelanggan terlebih dahulu', 'warning');
    return;
  }
  if (form.value.items.length === 0) {
    appStore.showToast('Minimal pilih 1 barang', 'warning');
    return;
  }

  directPayMethod.value = 'Tunai';
  directPaidAmount.value = directPayTotalDue.value; // Default lunas, bisa diubah sebagian
  directPayNote.value = '';
  showDirectPayModal.value = true;
}

async function submitDirectPay() {
  if (!navigator.onLine) {
    appStore.showToast('Pembayaran langsung membutuhkan koneksi online', 'warning');
    return;
  }

  if (directPaidAmount.value > directPayTotalDue.value) {
    appStore.showToast('Jumlah bayar tidak boleh melebihi total tagihan', 'warning');
    return;
  }

  directPayLoading.value = true;
  const clientKey = crypto.randomUUID();

  try {
    // 1. Simpan Order
    const orderPayload = {
      customer_id: form.value.customer_id,
      order_date: form.value.order_date,
      note: form.value.note,
      client_key: clientKey,
      items: form.value.items.map(it => ({
        product_id: it.product_id,
        qty: it.qty,
        discount: it.discount || 0
      }))
    };

    const resOrder = await apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': clientKey },
      body: JSON.stringify(orderPayload)
    });

    const createdOrder = resOrder.data;
    if (!createdOrder || !createdOrder.id) {
      throw new Error('Gagal mendapatkan ID order baru');
    }

    // 2. Terbitkan Invoice & Catat Pembayaran Sekaligus
    const invIdempotency = crypto.randomUUID();
    const resInvoice = await apiFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': invIdempotency },
      body: JSON.stringify({
        order_id: createdOrder.id,
        pay_method: directPayMethod.value,
        paid_amount: directPaidAmount.value,
        note: directPayNote.value
      })
    });

    appStore.showToast('Order & Pembayaran berhasil diproses!', 'success');
    showDirectPayModal.value = false;

    // 3. Tampilkan InvoiceView lengkap untuk langsung cetak / kirim foto / WA
    try {
      const resFullInv = await apiFetch(`/api/invoices/${resInvoice.data.id}`);
      completedInvoice.value = resFullInv.data;
    } catch (e) {
      completedInvoice.value = resInvoice.data;
    }

  } catch (err) {
    appStore.showToast(err.message || 'Gagal memproses pembayaran langsung', 'error');
  } finally {
    directPayLoading.value = false;
  }
}

function finishAndCloseInvoice() {
  completedInvoice.value = null;
  router.push('/sales');
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchOptions();
});
</script>

<style scoped>
.order-new-page {
  padding: 16px;
  padding-bottom: 90px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.customer-info-box {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.btn-add-item {
  background: var(--primary);
  color: white;
  font-size: 12px;
  padding: 6px 10px;
  min-height: 34px;
}
.empty-items {
  text-align: center;
  padding: 20px;
  font-size: 13px;
  color: var(--text-muted);
}
.items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item-card {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 10px;
}
.item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.item-name {
  font-weight: 600;
  font-size: 13px;
}
.btn-remove {
  background: transparent;
  color: var(--danger);
  min-height: 30px;
  padding: 2px 6px;
  font-size: 16px;
}
.item-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.input-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.input-col input {
  padding: 6px 8px;
  font-size: 14px;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.stock-info {
  color: var(--text-muted);
}
.line-total {
  font-weight: 700;
  color: var(--primary);
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 700;
}
.total-amount {
  font-size: 20px;
  color: var(--primary);
}
.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-pay-direct {
  background: var(--primary);
  color: white;
  width: 100%;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  border: none;
}
.btn-pay-direct:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-submit-order {
  background: var(--bg-app);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  width: 100%;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
}
.btn-submit-order:hover:not(:disabled) {
  background: var(--border-color);
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
.total-row-calc {
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
  font-size: 15px;
}
.total-big-calc {
  color: var(--primary);
  font-size: 18px;
}
.quick-pay-presets {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.btn-preset {
  flex: 1;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-main);
  transition: all 0.2s ease;
}
.btn-preset:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.balance-preview-box {
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
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
.btn-save-and-pay {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  font-weight: 700;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}
.sheet-inv {
  max-width: 540px !important;
}
.sheet-close-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

/* Bottom Sheet Product Picker */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet-content {
  background: var(--bg-card);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.btn-close {
  background: transparent;
  font-size: 18px;
  min-height: 36px;
}
.sheet-search {
  margin-bottom: 12px;
}
.product-picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.product-picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  cursor: pointer;
}
.category-tabs-sheet {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 0 10px 0;
  margin-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}
.category-tabs-sheet::-webkit-scrollbar {
  display: none;
}
.cat-chip {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 20px;
  white-space: nowrap;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cat-chip.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
}
.picker-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.p-emoji {
  font-size: 22px;
}
.p-info {
  display: flex;
  flex-direction: column;
}
.p-info small {
  color: var(--text-muted);
}
.btn-pick {
  background: var(--primary);
  color: white;
  width: 34px;
  min-height: 34px;
  border-radius: 50%;
  font-size: 18px;
}

/* Quick Product Dropdown Styling */
.quick-product-select-box {
  margin-bottom: 14px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.qp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: block;
}

.qp-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.qp-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.qp-search-input {
  width: 100%;
  padding: 8px 30px 8px 32px;
  font-size: 13px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-input);
  color: var(--text-main);
}

.qp-search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  min-height: auto;
}

.item-card-warning {
  border: 1.5px solid var(--danger) !important;
  background: rgba(239, 68, 68, 0.05) !important;
}

.input-error {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
  font-weight: bold;
}

.item-stock-alert {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.text-danger {
  color: var(--danger) !important;
  font-weight: 700;
}

.qp-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.qp-select {
  flex: 1;
  font-weight: 500;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.btn-browse-modal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  padding: 0 14px;
  min-height: 44px;
  cursor: pointer;
  border-radius: var(--radius-input);
  transition: all 0.15s ease;
}

[data-theme="dark"] .btn-browse-modal {
  background: #1e293b;
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn-browse-modal:hover {
  border-color: var(--primary);
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
}

/* Quick Add Customer Styling */
.label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-text-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  min-height: 28px;
  cursor: pointer;
  border: 1px solid var(--primary);
  border-radius: 6px;
  transition: all 0.15s ease;
}

[data-theme="dark"] .btn-text-action {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn-text-action:hover {
  background: var(--primary);
  color: #ffffff;
}

[data-theme="dark"] .btn-text-action:hover {
  background: #38bdf8;
  color: #0f172a;
}

.sheet-close {
  background: transparent;
  font-size: 18px;
  min-height: 36px;
  cursor: pointer;
  border: none;
  color: var(--text-muted);
}

.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.btn-save-cust {
  background: var(--primary);
  color: white;
  width: 100%;
  margin-top: 8px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
}
</style>
