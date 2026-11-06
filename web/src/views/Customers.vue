<template>
  <div class="customers-page">
    <div class="page-title-bar">
      <div class="title-meta">
        <h2>{{ user?.role === 'sales' ? 'Pelanggan Saya' : 'Daftar Pelanggan' }}</h2>
        <span class="subtext">
          {{ user?.role === 'sales' ? 'Hanya menampilkan data customer yang ditangani oleh Anda' : 'Kelola data pelanggan dan penetapan sales' }}
        </span>
      </div>
      <button class="btn-add-primary" @click="showAddModal = true">
        <Icon name="plus" size="14" />
        <span>Tambah</span>
      </button>
    </div>

    <div class="header-action">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari pelanggan / no telepon..."
        class="search-input"
        @input="onSearchInput"
      />
    </div>

    <div v-if="loading" class="state-msg">Memuat pelanggan...</div>
    <div v-else-if="filteredCustomers.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="customers" size="38" /></div>
      <h3>Belum Ada Pelanggan</h3>
      <p>{{ user?.role === 'sales' ? 'Anda belum memiliki pelanggan yang terdaftar.' : 'Belum ada data pelanggan di cabang ini.' }}</p>
    </div>
    <div v-else>
      <div class="cust-list">
        <div
          v-for="c in paginatedCustomers"
          :key="c.id"
          class="card cust-card"
          @click="openCustomerDetailSidebar(c)"
        >
          <div class="cust-head">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="cust-name">{{ c.name }}</span>
              <span v-if="c.balance > 0" class="badge badge-dibatalkan" style="font-weight:700;">
                ⚠️ Piutang: Rp {{ formatNumber(c.balance) }}
              </span>
            </div>
            <span class="badge" :class="c.active ? 'badge-dikirim' : 'badge-dibatalkan'">
              {{ c.active ? 'Aktif' : 'Nonaktif' }}
            </span>
          </div>

          <div class="cust-info">
            <span v-if="c.sales_name"><Icon name="user" size="13" /> Sales: <strong>{{ c.sales_name }}</strong></span>
            <span><Icon name="map-pin" size="13" /> {{ c.address || 'Alamat belum diatur' }}</span>
            <span><Icon name="phone" size="13" /> {{ c.phone || '-' }}</span>
            <div class="credit-info">
              <span>Batas Kredit: <strong>{{ c.credit_limit > 0 ? 'Rp ' + formatNumber(c.credit_limit) : 'Tanpa Batas' }}</strong></span>
              <span>Tempo: <strong>{{ formatNumber(c.term_days) }} Hari</strong></span>
              <span>Saldo Bon/Piutang: <strong :style="c.balance > 0 ? 'color:#dc2626;' : ''">Rp {{ formatNumber(c.balance || 0) }}</strong></span>
            </div>
          </div>

          <div class="cust-actions" @click.stop>
            <button class="btn-detail-quick" @click.stop="openCustomerDetailSidebar(c)" title="Lihat detail & riwayat hutang">
              <Icon name="history" size="13" /> Riwayat
            </button>
            <button class="btn-edit-cust" @click.stop="openEditModal(c)" title="Edit data pelanggan">
              <Icon name="edit" size="13" /> Edit
            </button>
            <button class="btn-price" @click.stop="openPricesModal(c)" title="Atur harga khusus">
              <Icon name="tag" size="13" /> Harga
            </button>
            <button v-if="canDeleteCustomer" class="btn-delete-cust" @click.stop="confirmDeleteCustomer(c)" title="Hapus pelanggan">
              <Icon name="trash" size="13" /> Hapus
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination Footer -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((currentPage - 1) * pageSize + 1) }} - {{ formatNumber(Math.min(currentPage * pageSize, filteredCustomers.length)) }} dari {{ formatNumber(filteredCustomers.length) }} data
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ formatNumber(currentPage) }} / {{ formatNumber(totalPages) }}</span>
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

    <!-- Modal Atur Harga Khusus -->
    <div v-if="selectedCustForPrice" class="sheet-overlay" @click.self="selectedCustForPrice = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Harga Khusus: {{ selectedCustForPrice.name }}</h3>
          <button class="sheet-close" @click="selectedCustForPrice = null"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <p class="subtitle">Atur harga satuan khusus untuk pelanggan ini. Kosongkan jika memakai harga umum.</p>

          <div class="price-edit-list">
            <div
              v-for="p in customerPriceList"
              :key="p.product_id"
              class="price-edit-row"
            >
              <div class="p-meta">
                <strong>{{ p.name }}</strong>
                <small>Harga Umum: Rp {{ formatNumber(p.default_price) }}</small>
              </div>
              <div class="p-input-wrap">
                <input
                  v-model.number="p.custom_price"
                  type="number"
                  placeholder="Harga Khusus"
                  @change="saveCustomerPrice(p)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" style="flex:1;" @click="selectedCustForPrice = null">
            <Icon name="check" size="16" /> Selesai / Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Pelanggan Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Pelanggan Baru</h3>
          <button class="sheet-close" @click="showAddModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan / Toko *</label>
            <input v-model="newCust.name" type="text" placeholder="Contoh: Toko Berkah Jaya" required />
          </div>

          <div class="form-group">
            <label>Alamat Lengkap</label>
            <input v-model="newCust.address" type="text" placeholder="Jl. Raya No. ..." />
          </div>

          <div class="form-group">
            <label>Nomor Telepon (WhatsApp)</label>
            <input v-model="newCust.phone" type="text" placeholder="08..." />
          </div>

          <div class="form-group" v-if="user?.role === 'admin'">
            <label>Cabang</label>
            <select v-model="newCust.branch_id">
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label>Sales Penanggung Jawab (Opsional)</label>
            <select v-model="newCust.sales_id">
              <option value="">-- Tanpa Sales / Mandiri --</option>
              <option v-for="s in salesList" :key="s.id" :value="s.id">{{ s.full_name }} ({{ s.branch_name || s.role }})</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Batas Kredit (0 = Tanpa Batas)</label>
              <input 
                :value="formatInputNumber(newCust.credit_limit)" 
                @input="newCust.credit_limit = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="0" 
              />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input 
                :value="formatInputNumber(newCust.term_days)" 
                @input="newCust.term_days = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="14" 
              />
            </div>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showAddModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button
            class="btn-primary"
            @click="submitCreateCustomer"
            :disabled="createLoading || !newCust.name"
          >
            <Icon name="check" size="16" /> {{ createLoading ? 'Menyimpan...' : 'Tambah Pelanggan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Edit Pelanggan -->
    <div v-if="showEditModal" class="sheet-overlay" @click.self="showEditModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Edit Data Pelanggan</h3>
          <button class="sheet-close" @click="showEditModal = false"><Icon name="x" size="18" /></button>
        </div>

        <div class="sheet-body">
          <div class="form-group">
            <label>Nama Pelanggan / Toko *</label>
            <input v-model="editCust.name" type="text" placeholder="Nama toko..." required />
          </div>

          <div class="form-group">
            <label>Alamat Lengkap</label>
            <input v-model="editCust.address" type="text" placeholder="Alamat..." />
          </div>

          <div class="form-group">
            <label>Nomor Telepon (WhatsApp)</label>
            <input v-model="editCust.phone" type="text" placeholder="08..." />
          </div>

          <div class="form-group" v-if="user?.role === 'admin'">
            <label>Cabang</label>
            <select v-model="editCust.branch_id">
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label>Sales Penanggung Jawab</label>
            <select v-model="editCust.sales_id">
              <option value="">-- Tanpa Sales / Mandiri --</option>
              <option v-for="s in salesList" :key="s.id" :value="s.id">{{ s.full_name }} ({{ s.branch_name || s.role }})</option>
            </select>
          </div>

          <div class="form-row" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <div class="form-group">
              <label>Batas Kredit (Rp)</label>
              <input 
                :value="formatInputNumber(editCust.credit_limit)" 
                @input="editCust.credit_limit = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="0" 
              />
            </div>
            <div class="form-group">
              <label>Tempo (Hari)</label>
              <input 
                :value="formatInputNumber(editCust.term_days)" 
                @input="editCust.term_days = parseInputNumber($event.target.value)" 
                type="text" 
                inputmode="numeric" 
                placeholder="14" 
              />
            </div>
          </div>

          <!-- Edit Hutang / Piutang Pelanggan -->
          <div class="form-group" v-if="user?.role === 'admin' || user?.role === 'manajer'">
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Saldo Bon / Hutang Piutang (Rp)</span>
              <span v-if="editCust.balance > 0" class="badge badge-dibatalkan" style="font-size: 11px;">Ada Tagihan</span>
            </label>
            <input 
              :value="formatInputNumber(editCust.balance)" 
              @input="editCust.balance = parseInputNumber($event.target.value)" 
              type="text" 
              inputmode="numeric" 
              placeholder="0" 
              style="font-weight: 600; color: #dc2626;"
            />
            <small style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">
              * Perubahan saldo hutang ini langsung memperbarui data piutang pelanggan di sistem & spreadsheet.
            </small>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editCust.active" />
              <span>Pelanggan Aktif</span>
            </label>
          </div>
        </div>

        <div class="sheet-footer">
          <button class="btn-secondary" @click="showEditModal = false">
            <Icon name="x" size="16" /> Tutup
          </button>
          <button
            class="btn-primary"
            @click="submitUpdateCustomer"
            :disabled="editLoading || !editCust.name"
          >
            <Icon name="check" size="16" /> {{ editLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- SIDEBAR DETAIL CUSTOMER & RIWAYAT HUTANG / PEMBAYARAN / PENYESUAIAN -->
    <div v-if="selectedCustForSidebar" class="sidebar-overlay" @click.self="closeCustomerDetailSidebar">
      <div class="sidebar-drawer">
        <div class="sidebar-header">
          <div class="sidebar-title-box">
            <span class="sidebar-pretitle">Detail Pelanggan & Piutang</span>
            <h3>{{ selectedCustForSidebar.name }}</h3>
            <span class="sidebar-subtitle">{{ selectedCustForSidebar.phone || 'Tanpa No HP' }} · {{ selectedCustForSidebar.address || 'Tanpa Alamat' }}</span>
          </div>
          <button class="btn-close-sidebar" @click="closeCustomerDetailSidebar" title="Tutup">
            <Icon name="x" size="20" />
          </button>
        </div>

        <!-- Info Ringkasan Saldo Hutang -->
        <div class="sidebar-summary-card" :class="{ 'has-debt': (custDetailData?.customer?.balance || selectedCustForSidebar.balance) > 0 }">
          <div class="summary-stat-item">
            <span class="stat-label">Total Saldo Bon/Hutang</span>
            <strong class="stat-value text-debt">
              Rp {{ formatNumber(custDetailData?.customer?.balance !== undefined ? custDetailData.customer.balance : selectedCustForSidebar.balance) }}
            </strong>
          </div>
          <div class="summary-stat-divider"></div>
          <div class="summary-stat-item">
            <span class="stat-label">Batas Kredit</span>
            <strong class="stat-value">
              {{ (custDetailData?.customer?.credit_limit || selectedCustForSidebar.credit_limit) > 0 ? 'Rp ' + formatNumber(custDetailData?.customer?.credit_limit || selectedCustForSidebar.credit_limit) : 'Tanpa Batas' }}
            </strong>
          </div>
          <div class="summary-stat-divider"></div>
          <div class="summary-stat-item">
            <span class="stat-label">Tempo Jatuh Tempo</span>
            <strong class="stat-value">
              {{ formatNumber(custDetailData?.customer?.term_days || selectedCustForSidebar.term_days) }} Hari
            </strong>
          </div>
        </div>

        <!-- Tab Navigasi Sidebar -->
        <div class="sidebar-tabs">
          <button
            class="sidebar-tab-btn"
            :class="{ active: sidebarTab === 'debts' }"
            @click="sidebarTab = 'debts'"
          >
            📋 Riwayat Hutang ({{ custDetailData?.debts?.length || 0 }})
          </button>
          <button
            class="sidebar-tab-btn"
            :class="{ active: sidebarTab === 'payments' }"
            @click="sidebarTab = 'payments'"
          >
            💵 Riwayat Bayar ({{ custDetailData?.payments?.length || 0 }})
          </button>
          <button
            class="sidebar-tab-btn"
            :class="{ active: sidebarTab === 'adjustments' }"
            @click="sidebarTab = 'adjustments'"
          >
            ⚖️ Penyesuaian Saldo ({{ custDetailData?.adjustments?.length || 0 }})
          </button>
        </div>

        <!-- Konten Tab Sidebar -->
        <div class="sidebar-body">
          <div v-if="sidebarLoading" class="sidebar-loading-state">
            <Icon name="history" size="30" class="spin-icon" />
            <p>Memuat rincian transaksi & hutang...</p>
          </div>

          <!-- TAB 1: RIWAYAT HUTANG / FAKTUR -->
          <div v-else-if="sidebarTab === 'debts'" class="tab-pane">
            <div v-if="!custDetailData?.debts || custDetailData.debts.length === 0" class="sidebar-empty">
              <Icon name="check" size="32" style="color:#059669;" />
              <p>Belum ada riwayat hutang/faktur untuk pelanggan ini.</p>
            </div>
            <div v-else class="debt-items-list">
              <!-- Item Hutang -->
              <div
                v-for="d in custDetailData.debts"
                :key="d.id"
                class="debt-item-card"
                :class="{ 'is-unpaid': d.is_unpaid, 'is-paid': !d.is_unpaid, 'is-overdue': d.is_overdue }"
              >
                <div class="debt-card-top">
                  <div class="debt-inv-info">
                    <span class="debt-inv-no">
                      <span v-if="d.is_initial_balance" style="color:#d97706;">📌 {{ d.title || 'Saldo Awal / Inputan Hutang' }}</span>
                      <span v-else>#{{ d.invoice_no }}</span>
                    </span>
                    <span class="debt-date">{{ d.date }}</span>
                  </div>
                  <div class="debt-badges">
                    <span v-if="d.is_overdue" class="badge-tag tag-overdue">
                      ⚠️ Lewat Tempo ({{ d.overdue_days }} hr)
                    </span>
                    <span class="badge-tag" :class="d.is_unpaid ? 'tag-unpaid' : 'tag-paid'">
                      {{ d.status }}
                    </span>
                  </div>
                </div>

                <div class="debt-amount-row">
                  <div class="amount-col">
                    <small>{{ d.is_initial_balance ? 'Nominal Hutang' : 'Total Belanja' }}</small>
                    <span>Rp {{ formatNumber(d.total_due) }}</span>
                  </div>
                  <div class="amount-col">
                    <small>Sudah Dibayar</small>
                    <span class="text-success">Rp {{ formatNumber(d.paid_amount) }}</span>
                  </div>
                  <div class="amount-col highlight">
                    <small>{{ d.is_unpaid ? 'Sisa Hutang' : 'Sisa' }}</small>
                    <strong :class="d.is_unpaid ? 'text-debt' : 'text-muted'">Rp {{ formatNumber(d.remaining) }}</strong>
                  </div>
                </div>

                <div v-if="d.note" style="font-size: 11px; color: var(--text-muted); font-style: italic;">
                  {{ d.note }}
                </div>

                <div v-if="d.due_date && d.is_unpaid && !d.is_initial_balance" class="debt-due-info">
                  <Icon name="calendar" size="12" />
                  <span>Jatuh Tempo: <strong>{{ d.due_date }}</strong></span>
                </div>

                <div class="debt-card-actions">
                  <template v-if="d.is_initial_balance">
                    <button
                      v-if="canEditCustomerDebt"
                      type="button"
                      class="btn-refer-tx btn-sales-ref"
                      @click="handleEditDebtFromSidebar(selectedCustForSidebar)"
                      style="width: 100%;"
                    >
                      <Icon name="edit" size="13" />
                      <span>Edit Hutang Pelanggan</span>
                    </button>
                  </template>
                  <template v-else>
                    <button type="button" class="btn-refer-tx" @click="viewInvoiceDetail(d.id)">
                      <Icon name="eye" size="13" />
                      <span>Lihat Faktur / Struk</span>
                    </button>
                    <button type="button" class="btn-refer-tx btn-sales-ref" @click="referToSalesKasir(d)">
                      <Icon name="cart" size="13" />
                      <span>Buka di Kasir / Edit</span>
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: RIWAYAT PEMBAYARAN -->
          <div v-else-if="sidebarTab === 'payments'" class="tab-pane">
            <div v-if="!custDetailData?.payments || custDetailData.payments.length === 0" class="sidebar-empty">
              <Icon name="cash" size="32" style="color:#64748b;" />
              <p>Belum ada catatan pembayaran atau pelunasan.</p>
            </div>
            <div v-else class="payment-items-list">
              <div
                v-for="p in custDetailData.payments"
                :key="p.id"
                class="payment-item-card"
              >
                <div class="pay-card-top">
                  <div class="pay-meta-col">
                    <div class="pay-title-row">
                      <span class="pay-type-tag">{{ p.type || 'Pelunasan' }}</span>
                      <span class="pay-method-badge">{{ p.method }}</span>
                    </div>
                    <span class="pay-date">{{ p.date }}</span>
                  </div>
                  <strong class="pay-amount text-success">+ Rp {{ formatNumber(p.amount) }}</strong>
                </div>

                <div v-if="p.note" class="pay-note">
                  <em>"{{ p.note }}"</em>
                </div>

                <div class="pay-card-bottom">
                  <small class="pay-creator">Diterima oleh: {{ p.created_by_name }}</small>
                  <button
                    v-if="p.invoice_id"
                    type="button"
                    class="btn-ref-invoice-link"
                    @click="viewInvoiceDetail(p.invoice_id)"
                  >
                    <Icon name="file-text" size="12" />
                    <span>Faktur #{{ p.invoice_no || p.invoice_id }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: RIWAYAT PENYESUAIAN SALDO HUTANG -->
          <div v-else-if="sidebarTab === 'adjustments'" class="tab-pane">
            <div v-if="!custDetailData?.adjustments || custDetailData.adjustments.length === 0" class="sidebar-empty">
              <Icon name="history" size="32" style="color:#64748b;" />
              <p>Tidak ada riwayat penyesuaian saldo hutang manual.</p>
            </div>
            <div v-else class="adjust-items-list">
              <div
                v-for="adj in custDetailData.adjustments"
                :key="adj.id"
                class="adjust-item-card"
              >
                <div class="adj-header">
                  <span class="adj-action-badge">{{ adj.action }}</span>
                  <span class="adj-date">{{ adj.date_time }}</span>
                </div>
                <div class="adj-balance-comparison" v-if="adj.old_balance !== null || adj.new_balance !== null">
                  <div class="bal-box">
                    <small>Saldo Sebelum</small>
                    <span>Rp {{ formatNumber(adj.old_balance || 0) }}</span>
                  </div>
                  <span class="adj-arrow">➔</span>
                  <div class="bal-box">
                    <small>Saldo Sesudah</small>
                    <strong class="text-debt">Rp {{ formatNumber(adj.new_balance || 0) }}</strong>
                  </div>
                </div>
                <div v-if="adj.reason" class="adj-reason">
                  <strong>Catatan / Alasan:</strong> {{ adj.reason }}
                </div>
                <small class="adj-user">Oleh: {{ adj.user_name }}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar-footer">
          <button type="button" class="btn-sidebar-close" @click="closeCustomerDetailSidebar">
            Tutup Sidebar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Pratinjau Invoice Referensi -->
    <div v-if="activeInvoice" class="sheet-overlay" @click.self="activeInvoice = null" style="z-index: 1200;">
      <div class="sheet-content" style="max-width: 600px;">
        <div class="sheet-head">
          <h3>Faktur #{{ activeInvoice.invoice_no }}</h3>
          <button class="sheet-close" @click="activeInvoice = null"><Icon name="x" size="18" /></button>
        </div>
        <div class="sheet-body">
          <InvoiceView :invoice="activeInvoice" @edit="onEditInvoiceFromRefer" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import InvoiceView from '../components/InvoiceView.vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import { formatNumber } from '../utils/format.js';

const router = useRouter();

function formatInputNumber(val) {
  if (val === '' || val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/\D/g, ''));
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('id-ID').format(num);
}

function parseInputNumber(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/\D/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);
const canDeleteCustomer = computed(() => ['admin', 'manajer'].includes(user.value?.role));
const canEditCustomerDebt = computed(() => ['admin', 'manajer'].includes(user.value?.role));

const loading = ref(false);
const customers = ref([]);
const branches = ref([]);
const salesList = ref([]);
const searchQuery = ref('');

// Pagination (10 data per halaman)
const currentPage = ref(1);
const pageSize = ref(10);

const filteredCustomers = computed(() => {
  let list = customers.value;
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    list = list.filter(c => 
      (c.name && String(c.name).toLowerCase().includes(q)) ||
      (c.phone && String(c.phone).includes(q)) ||
      (c.address && String(c.address).toLowerCase().includes(q))
    );
  }
  return list;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredCustomers.value.length / pageSize.value));
});

