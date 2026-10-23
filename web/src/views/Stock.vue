<template>
  <div class="stock-page">
    <!-- Header Aksi & Filter Kategori -->
    <div class="stock-header">
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari barang..."
          class="search-input"
        />
      </div>
      <button
        v-if="canManageStock"
        class="btn-manage"
        @click="showAddModal = true"
      >
        <Icon name="plus" size="15" />
        <span>Barang</span>
      </button>
      <router-link
        v-if="canManageStock"
        to="/stock/opname"
        class="btn-nav-stock"
      >
        Opname
      </router-link>
      <!-- Tombol Beli PO disembunyikan sementara
      <router-link
        v-if="canManageStock"
        to="/purchases"
        class="btn-nav-stock"
      >
        Beli
      </router-link>
      -->
    </div>

    <!-- Tab Pilihan: Stok Saya vs Stok Admin (Khusus Sales) -->
    <div v-if="isSales" class="stock-source-tabs">
      <button
        class="tab-btn-source"
        :class="{ active: stockSource === 'mine' }"
        @click="switchSource('mine')"
      >
        🎒 Stok Saya (Tersedia: {{ myStockCount }})
      </button>
      <button
        class="tab-btn-source"
        :class="{ active: stockSource === 'admin' }"
        @click="switchSource('admin')"
      >
        🏢 Stok Admin / Pusat
      </button>
    </div>

    <!-- Filter Kategori -->
    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat"
        class="cat-btn"
        :class="{ active: selectedCategory === cat }"
        @click="selectedCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Daftar Stok Barang -->
    <div v-if="loading" class="state-msg">Memuat data stok barang...</div>
    <div v-else-if="filteredProducts.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="package" size="38" /></div>
      <h3>Barang Tidak Ditemukan</h3>
      <p>Tidak ada stok barang yang cocok dengan filter atau pencarian Anda.</p>
    </div>
    <div v-else>
      <div class="stock-list">
        <div
          v-for="p in paginatedProducts"
          :key="p.id"
          class="card stock-card"
          :class="{ 'card-low': p.is_low_stock }"
        >
          <div class="stock-left">
            <div class="prod-thumb">
              <img
                v-if="isValidImage(p.image)"
                :src="p.image"
                :alt="p.name"
                class="prod-img"
                @error="onImgError(p)"
              />
              <span v-else class="stock-emoji">{{ p.emoji || '📦' }}</span>
            </div>
            <div class="stock-details">
              <span class="prod-name">{{ p.name }}</span>
              <small class="prod-cat">{{ p.category }}</small>
              <div class="price-row">
                <span class="price-val">Rp {{ formatNumber(p.price) }}</span>
                <span v-if="p.cost_price" class="cost-price">Beli: Rp {{ formatNumber(p.cost_price) }}</span>
              </div>
            </div>
          </div>

          <div class="stock-right">
            <div class="stock-qty-box">
              <span class="stock-label">Stok</span>
              <span
                class="stock-badge"
                :class="p.is_low_stock ? 'badge-low' : 'badge-safe'"
              >
                {{ p.stock }}
              </span>
            </div>
            <div class="stock-actions-btn" v-if="canManageStock">
              <button
                class="btn-edit"
                @click="openEditModal(p)"
                title="Edit Data & Gambar Barang"
              >
                <Icon name="edit" size="13" />
                <span>Edit</span>
              </button>
              <button
                class="btn-adjust"
                @click="openAdjustModal(p)"
              >
                Koreksi
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination Stok -->
      <div v-if="stockTotalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ (stockCurrentPage - 1) * stockPageSize + 1 }} - {{ Math.min(stockCurrentPage * stockPageSize, filteredProducts.length) }} dari {{ filteredProducts.length }} barang
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="stockCurrentPage === 1"
            @click="stockCurrentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ stockCurrentPage }} / {{ stockTotalPages }}</span>
          <button
            class="btn-page"
            :disabled="stockCurrentPage === stockTotalPages"
            @click="stockCurrentPage++"
          >
            Berikutnya &raquo;
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Edit Produk Lengkap (Admin) -->
    <div v-if="editProduct" class="sheet-overlay" @click.self="editProduct = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Edit Data Barang</h3>
          <button class="sheet-close" @click="editProduct = null">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <!-- Preview & Upload Gambar -->
          <div class="image-upload-section">
            <div class="preview-box">
              <img v-if="editForm.image" :src="editForm.image" alt="Preview" class="uploaded-preview" />
              <span v-else class="preview-placeholder">{{ editForm.emoji || '📦' }}</span>
            </div>
            <div class="upload-controls">
              <label class="btn-upload-file">
                <Icon name="camera" size="14" /> Pilih Gambar dari HP / Laptop
                <input type="file" accept="image/*" class="hidden-file-input" @change="handleImageUpload($event, 'edit')" />
              </label>
              <button v-if="editForm.image" type="button" class="btn-remove-img" @click="editForm.image = ''">
                Hapus Foto (Gunakan Emoji)
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>Nama Barang *</label>
            <input v-model="editForm.name" type="text" required />
          </div>

          <div class="form-group">
            <label>Kategori *</label>
            <input
              v-model="editForm.category"
              list="category-suggestions"
              type="text"
              placeholder="Pilih atau ketik kategori baru"
              required
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Harga Jual *</label>
              <input v-model.number="editForm.price" type="number" min="1" required />
            </div>
            <div class="form-group" v-if="canViewCost">
              <label>Harga Beli (HPP)</label>
              <input v-model.number="editForm.cost_price" type="number" min="0" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Stok Saat Ini</label>
              <input v-model.number="editForm.stock" type="number" min="0" />
            </div>
            <div class="form-group">
              <label>Ikon Emoji (Jika Tanpa Foto)</label>
              <input v-model="editForm.emoji" type="text" placeholder="Contoh: 🥩, 🍗, 🌭" />
            </div>
          </div>

          <button
            class="btn-save"
            @click="submitEditProduct"
            :disabled="editLoading || !editForm.name || !editForm.price"
          >
            <Icon name="check" size="16" v-if="!editLoading" />
            <span>{{ editLoading ? 'Menyimpan Perubahan...' : 'Simpan Perubahan Barang' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Koreksi / Tambah Stok -->
    <div v-if="adjustProduct" class="sheet-overlay" @click.self="adjustProduct = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Koreksi Stok: {{ adjustProduct.name }}</h3>
          <button class="sheet-close" @click="adjustProduct = null">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <div class="cur-stock-box">
            <span>Stok Sistem Saat Ini:</span>
            <strong>{{ adjustProduct.stock }}</strong>
          </div>

          <div class="form-group">
            <label>Jenis Penyesuaian</label>
            <select v-model="adjustReason">
              <option value="Masuk">Stok Masuk (+)</option>
              <option value="Koreksi">Koreksi Stok (+/-)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Jumlah Perubahan (Gunakan minus '-' untuk pengurangan)</label>
            <input
              v-model.number="adjustChange"
              type="number"
              inputmode="numeric"
              placeholder="Contoh: 10 atau -5"
            />
          </div>

          <div class="form-group">
            <label>Catatan / Alasan</label>
            <input v-model="adjustNote" type="text" placeholder="Contoh: Barang rusak / masuk gudang" />
          </div>

          <div class="cur-stock-box">
            <span>Perkiraan Stok Akhir:</span>
            <strong :class="adjustFinalStock < 0 ? 'text-danger' : 'text-success'">
              {{ adjustFinalStock }}
            </strong>
          </div>

          <button
            class="btn-save"
            @click="submitAdjust"
            :disabled="adjustLoading || adjustFinalStock < 0"
          >
            <Icon name="check" size="16" v-if="!adjustLoading" />
            <span>{{ adjustLoading ? 'Menyimpan...' : 'Simpan Penyesuaian' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Produk Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Barang Baru</h3>
          <button class="sheet-close" @click="showAddModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <!-- Preview & Upload Gambar Baru -->
          <div class="image-upload-section">
            <div class="preview-box">
              <img v-if="newProd.image" :src="newProd.image" alt="Preview" class="uploaded-preview" />
              <span v-else class="preview-placeholder">{{ newProd.emoji || '📦' }}</span>
            </div>
            <div class="upload-controls">
              <label class="btn-upload-file">
                <Icon name="camera" size="14" /> Pilih Gambar Barang
                <input type="file" accept="image/*" class="hidden-file-input" @change="handleImageUpload($event, 'add')" />
              </label>
              <button v-if="newProd.image" type="button" class="btn-remove-img" @click="newProd.image = ''">
                Hapus Foto
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>Nama Barang *</label>
            <input v-model="newProd.name" type="text" placeholder="Contoh: Daging Sapi Slice 500g" required />
          </div>

          <div class="form-group">
            <label>Kategori *</label>
            <input
              v-model="newProd.category"
              list="category-suggestions"
              type="text"
              placeholder="Pilih atau ketik kategori baru"
              required
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Harga Jual *</label>
              <input v-model.number="newProd.price" type="number" min="1" required />
            </div>
            <div class="form-group" v-if="canViewCost">
              <label>Harga Beli (HPP)</label>
              <input v-model.number="newProd.cost_price" type="number" min="0" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Stok Awal</label>
              <input v-model.number="newProd.stock" type="number" min="0" />
            </div>
            <div class="form-group">
              <label>Ikon Emoji (Jika Tanpa Foto)</label>
              <input v-model="newProd.emoji" type="text" placeholder="Contoh: 🥩, 🍗, 🌭" />
            </div>
          </div>

          <button
            class="btn-save"
            @click="submitCreateProduct"
            :disabled="createLoading || !newProd.name || !newProd.price"
          >
            <Icon name="check" size="16" v-if="!createLoading" />
            <span>{{ createLoading ? 'Menyimpan...' : 'Tambah Barang' }}</span>
          </button>
        </div>
      </div>
    </div>
    <!-- Datalist Rekomendasi Kategori Dinamis -->
    <datalist id="category-suggestions">
      <option v-for="cat in dynamicCategoryList" :key="cat" :value="cat" />
    </datalist>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);
const isSales = computed(() => user.value?.role === 'sales');
const stockSource = ref('mine'); // 'mine' | 'admin'
const mySalesStock = ref([]);
const myStockCount = computed(() => mySalesStock.value.filter(s => s.stock > 0).length);

const canManageStock = computed(() => user.value?.role === 'admin' && stockSource.value !== 'mine');
const canViewCost = computed(() => user.value?.role === 'admin');

function switchSource(src) {
  stockSource.value = src;
  stockCurrentPage.value = 1;
  fetchProducts();
}

// Watch perubahan user jika halaman di-refresh saat auth baru selesai dimuat
watch(() => authStore.user, (newVal) => {
  if (newVal) {
    fetchProducts();
  }
});

const loading = ref(false);
const products = ref([]);
const searchQuery = ref('');
const dynamicCategoryList = computed(() => {
  const cats = new Set();
  // Default suggestions
  ['Bakso & Daging', 'Sosis', 'Mie & Pasta', 'Dimsum & Pangsit', 'Camilan & Gorengan', 'Nugget & Ayam', 'Kue & Roti', 'Frozen Food'].forEach(c => cats.add(c));
  products.value.forEach(p => {
    if (p.category && p.category.trim()) {
      cats.add(p.category.trim());
    }
  });
  return Array.from(cats).sort((a, b) => a.localeCompare(b));
});

const categories = computed(() => {
  return ['Semua', ...dynamicCategoryList.value];
});

const selectedCategory = ref('Semua');

// Filter & Pagination Stok Barang (10 per halaman)
const stockCurrentPage = ref(1);
const stockPageSize = ref(10);

const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value !== 'Semua') {
    list = list.filter(p => p.category === selectedCategory.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  return list;
});

const stockTotalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredProducts.value.length / stockPageSize.value));
});

