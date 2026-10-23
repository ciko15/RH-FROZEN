<template>
  <div class="branches-page">
    <div class="page-title-bar">
      <div class="title-meta">
        <h2>Daftar Cabang</h2>
        <span class="subtext">Kelola unit cabang usaha dan printer kasir per wilayah</span>
      </div>
      <button class="btn-add-primary" @click="openAddModal">
        <Icon name="plus" size="16" /> + Cabang
      </button>
    </div>

    <div class="header-action">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari nama cabang / kode cabang..."
        class="search-input"
      />
    </div>

    <!-- Filter Status Cabang -->
    <div class="status-tabs">
      <button
        v-for="s in statusOptions"
        :key="s.value"
        class="status-btn"
        :class="{ active: selectedStatus === s.value }"
        @click="selectedStatus = s.value"
      >
        {{ s.label }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Memuat data cabang...</div>
    <div v-else-if="filteredBranches.length === 0" class="card empty-state">
      <div class="empty-icon-box"><Icon name="branches" size="38" /></div>
      <h3>Belum Ada Cabang</h3>
      <p>Tidak ada cabang yang cocok dengan pencarian atau filter.</p>
    </div>
    <div v-else>
      <div class="branches-grid">
        <div
          v-for="b in paginatedBranches"
          :key="b.id"
          class="card branch-card"
          :class="{ 'card-inactive': !b.active }"
        >
          <div class="branch-card-header">
            <div class="branch-identity">
              <div class="branch-avatar">
                <Icon name="branches" size="20" />
              </div>
              <div class="branch-meta">
                <span class="branch-name">{{ b.name }}</span>
                <span class="branch-code">Kode: <strong>{{ b.id }}</strong></span>
              </div>
            </div>
            <span class="badge" :class="b.active ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ b.active ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>

          <div class="branch-card-body">
            <div class="info-row">
              <span class="info-label"><Icon name="printer" size="13" /> Printer Struk</span>
              <span class="info-val">{{ b.paper_width || 58 }} mm {{ Number(b.paper_width) === 80 ? '(Desktop POS)' : '(Mobile)' }}</span>
            </div>
          </div>

          <div class="branch-card-footer">
            <button class="btn-action edit-btn" @click="openEditModal(b)" title="Edit Cabang">
              <Icon name="edit" size="13" />
              <span>Edit</span>
            </button>
            <button class="btn-action delete-btn" @click="confirmDeleteBranch(b)" title="Hapus / Nonaktifkan">
              <Icon name="trash" size="13" />
              <span>Hapus</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination Cabang (10 data per halaman) -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredBranches.length) }} dari {{ filteredBranches.length }} cabang
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ currentPage }} / {{ totalPages }}</span>
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

    <!-- Modal Tambah / Edit Cabang -->
    <div v-if="showModal" class="sheet-overlay" @click.self="showModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>{{ isEditing ? 'Edit Data Cabang' : 'Tambah Cabang Baru' }}</h3>
          <button class="sheet-close" @click="showModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group" v-if="isEditing">
            <label>Kode Cabang</label>
            <input :value="branchForm.id" type="text" disabled class="input-disabled" />
          </div>

          <div class="form-group">
            <label>Nama Cabang *</label>
            <input v-model="branchForm.name" type="text" placeholder="Contoh: Cabang Wonosobo Baru" required />
          </div>

          <div class="form-group">
            <label>Lebar Kertas Struk Thermal</label>
            <select v-model="branchForm.paper_width">
              <option value="58">58 mm (Printer Mini / Mobile Bluetooth)</option>
              <option value="80">80 mm (Printer Desktop POS / Kasir)</option>
            </select>
          </div>

          <div class="form-group" v-if="isEditing">
            <label>Status Operasional</label>
            <select v-model="branchForm.active">
              <option :value="true">Aktif (Dapat digunakan transaksi & user)</option>
              <option :value="false">Nonaktif (Ditutup sementara)</option>
            </select>
          </div>

        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button
            class="btn-primary"
            @click="submitBranchForm"
            :disabled="actionLoading || !branchForm.name.trim()"
          >
            <Icon name="check" size="16" /> {{ actionLoading ? 'Menyimpan...' : (isEditing ? 'Perbarui Cabang' : 'Simpan Cabang Baru') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();

const loading = ref(false);
const branches = ref([]);
const showModal = ref(false);
const isEditing = ref(false);
const actionLoading = ref(false);

const searchQuery = ref('');
const selectedStatus = ref('all');
const statusOptions = [
  { label: 'Semua', value: 'all' },
  { label: 'Aktif', value: 'active' },
  { label: 'Nonaktif', value: 'inactive' }
];

const currentPage = ref(1);
const pageSize = 10;

const branchForm = ref({
  id: '',
  name: '',
  paper_width: '58',
  active: true
});

const filteredBranches = computed(() => {
  return branches.value.filter(b => {
    // Filter status
    if (selectedStatus.value === 'active' && !b.active) return false;
    if (selectedStatus.value === 'inactive' && b.active) return false;

    // Search query
    if (!searchQuery.value.trim()) return true;
    const q = searchQuery.value.toLowerCase();
    const nameMatch = (b.name || '').toLowerCase().includes(q);
    const idMatch = (b.id || '').toLowerCase().includes(q);
    return nameMatch || idMatch;
  });
});

const totalPages = computed(() => {
  return Math.ceil(filteredBranches.value.length / pageSize) || 1;
});

const paginatedBranches = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredBranches.value.slice(start, start + pageSize);
});

