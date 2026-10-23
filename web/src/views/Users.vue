<template>
  <div class="users-page">
    <div class="header-action">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari user / nama..."
        class="search-input"
      />
      <button class="btn-add" @click="showAddModal = true">+</button>
    </div>

    <!-- Filter Tab Role -->
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
    <div v-else class="users-list">
      <div
        v-for="u in filteredUsers"
        :key="u.id"
        class="card user-card"
        @click="openUserDetail(u)"
      >
        <div class="user-left">
          <div class="avatar">{{ getInitials(u.full_name) }}</div>
          <div class="user-info">
            <span class="user-name">{{ u.full_name }}</span>
            <small class="user-username">@{{ u.username }}</small>
            <span class="branch-tag">{{ u.branch_name }}</span>
          </div>
        </div>

        <div class="user-right">
          <span class="badge" :class="getRoleBadgeClass(u.role)">
            {{ u.role.toUpperCase() }}
          </span>
          <span class="badge" :class="u.active ? 'badge-dikirim' : 'badge-dibatalkan'">
            {{ u.active ? 'Aktif' : 'Nonaktif' }}
          </span>
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
            <label>Username * (Huruf kecil, angka, titik, underscore)</label>
            <input v-model="newUser.username" type="text" placeholder="budi.solo" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Peran (Role) *</label>
              <select v-model="newUser.role">
                <option value="sales">Sales</option>
                <option value="kasir">Kasir</option>
                <option value="manajer">Manajer</option>
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
const roles = ['Semua', 'admin', 'manajer', 'sales', 'kasir'];
const selectedRole = ref('Semua');

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
    const q = searchQuery.value.toLowerCase();
    list = list.filter(u => u.username.includes(q) || u.full_name.toLowerCase().includes(q));
  }
  return list;
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
  createLoading.value = true;
  try {
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(newUser.value)
    });
    appStore.showToast('User baru berhasil dibuat!', 'success');
    showAddModal.value = false;
    newUser.value = { username: '', full_name: '', role: 'sales', branch_id: branches.value[0]?.id || '', password: '' };
    fetchUsers();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    createLoading.value = false;
  }
}

function openUserDetail(u) {
  selectedUser.value = u;
}

async function toggleUserActive() {
  const u = selectedUser.value;
  const newStatus = !u.active;
  const actionText = newStatus ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm(`Apakah Anda yakin ingin ${actionText} akun @${u.username}?`)) return;

  try {
    await apiFetch(`/api/users/${u.id}/active`, {
      method: 'POST',
      body: JSON.stringify({ active: newStatus })
    });
    appStore.showToast(`Akun @${u.username} berhasil di${newStatus ? 'aktifkan' : 'nonaktifkan'}`, 'success');
    selectedUser.value = null;
    fetchUsers();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

async function handleResetPassword() {
  const newPw = prompt('Masukkan password baru (minimal 8 karakter huruf & angka):');
  if (!newPw) return;

  try {
    await apiFetch(`/api/users/${selectedUser.value.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPw })
    });
    appStore.showToast(`Password @${selectedUser.value.username} berhasil direset!`, 'success');
    selectedUser.value = null;
  } catch (err) {
    appStore.showToast(err.message, 'error');
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
.header-action {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.search-input {
  flex: 1;
}
.btn-add {
  width: 44px;
  min-height: 44px;
  background: var(--primary);
  color: white;
  border-radius: var(--radius-btn);
  font-size: 24px;
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
  padding: 4px 10px;
  border-radius: 8px;
  text-transform: capitalize;
}
.role-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.users-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  margin-bottom: 0;
}
.user-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
}
.user-info {
  display: flex;
  flex-direction: column;
}
.user-name {
  font-weight: 700;
  font-size: 14px;
}
.user-username {
  font-size: 12px;
  color: var(--text-muted);
}
.branch-tag {
  font-size: 10px;
  color: var(--text-light);
  margin-top: 2px;
}
.user-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
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
