<template>
  <div class="branches-page">
    <div class="header-action">
      <div class="section-title-wrap">
        <div class="section-title">Daftar Cabang</div>
        <span class="subtext">Kelola unit cabang usaha dan printer kasir</span>
      </div>
      <button class="btn-add" @click="openAddModal">
        <Icon name="plus" size="14" />
        <span>+ Cabang</span>
      </button>
    </div>

    <div v-if="loading" class="state-msg">Memuat data cabang...</div>
    <div v-else-if="branches.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="branches" size="38" /></div>
      <h3>Belum Ada Cabang</h3>
      <p>Tambahkan cabang usaha untuk mengelola operasional per wilayah.</p>
    </div>
    <div v-else class="branch-list">
      <div
        v-for="b in branches"
        :key="b.id"
        class="card branch-card"
        :class="{ 'card-inactive': !b.active }"
      >
        <div class="branch-head">
          <div class="branch-title-area">
            <span class="branch-name">
              <Icon name="branches" size="16" /> {{ b.name }}
            </span>
            <span class="badge" :class="b.active ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ b.active ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>
          <div class="branch-card-actions">
            <button class="btn-action-icon edit-btn" @click="openEditModal(b)" title="Edit Cabang">
              <Icon name="edit" size="14" />
              <span>Edit</span>
            </button>
            <button class="btn-action-icon delete-btn" @click="confirmDeleteBranch(b)" title="Hapus / Nonaktifkan">
              <Icon name="trash" size="14" />
              <span>Hapus</span>
            </button>
          </div>
        </div>

        <div class="branch-info">
          <span>Kode: <strong>{{ b.id }}</strong></span>
          <span>Printer Struk: <strong>{{ b.paper_width }} mm</strong></span>
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
import { ref, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();

const loading = ref(false);
const branches = ref([]);
const showModal = ref(false);
const isEditing = ref(false);
const actionLoading = ref(false);

const branchForm = ref({
  id: '',
  name: '',
  paper_width: '58',
  active: true
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
  if (!branchForm.value.name.trim()) {
    appStore.showToast('Nama cabang wajib diisi', 'warning');
    return;
  }

  actionLoading.value = true;
  try {
    if (isEditing.value) {
      await apiFetch('/api/branches', {
        method: 'PUT',
        body: JSON.stringify(branchForm.value)
      });
      appStore.showToast(`Cabang "${branchForm.value.name}" berhasil diperbarui!`, 'success');
    } else {
      await apiFetch('/api/branches', {
        method: 'POST',
        body: JSON.stringify({
          name: branchForm.value.name,
          paper_width: branchForm.value.paper_width
        })
      });
      appStore.showToast(`Cabang baru "${branchForm.value.name}" berhasil ditambahkan!`, 'success');
    }
    showModal.value = false;
    fetchBranches();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    actionLoading.value = false;
  }
}

async function confirmDeleteBranch(b) {
  if (!confirm(`Apakah Anda yakin ingin menghapus / menonaktifkan cabang "${b.name}"?`)) {
    return;
  }

  try {
    await apiFetch(`/api/branches?id=${b.id}`, {
      method: 'DELETE'
    });
    appStore.showToast(`Cabang "${b.name}" berhasil dihapus/dinonaktifkan!`, 'success');
    fetchBranches();
  } catch (err) {
    appStore.showToast(err.message, 'error');
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
.header-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.section-title-wrap {
  display: flex;
  flex-direction: column;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}
.subtext {
  font-size: 12px;
  color: var(--text-muted);
}
.btn-add {
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
.btn-add:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.branch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.branch-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}
.card-inactive {
  opacity: 0.65;
  border: 1px dashed var(--border-color);
}
.branch-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.branch-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.branch-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.branch-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-action-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: var(--bg-hover);
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
.branch-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
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

/* Modals handled globally in styles.css */
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
.input-disabled {
  background: var(--bg-hover) !important;
  color: var(--text-muted) !important;
  cursor: not-allowed;
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius-btn);
  border: none;
  margin-top: 8px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.btn-save:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
</style>
