<template>
  <div class="req-page">
    <div class="card req-card">
      <div class="section-title">Permintaan Barang ke Admin</div>
      <p class="hint">Pilih barang & jumlah yang ingin diminta. Setelah admin mengirim, stok akan masuk ke <strong>Stok Saya</strong>.</p>
      <div class="form-group">
        <label>Catatan (Opsional)</label>
        <input v-model="note" type="text" placeholder="Contoh: Untuk kebutuhan minggu depan" />
      </div>
    </div>

    <div class="card req-card">
      <div class="section-title">Pilih Barang</div>
      <div class="search-wrap">
        <Icon name="search" size="14" />
        <input v-model="search" type="text" placeholder="Cari nama barang..." />
      </div>

      <div v-if="loadingProducts" class="empty">Memuat barang...</div>
      <div v-else class="prod-grid">
        <button
          v-for="p in filteredProducts"
          :key="p.id"
          type="button"
          class="prod-tile"
          :class="{ selected: qtyOf(p.id) > 0 }"
          @click="inc(p)"
        >
          <span class="prod-emoji">📦</span>
          <span class="prod-name">{{ p.name }}</span>
          <span class="prod-stock" :class="{ danger: p.stock <= 0 }">Stok admin: {{ formatNumber(p.stock) }}</span>
          <span v-if="qtyOf(p.id) > 0" class="prod-badge">{{ qtyOf(p.id) }}</span>
        </button>
      </div>
    </div>

    <div class="card req-card">
      <div class="section-title">Daftar Permintaan ({{ formatNumber(items.length) }})</div>
      <div v-if="items.length === 0" class="empty">Belum ada barang dipilih.</div>
      <div v-for="(it, idx) in items" :key="idx" class="req-item-block" :class="{ warn: it.qty > it.stock }">
        <div class="req-row">
          <div class="req-info">
            <div class="req-name">{{ it.emoji }} {{ it.name }}</div>
            <small v-if="it.qty > it.stock" class="text-danger">
              ⚠️ Stok admin kurang {{ formatNumber(it.qty - Math.max(it.stock, 0)) }} — tetap bisa diminta
            </small>
          </div>
          <div class="qty-ctrl">
            <button type="button" @click="dec(idx)">−</button>
            <input
              v-model.number="it.qty"
              type="number"
              min="1"
              inputmode="numeric"
              @focus="$event.target.select()"
              @click="$event.target.select()"
            />
            <button type="button" @click="it.qty++">+</button>
            <button type="button" class="btn-remove-row" @click="removeRow(idx)" title="Hapus baris">×</button>
          </div>
        </div>
        <div class="customer-name-row">
          <label class="customer-label">Nama Pemesan / Catatan <span class="text-danger">*</span></label>
          <input
            v-model="it.nama_pemesan"
            type="text"
            class="input-customer-name"
            placeholder="Contoh: Bu Sri / Adam / Warung Berkah"
            required
          />
        </div>
      </div>

      <button class="btn-submit" :disabled="loading || items.length === 0" @click="submit">
        <Icon name="check" size="18" />
        <span>{{ loading ? 'Mengirim...' : `Kirim Permintaan (${formatNumber(totalQty)} item)` }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';
import { cacheProducts, getCachedProducts } from '../db.js';
import Icon from '../components/Icon.vue';
import { formatNumber } from '../utils/format.js';

const router = useRouter();
const appStore = useAppStore();

const products = ref([]);
const items = ref([]);
const note = ref('');
const search = ref('');
const loading = ref(false);
const loadingProducts = ref(true);

const filteredProducts = computed(() => {
  const q = search.value.toLowerCase().trim();
  return products.value
    .filter(p => p.active !== false)
    .filter(p => !q || (p.name || '').toLowerCase().includes(q));
});
const totalQty = computed(() => items.value.reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0));

function qtyOf(id) {
  return items.value.filter(i => i.product_id === id).reduce((s, it) => s + (parseInt(it.qty, 10) || 0), 0);
}
function inc(p) {
  items.value.push({
    product_id: p.id,
    name: p.name,
    emoji: p.emoji || '📦',
    stock: parseInt(p.stock, 10) || 0,
    qty: 1,
    nama_pemesan: ''
  });
}
function dec(idx) {
  if (items.value[idx].qty > 1) items.value[idx].qty--;
  else items.value.splice(idx, 1);
}
function removeRow(idx) {
  items.value.splice(idx, 1);
}

