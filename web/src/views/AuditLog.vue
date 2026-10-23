<template>
  <div class="audit-page">
    <div class="section-title">Log Aktivitas Sistem (AuditLog)</div>

    <div v-if="loading" class="state-msg">Memuat catatan aktivitas...</div>
    <div v-else-if="logs.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="audit" size="38" /></div>
      <h3>Belum Ada Log Aktivitas</h3>
    </div>
    <div v-else class="logs-list">
      <div
        v-for="log in logs"
        :key="log.id"
        class="card log-card"
      >
        <div class="log-head">
          <span class="badge badge-proses">{{ log.action }}</span>
          <span class="log-time">{{ log.date_time }}</span>
        </div>

        <div class="log-user">
          Pengguna: <strong>{{ log.user_id }}</strong>
        </div>

        <div class="log-detail" v-if="log.detail_json">
          <code>{{ log.detail_json }}</code>
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
const logs = ref([]);

async function fetchLogs() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/audit?limit=50');
    logs.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchLogs();
});
</script>

<style scoped>
.audit-page {
  padding: 16px;
  padding-bottom: 90px;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
}
.logs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.log-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.log-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.log-time {
  font-size: 11px;
  color: var(--text-light);
}
.log-user {
  font-size: 12px;
  color: var(--text-muted);
}
.log-detail {
  background: var(--bg-app);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  overflow-x: auto;
  word-break: break-all;
}
</style>
