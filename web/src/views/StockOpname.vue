<template>
  <div class="opname-page">
    <div class="opname-header card">
      <div class="header-content">
        <div>
          <h2>Stock Opname Fisik</h2>
          <p>Masukkan jumlah fisik riil di gudang. Sistem akan otomatis menghitung selisih dan membuat penyesuaian koreksi stok.</p>
        </div>
        <button class="btn-cancel-top" @click="cancelOpname" title="Kembali ke Stok Barang">
          <Icon name="x" size="14" />
          <span>Batal</span>
        </button>
      </div>
    </div>

    <!-- Search Input & Filter Stats -->
    <div class="search-bar card">
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari nama barang atau kategori..."
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">
          <Icon name="x" size="14" />
        </button>
      </div>
      <div class="search-stats">
        <span>Menampilkan <strong>{{ filteredProducts.length }}</strong> dari {{ products.length }} barang</span>
        <span v-if="diffCount > 0" class="diff-count-badge">⚠️ {{ diffCount }} barang ada selisih</span>
        <span v-else class="same-count-badge">✓ Semua stok sesuai</span>
      </div>
    </div>

    <div v-if="loading" class="state-msg">Memuat data barang...</div>
    <div v-else-if="filteredProducts.length === 0" class="empty-state card">
      <div class="empty-icon-box"><Icon name="package" size="38" /></div>
      <h3>Barang Tidak Ditemukan</h3>
      <p>Tidak ada barang yang cocok dengan kata kunci "{{ searchQuery }}"</p>
    </div>
    <div v-else class="stock-list">
      <div
        v-for="p in filteredProducts"
        :key="p.id"
        class="card stock-card opname-card"
        :class="{ 'card-diff': getDiff(p) !== 0 }"
      >
        <div class="stock-left">
          <div class="prod-thumb">
            <img
              v-if="isValidImage(p.image)"
              :src="p.image"
              :alt="p.name"
              class="prod-img"
              @error="p.image = ''"
            />
            <span v-else class="stock-emoji">{{ p.emoji || '📦' }}</span>
          </div>
          <div class="stock-details">
            <span class="prod-name">{{ p.name }}</span>
            <small class="prod-cat">{{ p.category || 'Frozen Food' }}</small>
            <div class="sys-stock-label">
              Stok Sistem: <strong>{{ formatNumber(p.stock) }} pcs</strong>
            </div>
          </div>
        </div>

        <div class="opname-right">
          <div class="input-count-wrap">
            <label class="count-label">Fisik (pcs)</label>
            <div class="input-with-reset">
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(p.counted)"
                @input="onCountedInput(p, $event)"
                placeholder="0"
                class="counted-input"
              />
              <button
                v-if="getDiff(p) !== 0"
                class="btn-reset-item"
                title="Kembalikan sesuai stok sistem"
                @click="resetItem(p)"
              >
                Reset
              </button>
            </div>
          </div>

          <div class="diff-badge-wrap">
            <span
              class="diff-badge"
              :class="getDiffClass(p)"
            >
              {{ getDiffLabel(p) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Save & Cancel Bar -->
    <div class="save-bar card">
      <div class="form-group">
        <label>Catatan Stock Opname</label>
        <input v-model="opnameNote" type="text" placeholder="Contoh: Opname Akhir Bulan Gudang Utama" />
      </div>

      <div class="action-buttons-bar">
        <button
          type="button"
          class="btn-cancel-opname"
          @click="cancelOpname"
        >
          Batal
        </button>
        <button
          class="btn-save-opname"
          @click="submitOpname"
          :disabled="submitLoading"
        >
          {{ submitLoading ? 'Menyimpan...' : '✓ Simpan Hasil Stock Opname' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { formatNumber } from '../utils/format.js';
import Icon from '../components/Icon.vue';

const router = useRouter();
const appStore = useAppStore();

const loading = ref(false);
const submitLoading = ref(false);
const products = ref([]);
const searchQuery = ref('');
const opnameNote = ref('Stock Opname Rutin');

async function fetchProducts() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/products');
    products.value = (res.data || []).map(p => ({
      ...p,
      counted: p.stock
    }));
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

const filteredProducts = computed(() => {
  if (!searchQuery.value) return products.value;
  const q = searchQuery.value.toLowerCase().trim();
  return products.value.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.category && p.category.toLowerCase().includes(q))
  );
});

const diffCount = computed(() => {
  return products.value.filter(p => getDiff(p) !== 0).length;
});

function onCountedInput(p, event) {
  const raw = event.target.value.replace(/\D/g, '');
  p.counted = raw ? parseInt(raw, 10) : 0;
  // Mempertahankan format ribuan di input
  event.target.value = formatNumber(p.counted);
}

function getDiff(p) {
  return (p.counted || 0) - p.stock;
}

function getDiffLabel(p) {
  const diff = getDiff(p);
  if (diff === 0) return `Sesuai (${formatNumber(diff)})`;
  return diff > 0 ? `Lebih (+${formatNumber(diff)})` : `Kurang (${formatNumber(diff)})`;
}

function getDiffClass(p) {
  const diff = getDiff(p);
  if (diff === 0) return 'badge-dikirim';
  return diff > 0 ? 'badge-proses' : 'badge-dibatalkan';
}

function isValidImage(img) {
  if (!img || typeof img !== 'string') return false;
  const s = img.trim();
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function resetItem(p) {
  p.counted = p.stock;
}

function cancelOpname() {
  if (diffCount.value > 0) {
    if (!confirm('Anda memiliki perubahan hitungan fisik yang belum disimpan. Yakin ingin membatalkan?')) {
      return;
    }
  }
  router.push('/stock');
}

async function submitOpname() {
  if (!confirm('Simpan hasil stock opname ini? Stok di database akan otomatis disesuaikan sesuai hitungan fisik.')) return;
  submitLoading.value = true;

  try {
    await apiFetch('/api/products/opname', {
      method: 'POST',
      body: JSON.stringify({
        items: products.value.map(p => ({
          product_id: p.id,
          counted: p.counted
        })),
        note: opnameNote.value
      })
    });

    appStore.showToast('Stock opname berhasil disimpan dan stok disinkronkan!', 'success');
    router.push('/stock');
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    submitLoading.value = false;
  }
}

onMounted(() => {
  fetchProducts();
});
</script>

<style scoped>
.opname-page {
  padding: 16px;
  padding-bottom: 90px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.opname-header {
  padding: 16px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.opname-header h2 {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 4px;
}
.opname-header p {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
.btn-cancel-top {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.btn-cancel-top:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}

/* Search Bar */
.search-bar {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.search-input-wrapper {
  position: relative;
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
  padding: 10px 36px 10px 36px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 14px;
  background: var(--bg-app);
  color: var(--text-main);
}
.search-input:focus {
  border-color: var(--primary);
  outline: none;
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
}
.search-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 6px;
}
.diff-count-badge {
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
}
.same-count-badge {
  font-weight: 600;
  color: #15803d;
  background: #dcfce7;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
}

/* Product Cards Grid like Stock.vue */
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
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.stock-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-diff {
  border-left: 4px solid #f59e0b;
}

/* Product Left Info */
.stock-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
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
.stock-emoji {
  font-size: 24px;
}
.stock-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.prod-name {
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prod-cat {
  font-size: 11px;
  color: var(--text-muted);
}
.sys-stock-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.sys-stock-label strong {
  color: var(--text-main);
}

/* Opname Right (Input & Difference) */
.opname-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.input-count-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.count-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.input-with-reset {
  display: flex;
  align-items: center;
  gap: 6px;
}
.counted-input {
  width: 90px;
  text-align: right;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
  background: var(--bg-card);
}
.counted-input:focus {
  border-color: var(--primary);
  outline: none;
}
.btn-reset-item {
  font-size: 10px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-weight: 600;
  line-height: 1;
}
.btn-reset-item:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}
.diff-badge-wrap {
  margin-top: 2px;
}
.diff-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.badge-dikirim {
  background: #dcfce7;
  color: #15803d;
}
.badge-proses {
  background: #dbeafe;
  color: #1e40af;
}
.badge-dibatalkan {
  background: #fee2e2;
  color: #dc2626;
}

/* Empty State */
.empty-state {
  padding: 36px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon-box {
  color: var(--text-muted);
  margin-bottom: 4px;
}
.empty-state h3 {
  font-size: 15px;
  margin: 0;
}
.empty-state p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* Save & Cancel Bar */
.save-bar {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.form-group input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 14px;
}
.action-buttons-bar {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.btn-cancel-opname {
  flex: 0 0 110px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-cancel-opname:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}
.btn-save-opname {
  flex: 1;
  background: var(--success);
  color: white;
  min-height: 44px;
  font-size: 15px;
  border-radius: 8px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25);
  transition: all 0.15s ease;
}
.btn-save-opname:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-save-opname:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .stock-list {
    grid-template-columns: 1fr;
  }
}
</style>
