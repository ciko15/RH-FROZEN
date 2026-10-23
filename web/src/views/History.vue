<template>
  <div class="history-page">
    <div class="section-title">Riwayat Semua Transaksi</div>

    <div v-if="loading" class="state-msg">Memuat riwayat transaksi...</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="history" size="38" /></div>
      <h3>Belum Ada Transaksi</h3>
    </div>
    <div v-else class="history-list">
      <div
        v-for="item in items"
        :key="item.id + item.type"
        class="card history-card"
      >
        <div class="h-top">
          <span class="h-title">{{ item.title }}</span>
          <span class="badge" :class="getTypeBadge(item.type)">
            {{ item.type }}
          </span>
        </div>

        <div class="h-mid">
          <span class="h-cust">{{ item.customer }}</span>
          <span class="h-amount" :class="item.amount < 0 ? 'text-danger' : 'text-success'">
            {{ item.amount < 0 ? '- ' : '' }}Rp {{ formatNumber(Math.abs(item.amount)) }}
          </span>
        </div>

        <div class="h-foot">
          <span class="h-date">{{ item.date }}</span>
          <span class="h-status">{{ item.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();
const loading = ref(false);
const items = ref([]);

async function fetchHistory() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/history');
    items.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function getTypeBadge(type) {
  if (type === 'Invoice') return 'badge-dikirim';
  if (type === 'Retur') return 'badge-dibatalkan';
  return 'badge-proses';
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchHistory();
});
</script>

<style scoped>
.history-page {
  padding: 16px;
  padding-bottom: 90px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.h-top, .h-mid, .h-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.h-title {
  font-weight: 700;
  font-size: 14px;
}
.h-cust {
  font-size: 13px;
  color: var(--text-muted);
}
.h-amount {
  font-weight: 800;
  font-size: 15px;
}
.h-date, .h-status {
  font-size: 11px;
  color: var(--text-light);
}
</style>
