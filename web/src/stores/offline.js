import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getOfflineOrders, removeOfflineOrder } from '../db.js';
import { apiFetch } from '../api.js';

export const useOfflineStore = defineStore('offline', () => {
  const isOnline = ref(navigator.onLine);
  const queue = ref([]);
  const syncing = ref(false);

  async function loadQueue() {
    queue.value = await getOfflineOrders();
  }

  async function syncQueue() {
    if (!navigator.onLine || syncing.value) return;
    syncing.value = true;
    await loadQueue();

    for (const order of queue.value) {
      if (order.status === 'Gagal') continue;
      try {
        await apiFetch('/api/orders', {
          method: 'POST',
          headers: { 'Idempotency-Key': order.client_key },
          body: JSON.stringify(order)
        });
        await removeOfflineOrder(order.client_key);
      } catch (err) {
        order.status = 'Gagal';
        order.fail_reason = err.message;
      }
    }

    await loadQueue();
    syncing.value = false;
  }

  window.addEventListener('online', () => {
    isOnline.value = true;
    syncQueue();
  });

  window.addEventListener('offline', () => {
    isOnline.value = false;
  });

  return {
    isOnline,
    queue,
    syncing,
    loadQueue,
    syncQueue
  };
});