const paginatedCustomers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCustomers.value.slice(start, start + pageSize.value);
});

// Modal Tambah Pelanggan
const showAddModal = ref(false);
const createLoading = ref(false);
const newCust = ref({
  name: '',
  address: '',
  phone: '',
  branch_id: '',
  sales_id: '',
  credit_limit: 0,
  term_days: 14
});

// Modal Edit Pelanggan
const showEditModal = ref(false);
const editLoading = ref(false);
const editCust = ref({
  id: '',
  name: '',
  address: '',
  phone: '',
  branch_id: '',
  sales_id: '',
  credit_limit: 0,
  term_days: 14,
  balance: 0,
  active: true
});

function openEditModal(c) {
  editCust.value = {
    id: c.id,
    name: c.name || '',
    address: c.address || '',
    phone: c.phone || '',
    branch_id: c.branch_id || '',
    sales_id: c.sales_id || '',
    credit_limit: c.credit_limit || 0,
    term_days: c.term_days || 14,
    balance: c.balance || 0,
    active: c.active !== false
  };
  showEditModal.value = true;
}

async function submitUpdateCustomer() {
  const updatedItem = { ...editCust.value };
  
  // Optimistic update: langsung perbarui tampilan kartu pelanggan
  const idx = customers.value.findIndex(c => c.id === updatedItem.id);
  if (idx !== -1) {
    customers.value[idx] = {
      ...customers.value[idx],
      name: updatedItem.name,
      address: updatedItem.address,
      phone: updatedItem.phone,
      credit_limit: updatedItem.credit_limit,
      term_days: updatedItem.term_days,
      balance: updatedItem.balance,
      active: updatedItem.active
    };
  }

  showEditModal.value = false;
  appStore.showToast('Data pelanggan berhasil diperbarui!', 'success');

  // Kirim update ke server di background
  try {
    await apiFetch('/api/customers', {
      method: 'PUT',
      body: JSON.stringify(updatedItem)
    });
  } catch (err) {
    appStore.showToast('Gagal sinkron: ' + err.message, 'error');
    fetchCustomers(); // rollback jika gagal
  }
}

