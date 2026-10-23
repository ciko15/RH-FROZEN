<template>
  <div v-if="!isOnline" class="offline-badge-container">
    <div class="offline-badge">
      <span class="icon">📡</span>
      <span class="text">Mode Offline (Hanya Pembuatan Order)</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useOfflineStore } from '../stores/offline.js';

const offlineStore = useOfflineStore();
const isOnline = computed(() => offlineStore.isOnline);
</script>

<style scoped>
.offline-badge-container {
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  padding: 6px 12px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.offline-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #dc2626;
}
.icon {
  font-size: 13px;
}
</style>
