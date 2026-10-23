<template>
  <div class="toast-container">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="'toast-' + toast.type"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();
const toasts = computed(() => appStore.toasts);
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: calc(var(--safe-top) + 60px);
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 440px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: slideDown 0.3s ease-out;
  pointer-events: auto;
}
.toast-info { background: #1e293b; }
.toast-success { background: #16a34a; }
.toast-error { background: #dc2626; }
.toast-warning { background: #d97706; }

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
