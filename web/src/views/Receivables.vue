<template>
  <div class="receivables-page">
    <!-- Header Total Piutang -->
    <div class="total-card card">
      <span class="label">Total Piutang Berjalan</span>
      <span class="amount">Rp {{ formatNumber(totalReceivables) }}</span>
      <span class="subtext">{{ debtors.length }} Pelanggan memiliki saldo piutang</span>
    </div>

    <!-- Daftar Pelanggan Yang Memiliki Piutang -->
    <div class="section-title">Daftar Tagihan Pelanggan</div>

    <div v-if="loading" class="state-msg">Memuat data piutang...</div>
    <div v-else-if="debtors.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="check" size="38" /></div>
      <h3>Tidak Ada Piutang</h3>
      <p>Seluruh pelanggan lunas!</p>
    </div>

    <div v-else class="debtors-list">
      <div
        v-for="d in debtors"
        :key="d.id"
        class="card debtor-card"
        :class="{ 'card-overdue': d.has_overdue }"
      >
        <div class="debtor-head">
          <span class="cust-name">{{ d.name }}</span>
          <span class="badge" :class="d.has_overdue ? 'badge-dibatalkan' : 'badge-menunggu'">
            {{ d.has_overdue ? `Menunggak ${d.overdue_days} hari` : 'Aktif' }}
          </span>
        </div>

        <div class="debtor-detail">
          <span>{{ d.address || '-' }}</span>
          <span class="balance-due">Rp {{ formatNumber(d.balance) }}</span>
        </div>

        <div class="debtor-actions">
          <button class="btn-pay" @click="openPayModal(d)">
            <Icon name="dollar-sign" size="14" /> Terima Pelunasan
          </button>
          <button class="btn-wa" @click="sendWaReminder(d)">
            <Icon name="message-circle" size="14" /> Pengingat WA
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Terima Pelunasan Piutang -->
    <div v-if="selectedDebtor" class="sheet-overlay" @click.self="selectedDebtor = null">
      <div class="sheet-content">
        <div class="sheet-header">
          <h3>Pelunasan Piutang: {{ selectedDebtor.name }}</h3>
          <button class="sheet-close" @click="selectedDebtor = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="info-box">
            <div class="info-row">
              <span>Saldo Piutang Saat Ini:</span>
              <strong>Rp {{ formatNumber(selectedDebtor.balance) }}</strong>
            </div>
            <div class="info-row">
              <span>Sisa Setelah Bayar:</span>
              <strong :class="payRemaining <= 0 ? 'text-success' : 'text-danger'">
                Rp {{ formatNumber(payRemaining) }}
              </strong>
            </div>
          </div>

          <div class="form-group">
            <label>Jumlah Bayar (Rp) *</label>
            <input
              v-model.number="payAmount"
              type="number"
              min="1"
              :max="selectedDebtor.balance"
              inputmode="numeric"
            />
          </div>

          <div class="form-group">
            <label>Metode Pembayaran</label>
            <select v-model="payMethod">
              <option value="Tunai">Tunai</option>
              <option value="Transfer">Transfer</option>
            </select>
          </div>

          <div class="form-group">
            <label>Keterangan (Opsional)</label>
            <input v-model="payNote" type="text" placeholder="Contoh: Titip lewat sales" />
          </div>

          <button
            class="btn-submit"
            @click="submitReceivePayment"
            :disabled="payLoading || payAmount <= 0 || payAmount > selectedDebtor.balance || !isOnline"
          >
            {{ !isOnline ? 'Pelunasan Hanya Dapat Dilakukan Saat Online' : (payLoading ? 'Menyimpan...' : '✓ Simpan & Cetak Tanda Terima') }}
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
import { useOfflineStore } from '../stores/offline.js';

const appStore = useAppStore();
const offlineStore = useOfflineStore();
const isOnline = computed(() => offlineStore.isOnline);

const loading = ref(false);
const totalReceivables = ref(0);
const debtors = ref([]);

const selectedDebtor = ref(null);
const payAmount = ref(0);
const payMethod = ref('Tunai');
const payNote = ref('');
const payLoading = ref(false);

const payRemaining = computed(() => {
  if (!selectedDebtor.value) return 0;
  return Math.max(selectedDebtor.value.balance - (payAmount.value || 0), 0);
});

async function fetchReceivables() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/receivables');
    totalReceivables.value = res.data.total_receivables || 0;
    debtors.value = res.data.debtors || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openPayModal(d) {
  selectedDebtor.value = d;
  payAmount.value = d.balance;
  payMethod.value = 'Tunai';
  payNote.value = 'Pelunasan piutang';
}

async function submitReceivePayment() {
  if (payAmount.value <= 0 || payAmount.value > selectedDebtor.value.balance) {
    appStore.showToast('Jumlah pembayaran tidak valid', 'warning');
    return;
  }

  payLoading.value = true;
  const idempotencyKey = crypto.randomUUID();

  try {
    await apiFetch('/api/receivables', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        customer_id: selectedDebtor.value.id,
        amount: payAmount.value,
        method: payMethod.value,
        note: payNote.value
      })
    });

    appStore.showToast('Pelunasan piutang berhasil dicatat!', 'success');
    selectedDebtor.value = null;
    fetchReceivables();
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    payLoading.value = false;
  }
}

function sendWaReminder(d) {
  const text = `Halo Bapak/Ibu dari *${d.name}*,\nKami dari RH Frozen Food ingin mengingatkan mengenai sisa tagihan piutang berjalan sebesar *Rp ${formatNumber(d.balance)}*.\nMohon dapat segera dilakukan penyelesaian pembayaran. Terima kasih atas kerja samanya.`;
  const phone = (d.phone || '').replace(/[^0-9]/g, '');
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function formatNumber(num) {
  return (num || 0).toLocaleString('id-ID');
}

onMounted(() => {
  fetchReceivables();
});
</script>

<style scoped>
.receivables-page {
  padding: 16px;
  padding-bottom: 90px;
}
.total-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}
.total-card .label {
  font-size: 12px;
  font-weight: 600;
  color: #b91c1c;
}
.total-card .amount {
  font-size: 24px;
  font-weight: 800;
  color: #dc2626;
}
.total-card .subtext {
  font-size: 11px;
  color: #991b1b;
}
.section-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
}
.debtors-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.debtor-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-overdue {
  border-left: 4px solid var(--danger);
}
.debtor-head, .debtor-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cust-name {
  font-weight: 700;
  font-size: 15px;
}
.balance-due {
  font-weight: 800;
  font-size: 15px;
  color: var(--danger);
}
.debtor-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.btn-pay {
  flex: 1;
  background: var(--success);
  color: white;
  font-size: 12px;
  min-height: 36px;
}
.btn-wa {
  flex: 1;
  background: #25d366;
  color: white;
  font-size: 12px;
  min-height: 36px;
}

/* Modal Bottom Sheet */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet-content {
  background: var(--bg-card);
  width: 100%;
  max-width: 480px;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 14px;
}
.sheet-close {
  background: transparent;
  font-size: 16px;
  min-height: 36px;
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-box {
  background: var(--bg-app);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.info-row {
  display: flex;
  justify-content: space-between;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-submit {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}
</style>
