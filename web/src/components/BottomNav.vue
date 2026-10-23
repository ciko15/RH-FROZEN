<template>
  <nav class="bottom-nav">
    <!-- 1. Dashboard -->
    <router-link to="/dashboard" class="nav-item" active-class="active">
      <Icon name="dashboard" size="20" class="nav-svg" />
      <span class="label">Dashboard</span>
    </router-link>

    <!-- 2. Permintaan Barang (Minta ke Admin / Admin Kirim) -->
    <router-link to="/orders" class="nav-item" active-class="active">
      <Icon name="orders" size="20" class="nav-svg" />
      <span class="label">{{ isSales ? 'Minta Barang' : 'Permintaan' }}</span>
    </router-link>

    <!-- 3. Kasir Penjualan (End-Customer dari Stok Sales) -->
    <router-link to="/sales" class="nav-item" active-class="active">
      <Icon name="sales" size="20" class="nav-svg" />
      <span class="label">Kasir</span>
    </router-link>

    <!-- 4. Stok (Stok Saya / Stok Admin) -->
    <router-link to="/stock" class="nav-item" active-class="active">
      <Icon name="stock" size="20" class="nav-svg" />
      <span class="label">Stok</span>
    </router-link>

    <!-- 5. Retur Barang (Approval Admin) -->
    <router-link to="/returns" class="nav-item" active-class="active">
      <Icon name="package" size="20" class="nav-svg" />
      <span class="label">Retur</span>
    </router-link>

    <!-- 6. Lainnya -->
    <router-link to="/more" class="nav-item" active-class="active">
      <Icon name="settings" size="20" class="nav-svg" />
      <span class="label">Lainnya</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import Icon from './Icon.vue';

const authStore = useAuthStore();
const isSales = computed(() => authStore.user?.role === 'sales');
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-around;
  padding: 8px 12px calc(var(--safe-bottom) + 8px) 12px;
  z-index: 50;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  flex: 1;
  padding: 4px 0;
  transition: all 0.2s ease;
}

.nav-item .nav-svg {
  color: #64748b;
  transition: transform 0.15s ease, color 0.15s ease;
}

[data-theme="dark"] .nav-item .nav-svg {
  color: #94a3b8;
}

.nav-item:hover .nav-svg {
  color: var(--primary);
  transform: translateY(-1px);
}

.nav-item.active {
  color: var(--primary);
  font-weight: 700;
}

.nav-item.active .nav-svg {
  color: var(--primary);
  transform: scale(1.12);
}
</style>