async function loadProducts() {
  try {
    const res = await apiFetch('/api/products');
    products.value = res.data || [];
    if (products.value.length) await cacheProducts(products.value);
  } catch (e) {
    products.value = (await getCachedProducts()) || [];
  } finally {
    loadingProducts.value = false;
  }
}

async function submit() {
  const valid = items.value.filter(i => i.qty > 0);
  if (!valid.length) return appStore.showToast('Minimal pilih 1 barang', 'warning');

  // Validasi A1: Field Nama Pemesan / Catatan wajib diisi per item
  const emptyPemesan = valid.find(i => !i.nama_pemesan || !String(i.nama_pemesan).trim());
  if (emptyPemesan) {
    return appStore.showToast(`Nama pemesan untuk barang "${emptyPemesan.name}" wajib diisi`, 'warning');
  }

  loading.value = true;
  const clientKey = crypto.randomUUID();
  try {
    await apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': clientKey },
      body: JSON.stringify({
        note: note.value,
        client_key: clientKey,
        items: valid.map(i => ({
          product_id: i.product_id,
          qty: parseInt(i.qty, 10),
          nama_pemesan: i.nama_pemesan.trim()
        }))
      })
    });
    appStore.showToast('Pesanan berhasil dicatat & dikirim ke admin', 'success');
    router.push('/orders');
  } catch (err) {
    appStore.showToast(`Gagal mengirim: ${err.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

onMounted(loadProducts);
</script>

<style scoped>
.req-page { display: flex; flex-direction: column; gap: 14px; padding-bottom: 90px; }
.req-card { padding: 16px; }
.section-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; }
.hint { font-size: 13px; color: var(--text-muted, #888); margin: 0 0 12px; }
.form-group label { display: block; font-size: 13px; margin-bottom: 4px; }
.form-group input { width: 100%; }
.search-wrap { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border, #ddd); border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; }
.search-wrap input { border: none; outline: none; flex: 1; background: transparent; }
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 420px; overflow-y: auto; }
.prod-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border: 1.5px solid var(--border, #e5e5e5); border-radius: 12px; background: var(--card-bg, #fff); cursor: pointer; transition: transform .15s, border-color .15s; }
.prod-tile:hover { transform: translateY(-2px); }
.prod-tile.selected { border-color: var(--primary, #2563eb); box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }
.prod-img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
.prod-emoji { font-size: 34px; }
.prod-name { font-size: 12px; font-weight: 600; text-align: center; line-height: 1.2; }
.prod-stock { font-size: 11px; color: var(--text-muted, #888); }
.prod-stock.danger, .text-danger { color: var(--danger, #ef4444); }
.prod-badge { position: absolute; top: 6px; right: 6px; background: var(--primary, #2563eb); color: #fff; border-radius: 999px; min-width: 22px; height: 22px; font-size: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.empty { text-align: center; color: var(--text-muted, #888); padding: 16px; font-size: 13px; }
.req-item-block { padding: 12px 0; border-bottom: 1px dashed var(--border, #e5e5e5); display: flex; flex-direction: column; gap: 8px; }
.req-item-block.warn { background: rgba(239, 68, 68, .04); border-radius: 8px; padding: 10px; }
.req-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.req-name { font-weight: 600; font-size: 14px; }
.qty-ctrl { display: flex; align-items: center; gap: 4px; }
.qty-ctrl button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border, #ddd); background: transparent; font-size: 18px; cursor: pointer; }
.qty-ctrl input { width: 56px; text-align: center; }
.btn-remove-row { color: var(--danger, #ef4444); border-color: rgba(239, 68, 68, 0.3) !important; font-size: 18px; }
.customer-name-row { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.customer-label { font-size: 12px; font-weight: 600; color: var(--text-muted, #666); }
.input-customer-name { width: 100%; font-size: 13px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border, #ccc); }
.btn-submit { margin-top: 14px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border: none; border-radius: 12px; background: linear-gradient(135deg, var(--primary, #2563eb), #4f46e5); color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