const paginatedProducts = computed(() => {
  const start = (stockCurrentPage.value - 1) * stockPageSize.value;
  return filteredProducts.value.slice(start, start + stockPageSize.value);
});

// State Koreksi Stok
const adjustProduct = ref(null);
const adjustReason = ref('Koreksi');
const adjustChange = ref(0);
const adjustNote = ref('');
const adjustLoading = ref(false);

const adjustFinalStock = computed(() => {
  if (!adjustProduct.value) return 0;
  return (adjustProduct.value.stock || 0) + (adjustChange.value || 0);
});

// State Tambah Produk
const showAddModal = ref(false);
const createLoading = ref(false);
const newProd = ref({
  name: '',
  category: 'Frozen Food',
  price: 0,
  cost_price: 0,
  stock: 0,
  emoji: '📦',
  image: ''
});

// State Edit Produk (Admin)
const editProduct = ref(null);
const editLoading = ref(false);
const editForm = ref({
  id: '',
  name: '',
  category: 'Frozen Food',
  price: 0,
  cost_price: 0,
  stock: 0,
  emoji: '📦',
  image: ''
});

function openEditModal(p) {
  editProduct.value = p;
  editForm.value = {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    cost_price: p.cost_price || 0,
    stock: p.stock || 0,
    emoji: p.emoji || '📦',
    image: p.image || ''
  };
}

