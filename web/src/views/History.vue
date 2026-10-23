<template>
  <div class="history-page">
    <div class="history-header">
      <div class="section-title">Riwayat Semua Transaksi</div>
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari transaksi / pelanggan..."
          class="search-input"
        />
      </div>
    </div>

    <!-- Filter Tipe Transaksi -->
    <div class="type-tabs">
      <button
        v-for="tab in typeTabs"
        :key="tab"
        class="tab-btn"
        :class="{ active: selectedType === tab }"
        @click="selectedType = tab"
      >
        {{ tab }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Memuat riwayat transaksi...</div>
    <div v-else-if="filteredItems.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="history" size="38" /></div>
      <h3>Belum Ada Transaksi</h3>
      <p>Tidak ada riwayat transaksi yang cocok dengan pencarian.</p>
    </div>
    <div v-else>
      <div class="history-list">
        <div
          v-for="item in paginatedItems"
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
            <span class="h-cust">{{ item.customer || '-' }}</span>
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

      <!-- Pagination Riwayat Transaksi -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredItems.length) }} dari {{ filteredItems.length }} transaksi
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ currentPage }} / {{ totalPages }}</span>
          <button
            class="btn-page"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            Berikutnya &raquo;
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { apiFetch } from '../api.js';
import { useAppStore } from '../stores/app.js';

const appStore = useAppStore();
const loading = ref(false);
const items = ref([]);
const searchQuery = ref('');

const typeTabs = ['Semua', 'Invoice', 'Retur', 'Order'];
const selectedType = ref('Semua');

// Pagination (10 data per halaman)
const currentPage = ref(1);
const pageSize = ref(10);

const filteredItems = computed(() => {
  let list = items.value;
  if (selectedType.value !== 'Semua') {
    list = list.filter(it => (it.type || '').toLowerCase() === selectedType.value.toLowerCase());
  }
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    list = list.filter(it => 
      (it.title && it.title.toLowerCase().includes(q)) ||
      (it.customer && it.customer.toLowerCase().includes(q))
    );
  }
  return list;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value));
});

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

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
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 320px;
  min-width: 220px;
}
.search-input-wrapper .search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.search-input {
  width: 100%;
  padding-left: 36px;
  box-sizing: border-box;
}
.type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  overflow-x: auto;
}
.tab-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  min-height: 36px;
  padding: 4px 14px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
}
.empty-icon-box {
  width: 64px;
  height: 64px;
  background: var(--bg-hover);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px auto;
  color: var(--text-muted);
}

/* 2 Kolom Grid Layout */
.history-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.history-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.history-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
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
.text-danger {
  color: var(--danger, #ef4444);
}
.text-success {
  color: var(--success, #10b981);
}
.h-date, .h-status {
  font-size: 12px;
  color: var(--text-light);
}

/* Pagination Bar */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 10px);
}
.page-info {
  font-size: 13px;
  color: var(--text-muted);
}
.page-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-page {
  background: var(--bg-hover, #f1f5f9);
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-main);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-page:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.btn-page:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.page-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
</style>