watch([searchQuery, selectedStatus], () => {
  currentPage.value = 1;
});

async function fetchBranches() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/branches');
    branches.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openAddModal() {
  isEditing.value = false;
  branchForm.value = {
    id: '',
    name: '',
    paper_width: '58',
    active: true
  };
  showModal.value = true;
}

function openEditModal(b) {
  isEditing.value = true;
  branchForm.value = {
    id: b.id,
    name: b.name,
    paper_width: String(b.paper_width || 58),
    active: b.active
  };
  showModal.value = true;
}

async function submitBranchForm() {
  const nameTrim = branchForm.value.name.trim();
  if (!nameTrim) {
    appStore.showToast('Nama cabang wajib diisi', 'warning');
    return;
  }

  const isEdit = isEditing.value;
  const payload = { ...branchForm.value, name: nameTrim };

  // Optimistic UI update
  if (isEdit) {
    const idx = branches.value.findIndex(b => b.id === payload.id);
    if (idx !== -1) {
      branches.value[idx] = {
        ...branches.value[idx],
        name: payload.name,
        paper_width: payload.paper_width,
        active: payload.active
      };
    }
  } else {
    const tempId = 'BR-' + Date.now().toString(36).toUpperCase();
    branches.value.unshift({
      id: tempId,
      name: payload.name,
      paper_width: payload.paper_width,
      active: true
    });
  }

  showModal.value = false;
  appStore.showToast(isEdit ? `Cabang "${nameTrim}" diperbarui` : `Cabang "${nameTrim}" ditambahkan`, 'success');
  appStore.startSync();

  try {
    if (isEdit) {
      await apiFetch('/api/branches', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch('/api/branches', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          paper_width: payload.paper_width
        })
      });
    }
    // Refresh quietly in background
    const res = await apiFetch('/api/branches');
    if (res.data) branches.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchBranches();
  } finally {
    appStore.finishSync();
  }
}

async function confirmDeleteBranch(b) {
  if (!confirm(`Apakah Anda yakin ingin menghapus / menonaktifkan cabang "${b.name}"?`)) {
    return;
  }

  // Optimistic update
  const original = [...branches.value];
  branches.value = branches.value.filter(item => item.id !== b.id);
  appStore.showToast(`Cabang "${b.name}" dinonaktifkan/dihapus`, 'success');
  appStore.startSync();

  try {
    await apiFetch(`/api/branches?id=${b.id}`, {
      method: 'DELETE'
    });
    const res = await apiFetch('/api/branches');
    if (res.data) branches.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    branches.value = original;
  } finally {
    appStore.finishSync();
  }
}

onMounted(() => {
  fetchBranches();
});
</script>

<style scoped>
.branches-page {
  padding: 16px;
  padding-bottom: 90px;
}

.page-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  gap: 12px;
}
.title-meta h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px 0;
}
.subtext {
  font-size: 12px;
  color: var(--text-muted);
}
.btn-add-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: var(--radius-btn);
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
  margin-bottom: 10px;
}
.search-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
  box-sizing: border-box;
}

/* Status Filter Tabs */
.status-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.status-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.status-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  box-shadow: 0 2px 6px rgba(0, 114, 255, 0.2);
}

/* 2-Column Responsive Grid */
.branches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}

.branch-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.branch-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-inactive {
  opacity: 0.65;
  border: 1px dashed var(--border-color);
}

.branch-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.branch-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.branch-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(0, 114, 255, 0.1);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.branch-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.branch-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.branch-code {
  font-size: 11px;
  color: var(--text-muted);
}

.branch-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-hover);
  border-radius: 8px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.info-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
}
.info-val {
  font-weight: 600;
  color: var(--text-main);
}

.branch-card-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}
.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s ease;
}
.edit-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(0, 114, 255, 0.08);
}
.delete-btn {
  color: #ef4444;
}
.delete-btn:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 4px 8px 4px;
  margin-top: 14px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}
.page-info {
  font-size: 12px;
  color: var(--text-muted);
}
.page-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-page {
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-main);
  transition: all 0.2s ease;
}
.btn-page:hover:not(:disabled) {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
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

/* Modals */
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
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted);
}
.sheet-body {
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
.form-group input,
.form-group select {
  padding: 10px 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
}
.input-disabled {
  background: var(--bg-hover) !important;
  color: var(--text-muted) !important;
  cursor: not-allowed;
}
.sheet-footer {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
.btn-secondary {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--bg-hover);
  color: var(--text-main);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-primary {
  flex: 2;
  padding: 10px;
  border-radius: var(--radius-btn);
  border: none;
  background: var(--primary);
  color: white;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
