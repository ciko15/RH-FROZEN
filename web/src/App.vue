<template>
  <div class="app-layout" :class="{ 'with-sidebar': !hideNav }">
    <!-- Sidebar khusus Desktop/Tablet -->
    <Sidebar v-if="!hideNav" class="desktop-only" />

    <!-- Konten Utama Aplikasi -->
    <div class="content-wrapper">
      <Header v-if="!hideNav" class="mobile-only" />
      <OfflineBadge />
      <Toast />
      <main class="main-content">
        <router-view />
      </main>
      <!-- BottomNav khusus Mobile -->
      <BottomNav v-if="!hideNav" class="mobile-only" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import OfflineBadge from './components/OfflineBadge.vue';
import BottomNav from './components/BottomNav.vue';
import Toast from './components/Toast.vue';
import { useAppStore } from './stores/app.js';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const hideNav = computed(() => route.meta.hideNav);

onMounted(() => {
  // Pasang tema tersimpan
  document.documentElement.setAttribute('data-theme', appStore.theme);

  // Tangani event global sesi kadaluarsa / 401
  window.addEventListener('auth:unauthorized', () => {
    appStore.showToast('Sesi Anda telah berakhir, silakan login kembali.', 'error');
    router.push('/login');
  });

  window.addEventListener('auth:must_change_password', () => {
    appStore.showToast('Silakan ganti password terlebih dahulu.', 'warning');
    router.push('/change-password');
  });
});
</script>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
  position: relative;
}

.main-content {
  flex: 1;
  width: 100%;
}

/* Visibility toggles based on viewport */
.desktop-only {
  display: none;
}

.mobile-only {
  display: flex;
}

@media (min-width: 768px) {
  .desktop-only {
    display: flex;
  }
  .mobile-only {
    display: none !important;
  }
  .main-content {
    padding: 24px 32px 40px 32px;
  }
}
</style>
