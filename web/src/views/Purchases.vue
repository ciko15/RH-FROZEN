<template>
  <div class="purchases-page">
    <div class="header-action">
      <div class="section-title">Riwayat Pembelian Barang</div>
      <button class="btn-add" @click="showAddModal = true">+ Pembelian</button>
    </div>

    <div v-if="loading" class="state-msg">Memuat data pembelian...</div>
    <div v-else-if="purchases.length === 0" class="empty-state">
      <div class="empty-icon-box">
        <Icon name="purchases" size="38" />
      </div>
      <h3>Belum Ada Pembelian</h3>
    </div>
    <div v-else class="purchases-list">
      <div
        v-for="p in purchases"
        :key="p.id"
        class="card purchase-card"
      >
        <div class="p-head">
          <span class="p-no">
            <Icon name="package" size="14" />
            {{ p.purchase_no }}
          </span>
          <span class="p-date">{{ p.date }}</span>
        </div>
        <div class="p-supp">Pemasok: <strong>{{ p.supplier_name }}</strong></div>
        <div class="p-foot">
          <span class="p-branch">{{ p.branch_name }}</span>
          <span class="p-total font-bold">Total: Rp {{ formatNumber(p.total) }}</span>
        </div>
      </div>
    </div>

    <!-- Modal Form Catat Pembelian Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Catat Pembelian Stok</h3>
          <button class="sheet-close" @click="showAddModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Pilih Pemasok *</label>
            <select v-model="form.supplier_id" required>
              <option value="">-- Pilih Pemasok --</option>
              <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>

          <div class="form-group" v-if="user?.role === 'admin'">
            <label>Cabang Penerima *</label>
            <select v-model="form.branch_id">
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>Tanggal Pembelian</label>
            <input v-model="form.date" type="date" />
          </div>

          <div class="form-group">
            <label>Catatan</label>
            <input v-model="form.note" type="text" placeholder="Contoh: Faktur Supplier #1234" />
          </div>

          <!-- Rincian Item Pembelian -->
          <div class="items-section">
            <div class="items-head">
              <strong>Daftar Barang Masuk ({{ form.items.length }})</strong>
              <button type="button" class="btn-pick" @click="addItemRow">
                <Icon name="plus" size="14" />
                Item
              </button>
            </div>

            <div
              v-for="(it, idx) in form.items"
              :key="idx"
              class="purchase-item-row"
            >
              <select v-model="it.product_id" class="p-select" required>
                <option value="">-- Pilih Barang --</option>
                <option v-for="prod in products" :key="prod.id" :value="prod.id">
                  {{ prod.name }} (Stok: {{ prod.stock }})
                </option>
              </select>

              <div class="row-inputs">
                <input v-model.number="it.qty" type="number" min="1" placeholder="Qty" />
                <input v-model.number="it.cost_price" type="number" min="1" placeholder="Harga Beli" />
                <button type="button" class="btn-del" @click="removeItemRow(idx)" title="Hapus">
                  <Icon name="trash" size="15" />
                </button>
              </div>
            </div>
          </div>

          <div class="total-calc-row">
            <span>Total Nilai Pembelian:</span>
            <strong class="total-big">Rp {{ formatNumber(totalPurchaseAmount) }}</strong>
          </div>

          <button
            class="btn-save"
            @click="submitPurchase"
            :disabled="submitLoading || !form.supplier_id || form.items.length === 0"
          >
            <Icon name="check" size="18" v-if="!submitLoading" />
            <span>{{ submitLoading ? 'Menyimpan...' : 'Simpan & Update Stok' }}</span>
          </button>
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

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);

const loading = ref(false);
const submitLoading = ref(false);
const purchases = ref([]);
const suppliers = ref([]);
const branches = ref([]);
const products = ref([]);
const showAddModal = ref(false);

const form = ref({
  supplier_id: '',
  branch_id: '',
  date: new Date().toISOString().substring(0, 10),
  note: '',
  items: []
});

const totalPurchaseAmount = computed(() => {
  return form.value.items.reduce((sum, it) => {
    const q = it.qty || 0;
    const p = it.cost_price || 0;
    return sum + (q * p);
  }, 0);
});

function addItemRow() {
  form.value.items.push({
    product_id: '',
    qty: 1,
    cost_price: 0
  });
}

function removeItemRow(index) {
  form.value.items.splice(index, 1);
}

async function fetchPurchases() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/purchases');
    purchases.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function fetchOptions() {
  try {
    const resSupp = await apiFetch('/api/suppliers');
    suppliers.value = resSupp.data || [];
    const resBr = await apiFetch('/api/branches');
    branches.value = resBr.data || [];
    const resProd = await apiFetch('/api/products');
    products.value = resProd.data || [];

    if (branches.value.length > 0 && !form.value.branch_id) {
      form.value.branch_id = branches.value[0].id;
    }
  } catch (e) {}
}

async function submitPurchase() {
  submitLoading.value = true;
  const idempotencyKey = crypto.randomUUID();

  try {
    await apiFetch('/api/purchases', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(form.value)
    });

    appStore.showToast('Pembelian berhasil disimpan! Stok bertambah.', 'success');
    showAddModal.value = false;
    form.value = {
      supplier_id: '',
      branch_id: branches.value[0]?.id || '',
      date: new Date().toISOString().substring(0, 10),
      note: '',
      items: []
    };
    fetchPurchases();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    submitLoading.value = false;
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchPurchases();
  fetchOptions();
});
</script>

<style scoped>
.purchases-page {
  padding: 16px;
  padding-bottom: 90px;
}
.header-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
}
.btn-add {
  background: var(--primary);
  color: white;
  font-size: 13px;
  padding: 0 14px;
}
.purchases-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.purchase-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.p-head, .p-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.p-no {
  font-weight: 700;
  font-size: 14px;
  color: var(--primary);
}
.p-date, .p-branch {
  font-size: 12px;
  color: var(--text-muted);
}
.p-supp {
  font-size: 14px;
}
.p-total {
  font-size: 14px;
  color: var(--text-main);
}

/* Modal */
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
  margin-bottom: 12px;
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
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.items-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-app);
  padding: 10px;
  border-radius: 8px;
}
.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.btn-pick {
  background: var(--primary);
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  min-height: 28px;
}
.purchase-item-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-card);
  padding: 8px;
  border-radius: 6px;
}
.row-inputs {
  display: flex;
  gap: 6px;
}
.row-inputs input {
  font-size: 13px;
  padding: 4px 6px;
}
.btn-del {
  background: transparent;
  color: var(--danger);
  min-height: 32px;
  padding: 2px 8px;
  font-size: 16px;
}
.total-calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
}
.total-big {
  font-size: 18px;
  color: var(--primary);
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 6px;
}
</style>