// Handler kompresi & resize gambar via HTML Canvas sebelum dikirim
function handleImageUpload(event, target = 'edit') {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Resize gambar proporsional maks 400x400 agar ringan dan hemat database
      const maxDim = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Konversi ke format web JPEG 80% quality
      const base64Data = canvas.toDataURL('image/jpeg', 0.8);
      if (target === 'edit') {
        editForm.value.image = base64Data;
      } else {
        newProd.value.image = base64Data;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitEditProduct() {
  if (!editForm.value.name || !editForm.value.price) {
    appStore.showToast('Nama dan harga barang wajib diisi', 'warning');
    return;
  }

  const payload = { ...editForm.value };

  // 1. Optimistic Update Instan: langsung update di state produk agar gambar dan data langsung tampil seketika
  const idx = products.value.findIndex(p => p.id === payload.id);
  if (idx !== -1) {
    products.value[idx] = {
      ...products.value[idx],
      name: payload.name,
      category: payload.category,
      price: payload.price,
      cost_price: payload.cost_price,
      stock: payload.stock,
      emoji: payload.emoji,
      image: payload.image || ''
    };
  }

  editProduct.value = null;
  appStore.showToast('Data barang berhasil diperbarui!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    // Refresh quietly in background
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

async function fetchProducts() {
  loading.value = true;
  try {
    if (isSales.value && stockSource.value === 'mine') {
      const res = await apiFetch('/api/products/sales-stock');
      mySalesStock.value = res.data || [];
      // Format sama dengan products agar komponen menampilkan nama, emoji, dll
      products.value = mySalesStock.value.map(s => ({
        id: s.product_id,
        name: s.product_name,
        category: s.category || 'Lainnya',
        price: s.price,
        stock: s.stock,
        emoji: s.emoji || '📦',
        image: s.image || '',
        active: true,
        is_low_stock: s.stock <= 5
      }));
    } else {
      const res = await apiFetch('/api/products');
      products.value = res.data || [];
      // Jika sales membuka stok admin, preload juga stok sendiri untuk count badge
      if (isSales.value) {
        apiFetch('/api/products/sales-stock').then(r => { mySalesStock.value = r.data || []; }).catch(() => {});
      }
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openAdjustModal(p) {
  adjustProduct.value = p;
  adjustReason.value = 'Koreksi';
  adjustChange.value = 0;
  adjustNote.value = '';
}

async function submitAdjust() {
  if (adjustFinalStock.value < 0) {
    appStore.showToast('Stok akhir tidak boleh negatif', 'warning');
    return;
  }

  const prodId = adjustProduct.value?.id;
  const changeVal = adjustChange.value;
  const reasonVal = adjustReason.value;
  const noteVal = adjustNote.value;

  // Optimistic stock update
  if (prodId) {
    const p = products.value.find(item => item.id === prodId);
    if (p) p.stock = (p.stock || 0) + changeVal;
  }

  adjustProduct.value = null;
  appStore.showToast('Stok berhasil diperbarui!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products/stock', {
      method: 'POST',
      body: JSON.stringify({
        product_id: prodId,
        change: changeVal,
        reason: reasonVal,
        note: noteVal
      })
    });
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

async function submitCreateProduct() {
  const payload = { ...newProd.value };

  // Optimistic add product
  const tempId = 'PRD-' + Date.now().toString(36);
  products.value.unshift({
    id: tempId,
    name: payload.name,
    category: payload.category,
    price: payload.price,
    cost_price: payload.cost_price,
    stock: payload.stock,
    emoji: payload.emoji,
    image: payload.image || '',
    active: true
  });

  showAddModal.value = false;
  newProd.value = { name: '', category: 'Frozen Food', price: 0, cost_price: 0, stock: 0, emoji: '📦', image: '' };
  appStore.showToast('Barang baru berhasil disimpan!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

function isValidImage(img) {
  if (!img || typeof img !== 'string') return false;
  const s = img.trim();
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function onImgError(product) {
  if (product) {
    product.image = '';
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchProducts();
});
</script>

<style scoped>
.stock-page {
  padding: 16px;
  padding-bottom: 90px;
}
.stock-source-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tab-btn-source {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border-color, #e5e5e5);
  background: var(--bg-card, #fff);
  color: var(--text-color, #333);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.tab-btn-source.active {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 2px 8px rgba(37, 99, 235, .25);
}
.stock-header {
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
.btn-manage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  padding: 0 14px;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.15s ease;
}
.btn-manage:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-nav-stock {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  text-decoration: none;
  font-size: 13px;
  padding: 0 12px;
  border-radius: var(--radius-btn);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.btn-nav-stock:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.category-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 14px;
}
.cat-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 12px;
  min-height: 34px;
  padding: 4px 10px;
  white-space: nowrap;
  border-radius: 8px;
}
.cat-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.stock-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.stock-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.stock-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-low {
  border-left: 4px solid var(--danger);
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 10px);
}
.page-info {
  font-size: 13px;
  color: var(--text-muted);
}
.page-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-page {
  background: var(--bg-hover, #f1f5f9);
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-main);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-page:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.btn-page:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.page-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.stock-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stock-emoji {
  font-size: 26px;
}
.stock-details {
  display: flex;
  flex-direction: column;
}
.prod-name {
  font-weight: 700;
  font-size: 14px;
}
.prod-cat {
  font-size: 11px;
  color: var(--text-muted);
}
.price-row {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.price-val {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
}
.cost-price {
  font-size: 11px;
  color: var(--text-light);
}
.stock-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.stock-badge {
  font-size: 18px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
}
.badge-safe {
  background: #dcfce7;
  color: #15803d;
}
.badge-low {
  background: #fee2e2;
  color: #dc2626;
}
.stock-actions-btn {
  display: flex;
  gap: 6px;
  align-items: center;
}
.btn-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  border: 1px solid rgba(37, 99, 235, 0.25);
  font-size: 11px;
  font-weight: 600;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}
[data-theme="dark"] .btn-edit {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}
.btn-edit:hover {
  background: var(--primary);
  color: #ffffff;
}
.btn-adjust {
  background: var(--bg-app);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  font-size: 11px;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.btn-adjust:hover {
  border-color: var(--text-muted);
}

/* Sheet Modals */
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
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-head {
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
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cur-stock-box {
  background: var(--bg-app);
  padding: 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}

/* Image Thumbnail & Upload Styles */
.prod-thumb {
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
.prod-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stock-actions-btn {
  display: flex;
  gap: 6px;
}
.btn-edit {
  background: var(--primary);
  color: white;
  font-size: 11px;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 6px;
}
.image-upload-section {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: 10px;
  border: 1px dashed var(--border-color);
  margin-bottom: 4px;
}
.preview-box {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.uploaded-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-placeholder {
  font-size: 30px;
}
.upload-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.btn-upload-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  min-height: 36px;
  transition: opacity 0.15s ease;
}
.btn-upload-file:hover {
  opacity: 0.9;
}
.hidden-file-input {
  display: none;
}
.btn-remove-img {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  font-size: 11px;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 6px;
}
</style>
