<template>
  <div class="opname-page">
    <div class="opname-header card">
      <h2>Stock Opname Fisik</h2>
      <p>Masukkan jumlah fisik riil di gudang. Sistem akan otomatis menghitung selisih dan membuat penyesuaian koreksi stok.</p>
    </div>

    <div v-if="loading" class="state-msg">Memuat data barang...</div>
    <div v-else class="opname-list">
      <div
        v-for="p in products"
        :key="p.id"
        class="card opname-item-card"
      >
        <div class="it-head">
          <span class="it-name">{{ p.emoji || '📦' }} {{ p.name }}</span>
          <span class="it-sys">Stok Sistem: <strong>{{ formatNumber(p.stock) }}</strong></span>
        </div>

        <div class="it-body">
          <div class="input-box">
            <label>Hitung Fisik</label>
            <input
              v-model.number="p.counted"
              type="number"
              min="0"
              inputmode="numeric"
            />
          </div>

          <div class="diff-box">
            <label>Selisih</label>
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

    <div class="save-bar card">
      <div class="form-group">
        <label>Catatan Stock Opname</label>
        <input v-model="opnameNote" type="text" placeholder="Contoh: Opname Akhir Bulan Gudang Utama" />
      </div>

      <button
        class="btn-save-opname"
        @click="submitOpname"
        :disabled="submitLoading"
      >
        {{ submitLoading ? 'Menyimpan...' : '✓ Simpan Hasil Stock Opname' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { formatNumber } from '../utils/format.js';

const router = useRouter();
const appStore = useAppStore();

const loading = ref(false);
const submitLoading = ref(false);
const products = ref([]);
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
  gap: 12px;
}
.opname-header h2 {
  font-size: 16px;
  margin-bottom: 4px;
}
.opname-header p {
  font-size: 12px;
  color: var(--text-muted);
}
.opname-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opname-item-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.it-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.it-name {
  font-weight: 700;
  font-size: 14px;
}
.it-sys {
  font-size: 12px;
  color: var(--text-muted);
}
.it-body {
  display: flex;
  gap: 12px;
  align-items: center;
}
.input-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.input-box label, .diff-box label {
  font-size: 11px;
  color: var(--text-muted);
}
.diff-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 100px;
}
.diff-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
}
.save-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn-save-opname {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
}
</style>