// Modal Harga Khusus
const selectedCustForPrice = ref(null);
const customerPriceList = ref([]);

async function fetchCustomers() {
  loading.value = true;
  try {
    const res = await apiFetch(`/api/customers?search=${searchQuery.value}`);
    customers.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function fetchBranches() {
  try {
    const res = await apiFetch('/api/branches');
    branches.value = res.data || [];
    if (branches.value.length > 0 && !newCust.value.branch_id) {
      newCust.value.branch_id = branches.value[0].id;
    }
  } catch (e) {}
}

async function fetchSalesList() {
  if (user.value?.role !== 'admin' && user.value?.role !== 'manajer') return;
  try {
    const res = await apiFetch('/api/users?role=sales');
    salesList.value = res.data || [];
  } catch (e) {}
}

async function submitCreateCustomer() {
  if (!newCust.value.name || !newCust.value.name.trim()) {
    appStore.showToast('Nama pelanggan wajib diisi', 'warning');
    return;
  }

  // 1. INSTAN: Langsung masukkan data ke tampilan tanpa perlu menunggu Google Apps Script
  const tempId = 'temp-' + Date.now();
  const addedItem = {
    id: tempId,
    name: newCust.value.name.trim(),
    address: newCust.value.address || '',
    phone: newCust.value.phone || '',
    branch_id: newCust.value.branch_id || user.value?.branch_id || 'BR-KERTEK',
    sales_id: user.value?.role === 'sales' ? user.value.id : (newCust.value.sales_id || user.value?.id || ''),
    sales_name: user.value?.full_name || '',
    balance: 0,
    credit_limit: parseFloat(newCust.value.credit_limit || 0),
    term_days: parseInt(newCust.value.term_days || 14, 10),
    active: true
  };

  // Langsung tampilkan di kartu paling atas
  customers.value.unshift(addedItem);
  showAddModal.value = false;
  appStore.showToast('Pelanggan berhasil ditambahkan!', 'success');

  const payloadToSend = { ...newCust.value };
  newCust.value = { name: '', address: '', phone: '', branch_id: branches.value[0]?.id || '', sales_id: '', credit_limit: 0, term_days: 14 };

  // 2. DI BALIK LAYAR: Simpan ke Google Sheet secara asinkron
  appStore.startSync();
  apiFetch('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payloadToSend)
  }).then(res => {
    // Ganti tempId dengan ID asli dari server
    if (res?.data?.id) {
      const idx = customers.value.findIndex(c => c.id === tempId);
      if (idx !== -1) {
        customers.value[idx].id = res.data.id;
      }
    }
  }).catch(err => {
    console.error('[SYNC CUSTOMER ERROR]', err);
    appStore.showToast('Gagal sinkron ke database: ' + err.message, 'error');
    // Rollback jika server gagal
    customers.value = customers.value.filter(c => c.id !== tempId);
  }).finally(() => {
    appStore.finishSync();
  });
}

async function confirmDeleteCustomer(c) {
  if (!canDeleteCustomer.value) {
    return appStore.showToast('Akun sales tidak memiliki izin menghapus pelanggan', 'error');
  }
  const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus pelanggan "${c.name}"?`);
  if (!confirmed) return;

  // 1. INSTAN: Langsung hilangkan dari tampilan
  const prevList = [...customers.value];
  customers.value = customers.value.filter(item => item.id !== c.id);
  appStore.showToast(`Pelanggan "${c.name}" berhasil dihapus`, 'info');

  // 2. DI BALIK LAYAR: Hapus di server
  try {
    await apiFetch(`/api/customers?id=${encodeURIComponent(c.id)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('[DELETE CUSTOMER ERROR]', err);
    appStore.showToast('Gagal menghapus di database: ' + err.message, 'error');
    customers.value = prevList; // rollback jika gagal
  }
}

async function openPricesModal(c) {
  selectedCustForPrice.value = c;
  try {
    const res = await apiFetch(`/api/customers/${c.id}/prices`);
    customerPriceList.value = res.data || [];
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

async function saveCustomerPrice(p) {
  if (!p.custom_price || p.custom_price <= 0) return;
  try {
    await apiFetch(`/api/customers/${selectedCustForPrice.value.id}/prices`, {
      method: 'POST',
      body: JSON.stringify({
        product_id: p.product_id,
        price: p.custom_price
      })
    });
    appStore.showToast(`Harga khusus ${p.name} tersimpan!`, 'success');
  } catch (err) {
    appStore.showToast(err.message, 'error');
  }
}

let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    fetchCustomers();
  }, 300);
}

