<template>
  <aside class="sidebar">
    <!-- Brand Header -->
    <div class="sidebar-header">
      <img src="/logo.png" alt="Logo" class="sidebar-logo" />
      <div class="sidebar-brand">
        <h1 class="brand-title">RH Frozen</h1>
        <span class="brand-badge">{{ user?.role?.toUpperCase() || 'USER' }}</span>
      </div>
    </div>

    <!-- Navigation Menu List -->
    <div class="sidebar-scroll">
      <div class="nav-section-title">Menu Utama</div>
      <nav class="sidebar-nav">
        <router-link to="/dashboard" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="dashboard" size="18" class="nav-svg" /></div>
          <span class="label">Dashboard</span>
        </router-link>
        <router-link to="/orders" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="orders" size="18" class="nav-svg" /></div>
          <span class="label">Pesanan (Order)</span>
        </router-link>
        <router-link to="/sales" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="sales" size="18" class="nav-svg" /></div>
          <span class="label">Penjualan & Kasir</span>
        </router-link>
        <router-link to="/stock" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="stock" size="18" class="nav-svg" /></div>
          <span class="label">Stok Produk</span>
        </router-link>
        <!-- Menu PO di-hide sementara sesuai permintaan user -->
        <!--
        <router-link to="/purchases" class="sidebar-link" active-class="active" v-if="canManageData">
          <div class="icon-box"><Icon name="purchases" size="18" class="nav-svg" /></div>
          <span class="label">Pembelian (PO)</span>
        </router-link>
        -->
      </nav>

      <div class="nav-section-title">Keuangan & Analitik</div>
      <nav class="sidebar-nav">
        <router-link to="/cash" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="cash" size="18" class="nav-svg" /></div>
          <span class="label">Buku Kas & Biaya</span>
        </router-link>
        <router-link to="/receivables" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="receivables" size="18" class="nav-svg" /></div>
          <span class="label">Piutang Pelanggan</span>
        </router-link>
        <router-link to="/reports" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="reports" size="18" class="nav-svg" /></div>
          <span class="label">Laporan & Laba</span>
        </router-link>
        <router-link to="/targets" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="targets" size="18" class="nav-svg" /></div>
          <span class="label">Target Sales</span>
        </router-link>
        <router-link to="/tracking" class="sidebar-link" active-class="active" v-if="canManageData">
          <div class="icon-box"><Icon name="orders" size="18" class="nav-svg" /></div>
          <span class="label">Tracking Permintaan</span>
        </router-link>
        <router-link to="/history" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="history" size="18" class="nav-svg" /></div>
          <span class="label">Riwayat Transaksi</span>
        </router-link>
      </nav>

      <div class="nav-section-title" v-if="canManageData || isSales">Master Data & Pelanggan</div>
      <nav class="sidebar-nav" v-if="canManageData || isSales">
        <router-link to="/customers" class="sidebar-link" active-class="active">
          <div class="icon-box"><Icon name="customers" size="18" class="nav-svg" /></div>
          <span class="label">{{ isSales ? 'Pelanggan Saya' : 'Pelanggan' }}</span>
        </router-link>
        <router-link to="/branches" class="sidebar-link" active-class="active" v-if="isAdmin">
          <div class="icon-box"><Icon name="branches" size="18" class="nav-svg" /></div>
          <span class="label">Cabang Usaha</span>
        </router-link>
        <router-link to="/users" class="sidebar-link" active-class="active" v-if="isAdmin">
          <div class="icon-box"><Icon name="users" size="18" class="nav-svg" /></div>
          <span class="label">Manajemen User</span>
        </router-link>
      </nav>
    </div>

    <!-- User Profile & Action Footer -->
    <div class="sidebar-footer">
      <div class="user-strip">
        <div class="user-avatar">{{ userInitials }}</div>
        <div class="user-info">
          <span class="user-name">{{ user?.full_name || 'Pengguna' }}</span>
          <span class="user-sub">Cabang: {{ user?.branch_id || 'Pusat' }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <button class="action-btn" @click="toggleTheme" :title="theme === 'light' ? 'Mode Gelap' : 'Mode Terang'">
          <Icon :name="theme === 'light' ? 'moon' : 'sun'" size="15" />
          <span>{{ theme === 'light' ? 'Gelap' : 'Terang' }}</span>
        </button>
        <button class="action-btn logout-btn" @click="handleLogout" title="Keluar">
          <Icon name="logout" size="15" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from './Icon.vue';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

const user = computed(() => authStore.user);
const theme = computed(() => appStore.theme);
const isAdmin = computed(() => user.value?.role === 'admin');
const isSales = computed(() => user.value?.role === 'sales');
const canManageData = computed(() => user.value?.role === 'admin');

const userInitials = computed(() => {
  if (!user.value?.full_name) return 'U';
  return user.value.full_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
});

function toggleTheme() {
  appStore.toggleTheme();
}

async function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar dari sistem?')) return;
  await authStore.logout();
  appStore.showToast('Berhasil keluar', 'info');
  router.push('/login');
}
</script>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 60;
  user-select: none;
}

.sidebar-header {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.sidebar-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.sidebar-brand {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary);
  line-height: 1.2;
  margin: 0;
}

.brand-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px;
}

.nav-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-light);
  letter-spacing: 0.5px;
  padding: 12px 10px 6px 10px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 9px;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 13.5px;
  font-weight: 500;
  transition: all 0.2s ease;
}

/* Kotak icon beraksen lembut agar icon kontras dan terbaca jelas */
.sidebar-link .icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.12);
  color: #64748b;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

[data-theme="dark"] .sidebar-link .icon-box {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.sidebar-link:hover {
  background: var(--bg-app);
  color: var(--text-main);
}

.sidebar-link:hover .icon-box {
  background: rgba(37, 99, 235, 0.15);
  color: var(--primary);
  transform: scale(1.05);
}

[data-theme="dark"] .sidebar-link:hover .icon-box {
  background: rgba(96, 165, 250, 0.22);
  color: #93c5fd;
}

.sidebar-link.active {
  background: var(--primary);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35);
}

.sidebar-link.active .icon-box {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}

.sidebar-link .nav-svg {
  transition: transform 0.15s ease;
}

.sidebar-footer {
  padding: 14px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-strip {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.user-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  min-height: 34px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-app);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  opacity: 0.85;
}

.logout-btn {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
