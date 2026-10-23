<template>
  <header class="app-header">
    <div class="header-left">
      <button v-if="showBack" class="icon-btn" @click="$router.back()">←</button>
      <div v-else class="brand">
        <img src="/logo.png" alt="Logo" class="brand-logo" />
        <div class="brand-text">
          <span class="title">Sales Terpadu</span>
          <span class="subtitle">RH Frozen Food</span>
        </div>
      </div>
    </div>
    <div class="header-right">
      <span v-if="!isOnline" class="offline-tag">Offline</span>
      <button class="icon-btn theme-btn" @click="toggleTheme" :title="theme === 'light' ? 'Mode Gelap' : 'Mode Terang'">
        <Icon :name="theme === 'light' ? 'moon' : 'sun'" size="18" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores/app.js';
import { useOfflineStore } from '../stores/offline.js';
import Icon from './Icon.vue';

const route = useRoute();
const appStore = useAppStore();
const offlineStore = useOfflineStore();

const showBack = computed(() => route.meta.showBack);
const theme = computed(() => appStore.theme);
const isOnline = computed(() => offlineStore.isOnline);

function toggleTheme() {
  appStore.toggleTheme();
}
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: var(--primary);
  color: white;
  padding: calc(var(--safe-top) + 10px) 16px 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: white;
}
.brand-text {
  display: flex;
  flex-direction: column;
}
.title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.subtitle {
  font-size: 11px;
  opacity: 0.85;
}
.icon-btn {
  background: transparent;
  color: white;
  border: none;
  font-size: 18px;
  padding: 6px;
  min-height: 36px;
  cursor: pointer;
}
.offline-tag {
  background: var(--danger);
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