// ==========================================
// SIDEBAR DETAIL CUSTOMER & RIWAYAT PIUTANG
// ==========================================
const selectedCustForSidebar = ref(null);
const sidebarTab = ref('debts');
const sidebarLoading = ref(false);
const custDetailData = ref(null);
const activeInvoice = ref(null);

async function openCustomerDetailSidebar(c) {
  selectedCustForSidebar.value = c;
  sidebarTab.value = 'debts';
  sidebarLoading.value = true;
  custDetailData.value = null;

  try {
    const res = await apiFetch(`/api/customers/${c.id}/detail`);
    custDetailData.value = res.data;
  } catch (err) {
    appStore.showToast('Gagal memuat detail pelanggan: ' + err.message, 'error');
  } finally {
    sidebarLoading.value = false;
  }
}

function closeCustomerDetailSidebar() {
  selectedCustForSidebar.value = null;
  custDetailData.value = null;
}

async function viewInvoiceDetail(invoiceId) {
  if (!invoiceId) return;
  try {
    const res = await apiFetch(`/api/invoices/${invoiceId}`);
    activeInvoice.value = res.data;
  } catch (e) {
    appStore.showToast(e.message || 'Gagal memuat rincian faktur', 'error');
  }
}

function onEditInvoiceFromRefer(inv) {
  activeInvoice.value = null;
  closeCustomerDetailSidebar();
  router.push(`/sales?edit_invoice_id=${inv.id}`);
}

