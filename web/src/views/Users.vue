<template>
  <div class="users-page">
    <div class="page-title-bar">
      <div class="title-meta">
        <h2>Manajemen Pengguna</h2>
        <span class="subtext">Kelola akun Admin dan Tim Sales</span>
      </div>
      <button class="btn-add-primary" @click="showAddModal = true">
        <Icon name="plus" size="16" /> + Tambah User
      </button>
    </div>

    <div class="header-action">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari user / nama lengkap / username / cabang..."
        class="search-input"
      />
    </div>

    <!-- Filter Tab Role (Hanya Admin dan Sales) -->
    <div class="role-tabs">
      <button
        v-for="r in roles"
        :key="r"
        class="role-btn"
        :class="{ active: selectedRole === r }"
        @click="selectedRole = r"
      >
        {{ r }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Memuat data pengguna...</div>
    <div v-else-if="filteredUsers.length === 0" class="card empty-state">
      <div class="empty-icon-box"><Icon name="users" size="38" /></div>
      <h3>Tidak Ada Pengguna</h3>
      <p>Tidak ada pengguna yang cocok dengan filter pencarian.</p>
    </div>
    <div v-else>
      <div class="users-grid">
        <div
          v-for="u in paginatedUsers"
          :key="u.id"
          class="card user-card"
          @click="openUserDetail(u)"
        >
          <div class="user-main">
            <div class="avatar">{{ getInitials(u.full_name) }}</div>
            <div class="user-info">
              <span class="user-name">{{ u.full_name }}</span>
              <small class="user-username">@{{ u.username }}</small>
              <span class="branch-tag" v-if="u.branch_name"><Icon name="map-pin" size="11" /> {{ u.branch_name }}</span>
            </div>
          </div>

          <div class="user-badges">
            <span class="badge" :class="getRoleBadgeClass(u.role)">
              {{ u.role.toUpperCase() }}
            </span>
            <span class="badge" :class="u.active ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ u.active ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Pagination Pengguna (10 data per halaman) -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredUsers.length) }} dari {{ filteredUsers.length }} user
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

    <!-- Modal Tambah User Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Pengguna Baru</h3>
          <button class="sheet-close" @click="showAddModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Lengkap *</label>
            <input v-model="newUser.full_name" type="text" placeholder="Contoh: Budi Santoso" required />
          </div>

          <div class="form-group">
            <label>Username * (Huruf kecil, angka, underscore)</label>
            <input v-model="newUser.username" type="text" placeholder="sales_solo" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Peran (Role) *</label>
              <select v-model="newUser.role">
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div class="form-group" v-if="newUser.role !== 'admin'">
              <label>Cabang *</label>
              <select v-model="newUser.branch_id">
                <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <div class="pw-label-row">
              <label>Password Awal *</label>
              <button type="button" class="btn-gen-pw" @click="generateRandomPassword">
                <Icon name="refresh" size="13" /> Buat Acak
              </button>
            </div>
            <input v-model="newUser.password" type="text" placeholder="Minimal 8 karakter (huruf & angka)" required />
          </div>

          <button
            class="btn-save"
            @click="submitCreateUser"
            :disabled="createLoading || !newUser.username || !newUser.full_name || !newUser.password"
          >
            {{ createLoading ? 'Menyimpan...' : 'Buat User' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Sheet Detail & Kelola User -->
    <div v-if="selectedUser" class="sheet-overlay" @click.self="selectedUser = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <div class="sheet-title">
            <h3>{{ selectedUser.full_name }}</h3>
            <span class="badge" :class="selectedUser.active ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ selectedUser.active ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>
          <button class="sheet-close" @click="selectedUser = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="u-detail-box">
            <div>Username: <strong>@{{ selectedUser.username }}</strong></div>
            <div>Peran: <strong>{{ selectedUser.role.toUpperCase() }}</strong></div>
            <div>Cabang: <strong>{{ selectedUser.branch_name }}</strong></div>
            <div>Dibuat: <span>{{ selectedUser.created_at?.substring(0, 10) }}</span></div>
            <div>Login Terakhir: <span>{{ selectedUser.last_login_at || 'Belum pernah' }}</span></div>
          </div>

          <div class="action-buttons">
            <button class="btn-action btn-reset" @click="handleResetPassword">
              <Icon name="key" size="13" /> Reset Password
            </button>

            <button
              class="btn-action"
              :class="selectedUser.active ? 'btn-deactivate' : 'btn-activate'"
              @click="toggleUserActive"
            >
              {{ selectedUser.active ? '⛔ Nonaktifkan Akun' : '✓ Aktifkan Akun' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();

const loading = ref(false);
const users = ref([]);
const branches = ref([]);
const searchQuery = ref('');
const roles = ['Semua', 'admin', 'sales'];
const selectedRole = ref('Semua');

// Pagination state
const currentPage = ref(1);
const pageSize = ref(10);

// State Tambah User
const showAddModal = ref(false);
const createLoading = ref(false);
const newUser = ref({
  username: '',
  full_name: '',
  role: 'sales',
  branch_id: '',
  password: ''
});

// State Detail User
const selectedUser = ref(null);

const filteredUsers = computed(() => {
  let list = users.value;
  if (selectedRole.value !== 'Semua') {
    list = list.filter(u => u.role === selectedRole.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.branch_name && u.branch_name.toLowerCase().includes(q))
    );
  }
  return list;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredUsers.value.length / pageSize.value));
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredUsers.value.slice(start, start + pageSize.value);
});

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/users');
    users.value = res.data || [];
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
    if (branches.value.length > 0 && !newUser.value.branch_id) {
      newUser.value.branch_id = branches.value[0].id;
    }
  } catch (e) {}
}

function generateRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  newUser.value.password = pw;
  appStore.showToast(`Password acak dibuat: ${pw}`, 'info');
}

async function submitCreateUser() {
  const tempId = 'temp-' + Date.now();
  const branchObj = branches.value.find(b => b.id === newUser.value.branch_id);
  const addedUser = {
    id: tempId,
    username: newUser.value.username.trim(),
    full_name: newUser.value.full_name.trim(),
    role: newUser.value.role,
    branch_id: newUser.value.branch_id,
    branch_name: branchObj ? branchObj.name : '',
    active: true,
    created_at: new Date().toISOString()
  };

  // 1. INSTAN OPTIMISTIK: Langsung muncul di paling atas
  users.value.unshift(addedUser);
  showAddModal.value = false;
  appStore.showToast('User baru berhasil dibuat! (Sinkronisasi di latar belakang...)', 'success');
  appStore.startSync();

  const payloadToSend = { ...newUser.value };
  newUser.value = { username: '', full_name: '', role: 'sales', branch_id: branches.value[0]?.id || '', password: '' };

  // 2. DI LATAR BELAKANG: Kirim ke server
  apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(payloadToSend)
  }).then(res => {
    if (res?.data?.id) {
      const idx = users.value.findIndex(u => u.id === tempId);
      if (idx !== -1) {
        users.value[idx] = { ...users.value[idx], ...res.data };
      }
    }
  }).catch(err => {
    console.error('[SYNC USER ERROR]', err);
    appStore.showToast('Gagal sinkron user baru: ' + err.message, 'error');
    users.value = users.value.filter(u => u.id !== tempId);
  }).finally(() => {
    appStore.finishSync();
  });
}

function openUserDetail(u) {
  selectedUser.value = u;
}

async function toggleUserActive() {
  const u = selectedUser.value;
  const newStatus = !u.active;
  const actionText = newStatus ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm(`Apakah Anda yakin ingin ${actionText} akun @${u.username}?`)) return;

  // Optimistic update
  u.active = newStatus;
  selectedUser.value = null;
  appStore.showToast(`Akun @${u.username} di${newStatus ? 'aktifkan' : 'nonaktifkan'}!`, 'success');
  appStore.startSync();

  apiFetch(`/api/users/${u.id}/active`, {
    method: 'POST',
    body: JSON.stringify({ active: newStatus })
  }).catch(err => {
    appStore.showToast(err.message, 'error');
    u.active = !newStatus; // Rollback
  }).finally(() => {
    appStore.finishSync();
  });
}

async function handleResetPassword() {
  const newPw = prompt('Masukkan password baru (minimal 8 karakter huruf & angka):');
  if (!newPw) return;

  appStore.startSync();
  try {
    await apiFetch(`/api/users/${selectedUser.value.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPw })
    });
    appStore.showToast(`Password @${selectedUser.value.username} berhasil direset!`, 'success');
    selectedUser.value = null;
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    appStore.finishSync();
  }
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'admin': return 'badge-dibatalkan';
    case 'manajer': return 'badge-menunggu';
    case 'sales': return 'badge-proses';
    default: return 'badge-dikirim';
  }
}

onMounted(() => {
  fetchUsers();
  fetchBranches();
});
</script>

<style scoped>
.users-page {
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
  margin-bottom: 12px;
}
.search-input {
  width: 100%;
}
.role-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 14px;
}
.role-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 12px;
  min-height: 34px;
  padding: 4px 14px;
  border-radius: 8px;
  text-transform: capitalize;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}
.role-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.empty-state {
  text-align: center;
  padding: 40px 16px;
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
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 4px;
}
.users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.user-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.user-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.user-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, #1e40af 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.user-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}
.user-username {
  font-size: 12px;
  color: var(--text-muted);
}
.branch-tag {
  font-size: 11px;
  color: var(--primary);
  background: rgba(0, 114, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: fit-content;
}
.user-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
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
.sheet-title {
  display: flex;
  align-items: center;
  gap: 8px;
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
.u-detail-box {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.pw-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-gen-pw {
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  color: var(--primary);
  font-size: 11px;
  padding: 2px 6px;
  min-height: 26px;
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.btn-action {
  width: 100%;
  min-height: 42px;
  font-size: 14px;
  color: white;
}
.btn-reset { background: var(--primary); }
.btn-deactivate { background: var(--danger); }
.btn-activate { background: var(--success); }
</style>
