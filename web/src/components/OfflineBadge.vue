<template>
  <div>
    <!-- Badge Status Sync di Latar Belakang -->
    <div v-if="activeSyncs > 0" class="sync-badge-container">
      <div class="sync-badge">
        <span class="spinner">⚡</span>
        <span class="text">Menyinkronkan data ke Spreadsheet di latar belakang ({{ activeSyncs }})...</span>
      </div>
    </div>

    <!-- Badge Mode Offline -->
    <div v-if="!isOnline" class="offline-badge-container">
      <div class="offline-badge">
        <span class="icon">📡</span>
        <span class="text">Mode Offline (Hanya Pembuatan Order)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useOfflineStore } from '../stores/offline.js';
import { useAppStore } from '../stores/app.js';

const offlineStore = useOfflineStore();
const appStore = useAppStore();
const isOnline = computed(() => offlineStore.isOnline);
const activeSyncs = computed(() => appStore.activeSyncs);
</script>

<style scoped>
.sync-badge-container {
  background: #eff6ff;
  border-bottom: 1px solid #bfdbfe;
  padding: 6px 12px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.sync-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #1d4ed8;
}
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
.icon, .spinner {
  font-size: 13px;
}
.spinner {
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}
</style>
