<template>
  <div class="more-page">
    <!-- Profil Strip -->
    <div class="card profile-strip">
      <div class="avatar">{{ userInitials }}</div>
      <div class="u-info">
        <span class="u-name">{{ user?.full_name }}</span>
        <span class="u-meta">@{{ user?.username }} • {{ user?.role?.toUpperCase() }}</span>
        <small class="u-branch">Cabang: {{ user?.branch_id || 'Semua Cabang' }}</small>
      </div>
    </div>

    <!-- Menu Navigasi Berdasarkan Hak Akses -->
    <div class="menu-list">
      <div class="menu-group-title">Menu Utama & Keuangan</div>

      <router-link to="/receivables" class="menu-item card">
        <div class="m-left">
          <div class="m-icon-box icon-receivables">
            <Icon name="receivables" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Piutang Pelanggan</span>
            <span class="m-sub">Tagihan, penagihan, & pelunasan</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/reports" class="menu-item card">
        <div class="m-left">
          <div class="m-icon-box icon-reports">
            <Icon name="reports" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Laporan Penjualan & Laba</span>
            <span class="m-sub">Ekspor CSV, laba kotor, komisi</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/targets" class="menu-item card">
        <div class="m-left">
          <div class="m-icon-box icon-targets">
            <Icon name="targets" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Target & Komisi Sales</span>
            <span class="m-sub">Monitoring target dan insentif</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/history" class="menu-item card">
        <div class="m-left">
          <div class="m-icon-box icon-history">
            <Icon name="history" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Riwayat Transaksi</span>
            <span class="m-sub">Faktur, retur, dan pembayaran</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <div class="menu-group-title" v-if="canManageData || user?.role === 'sales'">Master Data & Pelanggan</div>

      <router-link to="/customers" class="menu-item card" v-if="canManageData || user?.role === 'sales'">
        <div class="m-left">
          <div class="m-icon-box icon-customers">
            <Icon name="customers" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">{{ user?.role === 'sales' ? 'Pelanggan Saya' : 'Kelola Pelanggan' }}</span>
            <span class="m-sub">{{ user?.role === 'sales' ? 'Daftar & kontak pelanggan yang Anda pegang' : 'Batas kredit, tempo, harga khusus' }}</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/branches" class="menu-item card" v-if="user?.role === 'admin'">
        <div class="m-left">
          <div class="m-icon-box icon-branches">
            <Icon name="branches" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Kelola Cabang</span>
            <span class="m-sub">Cabang usaha & printer struk (58/80 mm)</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/users" class="menu-item card" v-if="user?.role === 'admin'">
        <div class="m-left">
          <div class="m-icon-box icon-users">
            <Icon name="users" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Manajemen User</span>
            <span class="m-sub">Daftar akun, hak akses, reset password</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <router-link to="/audit" class="menu-item card" v-if="user?.role === 'admin'">
        <div class="m-left">
          <div class="m-icon-box icon-audit">
            <Icon name="audit" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Log Aktivitas</span>
            <span class="m-sub">Catatan audit log sistem</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <div class="menu-group-title">Pengaturan Akun & Aplikasi</div>

      <router-link to="/change-password" class="menu-item card">
        <div class="m-left">
          <div class="m-icon-box icon-key">
            <Icon name="key" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title">Ganti Password</span>
            <span class="m-sub">Perbarui kata sandi akun</span>
          </div>
        </div>
        <span class="m-arrow">›</span>
      </router-link>

      <button class="menu-item card btn-logout" @click="handleLogout">
        <div class="m-left">
          <div class="m-icon-box icon-logout">
            <Icon name="logout" size="20" />
          </div>
          <div class="m-text">
            <span class="m-title text-danger">Keluar (Logout)</span>
            <span class="m-sub">Akhiri sesi di perangkat ini</span>
          </div>
        </div>
        <span class="m-arrow text-danger">›</span>
      </button>
    </div>

    <!-- Branding Footer -->
    <div class="brand-footer">
      <img src="/logo.png" alt="Logo" class="footer-logo" />
      <span class="brand-name">Sales Terpadu RH Frozen</span>
      <span class="brand-motto">Bersama Maju Lebih Baik</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

const user = computed(() => authStore.user);
const canManageData = computed(() => ['admin', 'manajer'].includes(user.value?.role));

const userInitials = computed(() => {
  if (!user.value?.full_name) return 'U';
  return user.value.full_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
});

async function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar?')) return;
  await authStore.logout();
  appStore.showToast('Berhasil keluar', 'info');
  window.location.href = '/login';
}
</script>

<style scoped>
.more-page {
  padding: 16px;
  padding-bottom: 90px;
}
.profile-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 18px;
}
.u-info {
  display: flex;
  flex-direction: column;
}
.u-name {
  font-size: 15px;
  font-weight: 700;
}
.u-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.u-branch {
  font-size: 11px;
  color: var(--text-light);
}

.menu-group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  margin: 12px 4px 6px 4px;
}
.menu-list {
  display: flex;
  flex-direction: column;
}
.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-decoration: none;
  color: inherit;
  margin-bottom: 8px;
  padding: 12px 14px;
  cursor: pointer;
}
.m-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.m-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.menu-item:hover .m-icon-box {
  transform: scale(1.08);
}

.icon-receivables { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.icon-reports     { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.icon-targets     { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.icon-history     { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
.icon-customers   { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
.icon-branches    { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
.icon-users       { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
.icon-audit       { background: rgba(20, 184, 166, 0.15); color: #2dd4bf; }
.icon-key         { background: rgba(234, 179, 8, 0.15); color: #facc15; }
.icon-logout      { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.m-text {
  display: flex;
  flex-direction: column;
}
.m-title {
  font-weight: 600;
  font-size: 14px;
}
.m-sub {
  font-size: 11px;
  color: var(--text-muted);
}
.m-arrow {
  font-size: 20px;
  color: var(--text-light);
}

.btn-logout {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  width: 100%;
  text-align: left;
}

.brand-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 24px;
  gap: 4px;
}
.footer-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}
.brand-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--primary);
}
.brand-motto {
  font-size: 11px;
  color: var(--text-light);
}
</style>