function referToSalesKasir(debtItem) {
  closeCustomerDetailSidebar();
  // Alihkan ke halaman kasir penjualan dengan parameter edit transaksi
  router.push(`/sales?edit_invoice_id=${debtItem.id}`);
}

function handleEditDebtFromSidebar(c) {
  const custToEdit = c || selectedCustForSidebar.value;
  closeCustomerDetailSidebar();
  if (custToEdit) {
    openEditModal(custToEdit);
  }
}

onMounted(() => {
  fetchCustomers();
  fetchBranches();
  fetchSalesList();
});
</script>

<style scoped>
.customers-page {
  padding: 16px;
  padding-bottom: 90px;
}
.page-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.title-meta h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}
.title-meta .subtext {
  font-size: 12px;
  color: var(--text-muted);
}
.btn-add-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: white;
  padding: 8px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 114, 255, 0.25);
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.btn-add-primary:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.header-action {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.search-input {
  flex: 1;
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
.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}
.empty-state p {
  font-size: 13px;
}
.cust-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.cust-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cust-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
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
.cust-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cust-name {
  font-weight: 700;
  font-size: 15px;
}
.cust-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.credit-info {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
}
.cust-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.btn-edit-cust {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-hover, #f1f5f9);
  border: 1px solid var(--border-color, #e2e8f0);
  color: var(--text-main, #1e293b);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-edit-cust:hover {
  background: #e2e8f0;
  color: var(--primary, #0284c7);
}
.btn-price {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #16a34a;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-price:hover {
  background: #dcfce7;
}
.btn-delete-cust {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  min-height: 36px;
  border-radius: var(--radius-btn, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-delete-cust:hover {
  background: #fee2e2;
  color: #b91c1c;
}

/* Modals styling uses global styles.css (.sheet-overlay, .sheet-content, .sheet-head, .sheet-footer) */
.subtitle {
  font-size: 13px;
  color: var(--text-muted);
}
.price-edit-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.price-edit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--bg-app);
  border-radius: 8px;
}
.p-meta {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.p-meta small {
  color: var(--text-muted);
}
.p-input-wrap {
  width: 120px;
}
.p-input-wrap input {
  padding: 6px 8px;
  font-size: 13px;
  text-align: right;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.btn-save {
  background: var(--success);
  color: white;
  width: 100%;
  min-height: 44px;
  font-size: 15px;
  margin-top: 8px;
}

/* Tombol Cepat Riwayat di Kartu Pelanggan */
.btn-detail-quick {
  background: rgba(2, 132, 199, 0.1);
  color: #0284c7;
  border: 1px solid rgba(2, 132, 199, 0.25);
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.btn-detail-quick:hover {
  background: #0284c7;
  color: #fff;
}

/* ==========================================
   SIDEBAR DRAWER STYLES
   ========================================== */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  z-index: 1100;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease;
}

.sidebar-drawer {
  width: 100%;
  max-width: 580px;
  height: 100%;
  background: var(--bg-card, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.18);
  animation: slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideLeft {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.sidebar-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-card, #fff);
}
.sidebar-pretitle {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #0284c7;
  display: block;
  margin-bottom: 2px;
}
.sidebar-title-box h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-main, #0f172a);
}
.sidebar-subtitle {
  font-size: 12px;
  color: var(--text-muted, #64748b);
  margin-top: 4px;
  display: block;
}
.btn-close-sidebar {
  background: var(--bg-app, #f1f5f9);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.btn-close-sidebar:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* Summary Card */
.sidebar-summary-card {
  margin: 14px 20px 0;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sidebar-summary-card.has-debt {
  background: #fff5f5;
  border-color: #fecaca;
}
.summary-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-label {
  font-size: 11px;
  color: var(--text-muted, #64748b);
  font-weight: 500;
}
.stat-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #1e293b);
}
.text-debt {
  color: #dc2626 !important;
}
.summary-stat-divider {
  width: 1px;
  height: 28px;
  background: var(--border-color, #e2e8f0);
}

/* Tabs */
.sidebar-tabs {
  display: flex;
  padding: 12px 20px 0;
  gap: 6px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.sidebar-tab-btn {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.sidebar-tab-btn.active {
  color: #0284c7;
  border-bottom-color: #0284c7;
  font-weight: 700;
}

/* Body */
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.sidebar-loading-state, .sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: var(--text-muted, #64748b);
  gap: 8px;
  font-size: 13px;
}
.spin-icon {
  color: #0284c7;
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Debt items list */
.debt-items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.debt-item-card {
  padding: 14px;
  border-radius: 12px;
  border: 1.5px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;
}
.debt-item-card.is-unpaid {
  border-color: #fed7aa;
  background: #fffbf7;
  box-shadow: 0 2px 6px rgba(234, 88, 12, 0.05);
}
.debt-item-card.is-overdue {
  border-color: #fca5a5;
  background: #fff5f5;
}
.debt-item-card.is-paid {
  opacity: 0.85;
}

.debt-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.debt-inv-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.debt-inv-no {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #0f172a);
}
.debt-date {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
.debt-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}
.badge-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}
.tag-unpaid {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fed7aa;
}
.tag-paid {
  background: #d1fae5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.tag-overdue {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.debt-amount-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}
.amount-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.amount-col small {
  font-size: 10px;
  color: var(--text-muted, #64748b);
  text-transform: uppercase;
}
.amount-col span, .amount-col strong {
  font-size: 13px;
  font-weight: 600;
}
.debt-due-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #dc2626;
  background: #fef2f2;
  padding: 4px 8px;
  border-radius: 6px;
  width: fit-content;
}

.debt-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.btn-refer-tx {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-color, #cbd5e1);
  background: #fff;
  color: var(--text-main, #1e293b);
  transition: all 0.15s ease;
}
.btn-refer-tx:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
.btn-sales-ref {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.btn-sales-ref:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

/* Payments items list */
.payment-items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.payment-item-card {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pay-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.pay-meta-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pay-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pay-type-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main, #0f172a);
}
.pay-method-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 4px;
}
.pay-date {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
.pay-amount {
  font-size: 15px;
  font-weight: 700;
}
.pay-note {
  font-size: 12px;
  color: var(--text-muted, #475569);
  background: #f8fafc;
  padding: 6px 10px;
  border-radius: 6px;
}
.pay-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
.btn-ref-invoice-link {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
}
.btn-ref-invoice-link:hover {
  background: #f0f9ff;
  text-decoration: underline;
}

/* Adjustments items list */
.adjust-items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.adjust-item-card {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.adj-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.adj-action-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  background: #fef3c7;
  color: #b45309;
  border-radius: 6px;
}
.adj-date {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
.adj-balance-comparison {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.bal-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bal-box small {
  font-size: 10px;
  color: var(--text-muted, #64748b);
}
.adj-arrow {
  color: #94a3b8;
  font-weight: 700;
}
.adj-reason {
  font-size: 12px;
  color: var(--text-main, #1e293b);
  background: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}
.adj-user {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}

/* Sidebar Footer */
.sidebar-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #fff);
}
.btn-sidebar-close {
  width: 100%;
  padding: 11px;
  background: var(--bg-app, #f1f5f9);
  color: var(--text-main, #1e293b);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-sidebar-close:hover {
  background: #e2e8f0;
}
</style>
