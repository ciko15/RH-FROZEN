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
    <div v-else-if="filteredCustomers.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="customers" size="38" /></div>
      <h3>Belum Ada Pelanggan</h3>
      <p>{{ user?.role === 'sales' ? 'Anda belum memiliki pelanggan yang terdaftar.' : 'Belum ada data pelanggan di cabang ini.' }}</p>
    </div>
    <div v-else>
      <div class="cust-list">
        <div
          v-for="c in paginatedCustomers"
          :key="c.id"
          class="card cust-card"
        >
          <div class="cust-head">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="cust-name">{{ c.name }}</span>
              <span v-if="c.balance > 0" class="badge badge-dibatalkan" style="font-weight:700;">
                ⚠️ Piutang: Rp {{ formatNumber(c.balance) }}
              </span>
            </div>
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
              <span>Tempo: <strong>{{ formatNumber(c.term_days) }} Hari</strong></span>
              <span>Saldo Bon/Piutang: <strong :style="c.balance > 0 ? 'color:#dc2626;' : ''">Rp {{ formatNumber(c.balance || 0) }}</strong></span>
            </div>
          </div>

          <div class="cust-actions">
            <button class="btn-edit-cust" @click="openEditModal(c)" title="Edit data pelanggan">
              <Icon name="edit" size="13" /> Edit
            </button>
            <button class="btn-price" @click="openPricesModal(c)" title="Atur harga khusus">
              <Icon name="tag" size="13" /> Harga
            </button>
            <button class="btn-delete-cust" @click="confirmDeleteCustomer(c)" title="Hapus pelanggan">
              <Icon name="trash" size="13" /> Hapus
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination Footer -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((currentPage - 1) * pageSize + 1) }} - {{ formatNumber(Math.min(currentPage * pageSize, filteredCustomers.length)) }} dari {{ formatNumber(filteredCustomers.length) }} data
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ formatNumber(currentPage) }} / {{ formatNumber(totalPages) }}</span>
          <button
            class="btn-page"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            Berikutnya &raquo;
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
              <input 
                :value="formatInputNumber(newCust.credit_limit)" 
                @input="newCust.credit_limit = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="0" 
              />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input 
                :value="formatInputNumber(newCust.term_days)" 
                @input="newCust.term_days = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="14" 
              />
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
              <input 
                :value="formatInputNumber(editCust.credit_limit)" 
                @input="editCust.credit_limit = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="0" 
              />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input 
                :value="formatInputNumber(editCust.term_days)" 
                @input="editCust.term_days = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="14" 
              />
            </div>
          </div>

          <!-- Edit Hutang / Piutang Pelanggan -->
          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Saldo Bon / Hutang Piutang (Rp)</span>
              <span v-if="editCust.balance > 0" class="badge badge-dibatalkan" style="font-size: 11px;">Ada Tagihan</span>
            </label>
            <input 
              :value="formatInputNumber(editCust.balance)" 
              @input="editCust.balance = parseInputNumber($event.target.value)" 
              type="text" 
              inputmode="numeric" 
              placeholder="0" 
              style="font-weight: 600; color: #dc2626;"
            />
            <small style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">
              * Perubahan saldo hutang ini langsung memperbarui data piutang pelanggan di sistem & spreadsheet.
            </small>
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
import { formatNumber } from '../utils/format.js';

function formatInputNumber(val) {
  if (val === '' || val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/\D/g, ''));
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('id-ID').format(num);
}

function parseInputNumber(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/\D/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);

const loading = ref(false);
const customers = ref([]);
const branches = ref([]);
const salesList = ref([]);
const searchQuery = ref('');

// Pagination (10 data per halaman)
const currentPage = ref(1);
const pageSize = ref(10);

const filteredCustomers = computed(() => {
  let list = customers.value;
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    list = list.filter(c => 
      (c.name && String(c.name).toLowerCase().includes(q)) ||
      (c.phone && String(c.phone).includes(q)) ||
      (c.address && String(c.address).toLowerCase().includes(q))
    );
  }
  return list;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredCustomers.value.length / pageSize.value));
});

const paginatedCustomers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCustomers.value.slice(start, start + pageSize.value);
});

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
  balance: 0,
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
    balance: c.balance || 0,
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
      credit_limit: updatedItem.credit_limit,
      term_days: updatedItem.term_days,
      balance: updatedItem.balance,
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
  if (!newCust.value.name || !newCust.value.name.trim()) {
    appStore.showToast('Nama pelanggan wajib diisi', 'warning');
    return;
  }

  // 1. INSTAN: Langsung masukkan data ke tampilan tanpa perlu menunggu Google Apps Script
  const tempId = 'temp-' + Date.now();
  const addedItem = {
    id: tempId,
    name: newCust.value.name.trim(),
    address: newCust.value.address || '',
    phone: newCust.value.phone || '',
    branch_id: newCust.value.branch_id || user.value?.branch_id || 'BR-KERTEK',
    sales_id: user.value?.role === 'sales' ? user.value.id : (newCust.value.sales_id || user.value?.id || ''),
    sales_name: user.value?.full_name || '',
    balance: 0,
    credit_limit: parseFloat(newCust.value.credit_limit || 0),
    term_days: parseInt(newCust.value.term_days || 14, 10),
    active: true
  };

  // Langsung tampilkan di kartu paling atas
  customers.value.unshift(addedItem);
  showAddModal.value = false;
  appStore.showToast('Pelanggan berhasil ditambahkan!', 'success');

  const payloadToSend = { ...newCust.value };
  newCust.value = { name: '', address: '', phone: '', branch_id: branches.value[0]?.id || '', sales_id: '', credit_limit: 0, term_days: 14 };

  // 2. DI BALIK LAYAR: Simpan ke Google Sheet secara asinkron
  appStore.startSync();
  apiFetch('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payloadToSend)
  }).then(res => {
    // Ganti tempId dengan ID asli dari server
    if (res?.data?.id) {
      const idx = customers.value.findIndex(c => c.id === tempId);
      if (idx !== -1) {
        customers.value[idx].id = res.data.id;
      }
    }
  }).catch(err => {
    console.error('[SYNC CUSTOMER ERROR]', err);
    appStore.showToast('Gagal sinkron ke database: ' + err.message, 'error');
    // Rollback jika server gagal
    customers.value = customers.value.filter(c => c.id !== tempId);
  }).finally(() => {
    appStore.finishSync();
  });
}

async function confirmDeleteCustomer(c) {
  const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus pelanggan "${c.name}"?`);
  if (!confirmed) return;

  // 1. INSTAN: Langsung hilangkan dari tampilan
  const prevList = [...customers.value];
  customers.value = customers.value.filter(item => item.id !== c.id);
  appStore.showToast(`Pelanggan "${c.name}" berhasil dihapus`, 'info');

  // 2. DI BALIK LAYAR: Hapus di server
  try {
    await apiFetch(`/api/customers?id=${encodeURIComponent(c.id)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('[DELETE CUSTOMER ERROR]', err);
    appStore.showToast('Gagal menghapus di database: ' + err.message, 'error');
    customers.value = prevList; // rollback jika gagal
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.cust-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cust-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
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
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.btn-edit-cust {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-hover, #f1f5f9);
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-main, #1e293b);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-edit-cust:hover {
  background: #e2e8f0;
  color: var(--primary, #0284c7);
}
.btn-price {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #16a34a;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-price:hover {
  background: #dcfce7;
}
.btn-delete-cust {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-delete-cust:hover {
  background: #fee2e2;
  color: #b91c1c;
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
