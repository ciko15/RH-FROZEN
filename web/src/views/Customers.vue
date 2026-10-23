<template>
  <div class="customers-page">
    <div class="page-title-bar">
      <div class="title-meta">
        <h2>{{ user?.role === 'sales' ? 'Pelanggan Saya' : 'Daftar Pelanggan' }}</h2>
        <span class="subtext">
          {{ user?.role === 'sales' ? 'Hanya menampilkan data customer yang ditangani oleh Anda' : 'Kelola data pelanggan dan penetapan sales' }}
        </span>
      </div>
      <button class="btn-add-primary" @click="showAddModal = true">
        <Icon name="plus" size="14" />
        <span>Tambah</span>
      </button>
    </div>

    <div class="header-action">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari pelanggan / no telepon..."
        class="search-input"
        @input="onSearchInput"
      />
    </div>

    <div v-if="loading" class="state-msg">Memuat pelanggan...</div>
    <div v-else-if="customers.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="customers" size="38" /></div>
      <h3>Belum Ada Pelanggan</h3>
      <p>{{ user?.role === 'sales' ? 'Anda belum memiliki pelanggan yang terdaftar.' : 'Belum ada data pelanggan di cabang ini.' }}</p>
    </div>
    <div v-else class="cust-list">
      <div
        v-for="c in customers"
        :key="c.id"
        class="card cust-card"
      >
        <div class="cust-head">
          <span class="cust-name">{{ c.name }}</span>
          <span class="badge" :class="c.active ? 'badge-dikirim' : 'badge-dibatalkan'">
            {{ c.active ? 'Aktif' : 'Nonaktif' }}
          </span>
        </div>

        <div class="cust-info">
          <span v-if="c.sales_name"><Icon name="user" size="13" /> Sales: <strong>{{ c.sales_name }}</strong></span>
          <span><Icon name="map-pin" size="13" /> {{ c.address || 'Alamat belum diatur' }}</span>
          <span><Icon name="phone" size="13" /> {{ c.phone || '-' }}</span>
          <div class="credit-info">
            <span>Batas Kredit: <strong>{{ c.credit_limit > 0 ? 'Rp ' + formatNumber(c.credit_limit) : 'Tanpa Batas' }}</strong></span>
            <span>Jatuh Tempo: <strong>{{ c.term_days }} Hari</strong></span>
          </div>
        </div>

        <div class="cust-actions">
          <button class="btn-edit-cust" @click="openEditModal(c)">
            <Icon name="edit" size="13" /> Edit Data
          </button>
          <button class="btn-price" @click="openPricesModal(c)">
            <Icon name="tag" size="13" /> Atur Harga Khusus
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Atur Harga Khusus -->
    <div v-if="selectedCustForPrice" class="sheet-overlay" @click.self="selectedCustForPrice = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Harga Khusus: {{ selectedCustForPrice.name }}</h3>
          <button class="sheet-close" @click="selectedCustForPrice = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <p class="subtitle">Atur harga satuan khusus untuk pelanggan ini. Kosongkan jika memakai harga umum.</p>

          <div class="price-edit-list">
            <div
              v-for="p in customerPriceList"
              :key="p.product_id"
              class="price-edit-row"
            >
              <div class="p-meta">
                <strong>{{ p.name }}</strong>
                <small>Harga Umum: Rp {{ formatNumber(p.default_price) }}</small>
              </div>
              <div class="p-input-wrap">
                <input
                  v-model.number="p.custom_price"
                  type="number"
                  placeholder="Harga Khusus"
                  @change="saveCustomerPrice(p)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" style="flex:1;" @click="selectedCustForPrice = null">
            <Icon name="check" size="16" /> Selesai / Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Pelanggan Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Pelanggan Baru</h3>
          <button class="sheet-close" @click="showAddModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan / Toko *</label>
            <input v-model="newCust.name" type="text" placeholder="Contoh: Toko Berkah Jaya" required />
          </div>

          <div class="form-group">
            <label>Alamat Lengkap</label>
            <input v-model="newCust.address" type="text" placeholder="Jl. Raya No. ..." />
          </div>

          <div class="form-group">
            <label>Nomor Telepon (WhatsApp)</label>
            <input v-model="newCust.phone" type="text" placeholder="08..." />
          </div>

          <div class="form-group" v-if="user?.role === 'admin'">
            <label>Cabang</label>
            <select v-model="newCust.branch_id">
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label>Sales Penanggung Jawab (Opsional)</label>
            <select v-model="newCust.sales_id">
              <option value="">-- Tanpa Sales / Mandiri --</option>
              <option v-for="s in salesList" :key="s.id" :value="s.id">{{ s.full_name }} ({{ s.branch_name || s.role }})</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Batas Kredit (0 = Tanpa Batas)</label>
              <input v-model.number="newCust.credit_limit" type="number" min="0" />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input v-model.number="newCust.term_days" type="number" min="1" />
            </div>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showAddModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button
            class="btn-primary"
            @click="submitCreateCustomer"
            :disabled="createLoading || !newCust.name"
          >
            <Icon name="check" size="16" /> {{ createLoading ? 'Menyimpan...' : 'Tambah Pelanggan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Edit Pelanggan -->
    <div v-if="showEditModal" class="sheet-overlay" @click.self="showEditModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Edit Data Pelanggan</h3>
          <button class="sheet-close" @click="showEditModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan / Toko *</label>
            <input v-model="editCust.name" type="text" placeholder="Nama toko..." required />
          </div>

          <div class="form-group">
            <label>Alamat Lengkap</label>
            <input v-model="editCust.address" type="text" placeholder="Alamat..." />
          </div>

          <div class="form-group">
            <label>Nomor Telepon (WhatsApp)</label>
            <input v-model="editCust.phone" type="text" placeholder="08..." />
          </div>

          <div class="form-group" v-if="user?.role === 'admin'">
            <label>Cabang</label>
            <select v-model="editCust.branch_id">
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label>Sales Penanggung Jawab</label>
            <select v-model="editCust.sales_id">
              <option value="">-- Tanpa Sales / Mandiri --</option>
              <option v-for="s in salesList" :key="s.id" :value="s.id">{{ s.full_name }} ({{ s.branch_name || s.role }})</option>
            </select>
          </div>

          <div class="form-row" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <div class="form-group">
              <label>Batas Kredit (Rp)</label>
              <input v-model.number="editCust.credit_limit" type="number" min="0" />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input v-model.number="editCust.term_days" type="number" min="1" />
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editCust.active" />
              <span>Pelanggan Aktif</span>
            </label>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showEditModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button
            class="btn-primary"
            @click="submitUpdateCustomer"
            :disabled="editLoading || !editCust.name"
          >
            <Icon name="check" size="16" /> {{ editLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);

const loading = ref(false);
const customers = ref([]);
const branches = ref([]);
const salesList = ref([]);
const searchQuery = ref('');

// Modal Tambah Pelanggan
const showAddModal = ref(false);
const createLoading = ref(false);
const newCust = ref({
  name: '',
  address: '',
  phone: '',
  branch_id: '',
  sales_id: '',
  credit_limit: 0,
  term_days: 14
});

// Modal Edit Pelanggan
const showEditModal = ref(false);
const editLoading = ref(false);
const editCust = ref({
  id: '',
  name: '',
  address: '',
  phone: '',
  branch_id: '',
  sales_id: '',
  credit_limit: 0,
  term_days: 14,
  active: true
});

function openEditModal(c) {
  editCust.value = {
    id: c.id,
    name: c.name || '',
    address: c.address || '',
    phone: c.phone || '',
    branch_id: c.branch_id || '',
    sales_id: c.sales_id || '',
    credit_limit: c.credit_limit || 0,
    term_days: c.term_days || 14,
    active: c.active !== false
  };
  showEditModal.value = true;
}

async function submitUpdateCustomer() {
  const updatedItem = { ...editCust.value };
  
  // Optimistic update: langsung perbarui tampilan kartu pelanggan
  const idx = customers.value.findIndex(c => c.id === updatedItem.id);
  if (idx !== -1) {
    customers.value[idx] = {
      ...customers.value[idx],
      name: updatedItem.name,
      address: updatedItem.address,
      phone: updatedItem.phone,
      active: updatedItem.active
    };
  }

  showEditModal.value = false;
  appStore.showToast('Data pelanggan berhasil diperbarui!', 'success');

  // Kirim update ke server di background
  try {
    await apiFetch('/api/customers', {
      method: 'PUT',
      body: JSON.stringify(updatedItem)
    });
  } catch (err) {
    appStore.showToast('Gagal sinkron: ' + err.message, 'error');
    fetchCustomers(); // rollback jika gagal
  }
}

// Modal Harga Khusus
const selectedCustForPrice = ref(null);
const customerPriceList = ref([]);

async function fetchCustomers() {
  loading.value = true;
  try {
    const res = await apiFetch(`/api/customers?search=${searchQuery.value}`);
    customers.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function fetchBranches() {
  try {
    const res = await apiFetch('/api/branches');
    branches.value = res.data || [];
    if (branches.value.length > 0 && !newCust.value.branch_id) {
      newCust.value.branch_id = branches.value[0].id;
    }
  } catch (e) {}
}

async function fetchSalesList() {
  if (user.value?.role !== 'admin' && user.value?.role !== 'manajer') return;
  try {
    const res = await apiFetch('/api/users?role=sales');
    salesList.value = res.data || [];
  } catch (e) {}
}

async function submitCreateCustomer() {
  createLoading.value = true;
  try {
    await apiFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify(newCust.value)
    });
    appStore.showToast('Pelanggan berhasil ditambahkan!', 'success');
    showAddModal.value = false;
    newCust.value = { name: '', address: '', phone: '', branch_id: branches.value[0]?.id || '', sales_id: '', credit_limit: 0, term_days: 14 };
    fetchCustomers();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    createLoading.value = false;
  }
}

async function openPricesModal(c) {
  selectedCustForPrice.value = c;
  try {
    const res = await apiFetch(`/api/customers/${c.id}/prices`);
    customerPriceList.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

async function saveCustomerPrice(p) {
  if (!p.custom_price || p.custom_price <= 0) return;
  try {
    await apiFetch(`/api/customers/${selectedCustForPrice.value.id}/prices`, {
      method: 'POST',
      body: JSON.stringify({
        product_id: p.product_id,
        price: p.custom_price
      })
    });
    appStore.showToast(`Harga khusus ${p.name} tersimpan!`, 'success');
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    fetchCustomers();
  }, 300);
}

onMounted(() => {
  fetchCustomers();
  fetchBranches();
  fetchSalesList();
});
</script>

<style scoped>
.customers-page {
  padding: 16px;
  padding-bottom: 90px;
}
.page-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.title-meta h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}
.title-meta .subtext {
  font-size: 12px;
  color: var(--text-muted);
}
.btn-add-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: white;
  padding: 8px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 114, 255, 0.25);
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.btn-add-primary:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.header-action {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.search-input {
  flex: 1;
}
.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
}
.empty-icon-box {
  width: 64px;
  height: 64px;
  background: var(--bg-hover);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px auto;
  color: var(--text-muted);
}
.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}
.empty-state p {
  font-size: 13px;
}
.cust-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cust-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cust-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cust-name {
  font-weight: 700;
  font-size: 15px;
}
.cust-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.credit-info {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
}
.cust-actions {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.btn-edit-cust {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  min-height: 34px;
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-edit-cust:hover {
  background: var(--border-color);
  color: var(--primary);
}
.btn-price {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  min-height: 34px;
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-price:hover {
  background: #e2e8f0;
}

/* Modals styling uses global styles.css (.sheet-overlay, .sheet-content, .sheet-head, .sheet-footer) */
.subtitle {
  font-size: 13px;
  color: var(--text-muted);
}
.price-edit-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.price-edit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--bg-app);
  border-radius: 8px;
}
.p-meta {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.p-meta small {
  color: var(--text-muted);
}
.p-input-wrap {
  width: 120px;
}
.p-input-wrap input {
  padding: 6px 8px;
  font-size: 13px;
  text-align: right;
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
</style>
