<template>
  <div class="stock-page">
    <!-- Header Aksi & Filter Kategori -->
    <div class="stock-header">
      <div class="search-input-wrapper">
        <Icon name="search" size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari barang atau kategori..."
          class="search-input"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear-btn"
          @click="searchQuery = ''"
          title="Hapus pencarian"
        >
          <Icon name="x" size="14" />
        </button>
      </div>
      <div class="header-action-group">
        <button
          v-if="canSendStock"
          class="btn-send-stock"
          @click="openSendStockModal()"
          title="Kirim Stok ke Sales"
        >
          <Icon name="truck" size="15" />
          <span>Kirim ke Sales</span>
        </button>
        <button
          v-if="canManageStock"
          class="btn-manage"
          @click="showAddModal = true"
          title="Tambah Produk / Barang Baru"
        >
          <Icon name="plus" size="15" />
          <span>Tambah Barang</span>
        </button>
        <router-link
          v-if="canManageStock"
          to="/stock/opname"
          class="btn-nav-stock"
          title="Buka Menu Stock Opname Fisik"
        >
          <Icon name="check" size="14" />
          <span>Opname</span>
        </router-link>
      </div>
    </div>

    <!-- Tab Pilihan: Stok Saya vs Stok Admin (Khusus Sales) -->
    <div v-if="isSales" class="stock-source-tabs">
      <button
        class="tab-btn-source"
        :class="{ active: stockSource === 'mine' }"
        @click="switchSource('mine')"
      >
        🎒 Stok Saya (Tersedia: {{ myStockCount }})
      </button>
      <button
        class="tab-btn-source"
        :class="{ active: stockSource === 'admin' }"
        @click="switchSource('admin')"
      >
        🏢 Stok Admin / Pusat
      </button>
    </div>

    <!-- Filter Periode Monitoring Stok (Khusus Sales saat melihat Stok Saya) -->
    <div v-if="isSales && stockSource === 'mine'" class="stock-period-tabs">
      <span class="period-label">Periode:</span>
      <button
        v-for="p in periodOptions"
        :key="p.key"
        class="period-btn"
        :class="{ active: selectedPeriod === p.key }"
        @click="changePeriod(p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Filter Kategori -->
    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat"
        class="cat-btn"
        :class="{ active: selectedCategory === cat }"
        @click="selectCategory(cat)"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Daftar Stok Barang -->
    <div v-if="loading" class="state-msg">Memuat data stok barang...</div>
    <div v-else-if="filteredProducts.length === 0" class="empty-state">
      <div class="empty-icon-box"><Icon name="package" size="38" /></div>
      <h3>Barang Tidak Ditemukan</h3>
      <p>Tidak ada stok barang yang cocok dengan filter atau pencarian Anda.</p>
    </div>
    <div v-else>
      <div class="stock-list">
        <div
          v-for="p in paginatedProducts"
          :key="p.id"
          class="card stock-card"
          :class="{ 'card-low': p.is_low_stock }"
        >
          <!-- Bagian Atas Card: Foto, Nama, Kategori, Harga & Badge Stok -->
          <div class="stock-card-top">
            <div class="stock-left">
              <div class="prod-thumb">
                <span class="stock-emoji">📦</span>
              </div>
              <div class="stock-details">
                <span class="prod-name" :title="p.name">{{ p.name }}</span>
                <small class="prod-cat">{{ p.category }}</small>
                <div class="price-row">
                  <span class="price-val">Rp {{ formatNumber(p.price) }}</span>
                  <span v-if="p.cost_price" class="cost-price">Beli: Rp {{ formatNumber(p.cost_price) }}</span>
                </div>
              </div>
            </div>

            <!-- Badge Stok di pojok kanan atas -->
            <div class="stock-badge-pill" :class="p.is_low_stock ? 'badge-low' : 'badge-safe'">
              <span class="stock-pill-lbl">{{ isSales && stockSource === 'mine' ? 'Sisa Stok' : 'Stok' }}</span>
              <strong class="stock-pill-val">{{ formatNumber(isSales && stockSource === 'mine' ? (p.sisa_stok !== undefined ? p.sisa_stok : p.stock) : p.stock) }}</strong>
            </div>
          </div>

          <!-- Monitoring Detail untuk Sales (A4: Diminta, Dikirim, Laku, Sisa Stok) -->
          <div v-if="isSales && stockSource === 'mine'" class="sales-stock-stats-grid">
            <div class="stat-pill-item">
              <span class="stat-pill-label">Diminta</span>
              <strong class="stat-pill-value text-muted">{{ formatNumber(p.diminta || 0) }}</strong>
            </div>
            <div class="stat-pill-item">
              <span class="stat-pill-label">Dikirim</span>
              <strong class="stat-pill-value text-primary">{{ formatNumber(p.dikirim || 0) }}</strong>
            </div>
            <div class="stat-pill-item">
              <span class="stat-pill-label">Laku</span>
              <strong class="stat-pill-value text-danger">{{ formatNumber(p.laku || 0) }}</strong>
            </div>
            <div class="stat-pill-item highlight">
              <span class="stat-pill-label">Sisa Stok</span>
              <strong class="stat-pill-value text-success">{{ formatNumber(p.sisa_stok !== undefined ? p.sisa_stok : p.stock) }}</strong>
            </div>
          </div>

          <!-- Bagian Bawah Card: Tombol Aksi (+ Stok, Edit, Koreksi) -->
          <div class="stock-card-bottom" v-if="canManageStock">
            <div class="stock-actions-btn">
              <button
                class="stock-btn btn-add-stock"
                @click="openAddStockModal(p)"
                title="Tambah Stok Masuk (+)"
              >
                <Icon name="plus" size="13" />
                <span>+ Stok</span>
              </button>
              <button
                class="stock-btn btn-edit"
                @click="openEditModal(p)"
                title="Edit Data & Gambar Barang"
              >
                <Icon name="edit" size="13" />
                <span>Edit</span>
              </button>
              <button
                class="stock-btn btn-adjust"
                @click="openAdjustModal(p)"
                title="Koreksi / Penyesuaian Stok"
              >
                <Icon name="sliders" size="13" />
                <span>Koreksi</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination Stok -->
      <div v-if="stockTotalPages > 1" class="pagination-bar">
        <span class="page-info">
          Menampilkan {{ formatNumber((stockCurrentPage - 1) * stockPageSize + 1) }} - {{ formatNumber(Math.min(stockCurrentPage * stockPageSize, filteredProducts.length)) }} dari {{ formatNumber(filteredProducts.length) }} barang
        </span>
        <div class="page-buttons">
          <button
            class="btn-page"
            :disabled="stockCurrentPage === 1"
            @click="stockCurrentPage--"
          >
            &laquo; Sebelumnya
          </button>
          <span class="page-num">Hal {{ formatNumber(stockCurrentPage) }} / {{ formatNumber(stockTotalPages) }}</span>
          <button
            class="btn-page"
            :disabled="stockCurrentPage === stockTotalPages"
            @click="stockCurrentPage++"
          >
            Berikutnya &raquo;
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Edit Produk Lengkap (Admin) -->
    <div v-if="editProduct" class="sheet-overlay" @click.self="editProduct = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Edit Data Barang</h3>
          <button class="sheet-close" @click="editProduct = null">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">


          <div class="form-group">
            <label>Nama Barang *</label>
            <input v-model="editForm.name" type="text" required />
          </div>

          <div class="form-group">
            <label>Kategori *</label>
            <input
              v-model="editForm.category"
              list="category-suggestions"
              type="text"
              placeholder="Pilih atau ketik kategori baru"
              required
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Harga Jual *</label>
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(editForm.price)"
                @input="onFormattedInput(editForm, 'price', $event)"
                placeholder="0"
                required
              />
            </div>
            <div class="form-group" v-if="canViewCost">
              <label>Harga Beli (HPP)</label>
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(editForm.cost_price)"
                @input="onFormattedInput(editForm, 'cost_price', $event)"
                placeholder="0"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Stok Saat Ini (Terkunci)</label>
              <div class="locked-stock-input">
                <input
                  type="text"
                  :value="formatNumber(editForm.stock) + ' pcs'"
                  readonly
                  disabled
                  class="input-disabled"
                />
              </div>
              <small class="helper-note">Ubah stok melalui tombol <strong>+ Stok</strong> atau <strong>Koreksi</strong>.</small>
            </div>
            <div class="form-group">
              <label>Ikon Emoji (Jika Tanpa Foto)</label>
              <input v-model="editForm.emoji" type="text" placeholder="Contoh: 🥩, 🍗, 🌭" />
            </div>
          </div>

          <button
            class="btn-save"
            @click="submitEditProduct"
            :disabled="editLoading || !editForm.name || !editForm.price"
          >
            <Icon name="check" size="16" v-if="!editLoading" />
            <span>{{ editLoading ? 'Menyimpan Perubahan...' : 'Simpan Perubahan Barang' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Koreksi / Tambah Stok -->
    <div v-if="adjustProduct" class="sheet-overlay" @click.self="adjustProduct = null">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>{{ adjustReason === 'Masuk' ? 'Tambah Stok Masuk: ' : 'Koreksi Stok: ' }}{{ adjustProduct.name }}</h3>
          <button class="sheet-close" @click="adjustProduct = null">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">
          <div class="cur-stock-box">
            <span>Stok Sistem Saat Ini:</span>
            <strong>{{ formatNumber(adjustProduct.stock) }} pcs</strong>
          </div>

          <div class="form-group">
            <label>Jenis Penyesuaian</label>
            <select v-model="adjustReason">
              <option value="Masuk">Tambah Stok Masuk (+)</option>
              <option value="Koreksi">Koreksi / Penyesuaian (+/-)</option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ adjustReason === 'Masuk' ? 'Jumlah Stok yang Ditambahkan (pcs) *' : 'Jumlah Perubahan (Gunakan minus "-" untuk pengurangan)' }}</label>
            <input
              type="text"
              inputmode="numeric"
              :value="adjustChange === null || adjustChange === undefined ? '' : formatChangeNumber(adjustChange)"
              @input="onAdjustChangeInput($event)"
              :placeholder="adjustReason === 'Masuk' ? 'Contoh: 50' : 'Contoh: 10 atau -5'"
            />
          </div>

          <div class="form-group">
            <label>Catatan / Alasan</label>
            <input v-model="adjustNote" type="text" placeholder="Contoh: Barang rusak / masuk gudang" />
          </div>

          <div class="cur-stock-box">
            <span>Perkiraan Stok Akhir:</span>
            <strong :class="adjustFinalStock < 0 ? 'text-danger' : 'text-success'">
              {{ formatNumber(adjustFinalStock) }} pcs
            </strong>
          </div>

          <button
            class="btn-save"
            @click="submitAdjust"
            :disabled="adjustLoading || adjustFinalStock < 0 || !adjustChange"
          >
            <Icon name="check" size="16" v-if="!adjustLoading" />
            <span>{{ adjustLoading ? 'Menyimpan...' : 'Simpan Penyesuaian' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Produk Baru -->
    <div v-if="showAddModal" class="sheet-overlay" @click.self="showAddModal = false">
      <div class="sheet-content">
        <div class="sheet-head">
          <h3>Tambah Barang Baru</h3>
          <button class="sheet-close" @click="showAddModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body">


          <div class="form-group">
            <label>Nama Barang *</label>
            <input v-model="newProd.name" type="text" placeholder="Contoh: Daging Sapi Slice 500g" required />
          </div>

          <div class="form-group">
            <label>Kategori *</label>
            <input
              v-model="newProd.category"
              list="category-suggestions"
              type="text"
              placeholder="Pilih atau ketik kategori baru"
              required
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Harga Jual *</label>
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(newProd.price)"
                @input="onFormattedInput(newProd, 'price', $event)"
                placeholder="0"
                required
              />
            </div>
            <div class="form-group" v-if="canViewCost">
              <label>Harga Beli (HPP)</label>
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(newProd.cost_price)"
                @input="onFormattedInput(newProd, 'cost_price', $event)"
                placeholder="0"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Stok Awal</label>
              <input
                type="text"
                inputmode="numeric"
                :value="formatNumber(newProd.stock)"
                @input="onFormattedInput(newProd, 'stock', $event)"
                placeholder="0"
              />
            </div>
            <div class="form-group">
              <label>Ikon Emoji (Jika Tanpa Foto)</label>
              <input v-model="newProd.emoji" type="text" placeholder="Contoh: 🥩, 🍗, 🌭" />
            </div>
          </div>

          <button
            class="btn-save"
            @click="submitCreateProduct"
            :disabled="createLoading || !newProd.name || !newProd.price"
          >
            <Icon name="check" size="16" v-if="!createLoading" />
            <span>{{ createLoading ? 'Menyimpan...' : 'Tambah Barang' }}</span>
          </button>
        </div>
      </div>
    </div>
    <!-- Modal Kirim Stok Bebas ke Sales Batch (R1) -->
    <div v-if="showSendStockModal" class="sheet-overlay batch-send-overlay" @click.self="showSendStockModal = false">
      <div class="sheet-content batch-send-content">
        <div class="sheet-head">
          <div>
            <h3>Kirim Stok ke Sales</h3>
            <span class="subtext">Kirim banyak barang sekaligus dalam satu batch pengiriman</span>
          </div>
          <button class="sheet-close" @click="showSendStockModal = false">
            <Icon name="x" size="18" />
          </button>
        </div>

        <div class="sheet-body batch-send-body">
          <!-- 1. STICKY SALES SELECTOR DI ATAS -->
          <div class="sticky-sales-header">
            <div class="sales-select-box">
              <label class="form-label font-bold">👤 Pilih Sales Penerima *</label>
              <select
                v-model="sendForm.sales_id"
                class="form-select sales-main-select"
                @change="onSalesSelectedChange"
              >
                <option value="">-- Pilih Sales Penerima --</option>
                <option v-for="s in salesUsersList" :key="s.id" :value="s.id">
                  {{ s.full_name || s.username }} ({{ s.branch_id || 'Cabang' }})
                </option>
              </select>
            </div>

            <div v-if="sendForm.sales_id" class="sales-quick-toolbar">
              <div class="toolbar-info">
                <span>Total Permintaan Aktif Sales: <strong>{{ formatNumber(totalRequestedForSelectedSales) }} pcs</strong></span>
              </div>
              <button
                type="button"
                class="btn-auto-fill-req"
                :disabled="totalRequestedForSelectedSales <= 0"
                @click="fillItemsFromDemand"
                title="Isi otomatis semua barang yang diminta sales ini"
              >
                ⚡ Isi Sesuai Permintaan
              </button>
            </div>
          </div>

          <div v-if="!sendForm.sales_id" class="sales-unselected-notice">
            <Icon name="info" size="20" />
            <span>Silakan pilih Sales penerima terlebih dahulu untuk mulai memilih barang yang akan dikirim.</span>
          </div>

          <div v-else class="batch-send-main">
            <!-- 2. PILIH BANYAK BARANG (Pola UI Input Order Sales) -->
            <div class="batch-product-picker-section">
              <div class="picker-search-bar">
                <Icon name="search" size="14" class="search-ic" />
                <input
                  v-model="sendSearchQuery"
                  type="text"
                  placeholder="Cari nama barang gudang..."
                  class="picker-search-input"
                />
                <button v-if="sendSearchQuery" type="button" class="btn-clear-sm" @click="sendSearchQuery = ''">×</button>
              </div>

              <!-- Filter Kategori Barang Pengiriman -->
              <div class="picker-cat-tabs">
                <button
                  v-for="cat in sendPickerCategories"
                  :key="cat"
                  class="picker-cat-btn"
                  :class="{ active: sendSelectedCategory === cat }"
                  @click="sendSelectedCategory = cat"
                >
                  {{ cat }}
                </button>
              </div>

              <!-- Grid Barang untuk Dipilih Cepat -->
              <div class="batch-prod-grid">
                <button
                  v-for="p in filteredSendPickerProducts"
                  :key="p.id"
                  type="button"
                  class="batch-prod-tile"
                  :class="{
                    'is-selected': isProductInSendBatch(p.id),
                    'is-requested': getDemandQtyForProduct(p.id) > 0,
                    'is-out-of-stock': (p.stock || 0) <= 0
                  }"
                  @click="addProductToSendBatch(p)"
                >
                  <span class="tile-icon">📦</span>
                  <span class="tile-name">{{ p.name }}</span>
                  <div class="tile-meta">
                    <span class="tile-stock" :class="{ 'text-danger': (p.stock || 0) <= 0 }">
                      Gudang: {{ formatNumber(p.stock) }}
                    </span>
                    <span v-if="getDemandQtyForProduct(p.id) > 0" class="tile-demand-tag">
                      Minta: {{ formatNumber(getDemandQtyForProduct(p.id)) }}
                    </span>
                  </div>
                  <span v-if="getSendBatchItemQty(p.id) > 0" class="tile-badge-qty">
                    {{ getSendBatchItemQty(p.id) }}
                  </span>
                </button>
              </div>
            </div>

            <!-- 3. DAFTAR BARANG YANG AKAN DIKIRIM (Multi-item dengan Stepper, Referensi & Validasi Per Baris) -->
            <div class="batch-items-container">
              <div class="batch-items-header">
                <strong class="font-bold">Barang Dikirim ({{ sendBatchItems.length }} jenis)</strong>
                <button
                  v-if="sendBatchItems.length > 0"
                  type="button"
                  class="btn-clear-all-batch"
                  @click="sendBatchItems = []"
                >
                  Kosongkan
                </button>
              </div>

              <div v-if="sendBatchItems.length === 0" class="batch-empty-box">
                <Icon name="package" size="24" />
                <p>Belum ada barang ditambahkan ke daftar kirim.</p>
                <small class="text-muted">Klik barang pada daftar di atas atau tekan "Isi Sesuai Permintaan".</small>
              </div>

              <div v-else class="batch-items-scroll-list">
                <div
                  v-for="(it, idx) in sendBatchItems"
                  :key="it.product_id"
                  class="batch-item-card"
                  :class="{ 'has-error': it.qty > it.admin_stock || it.qty <= 0 }"
                >
                  <div class="batch-item-head">
                    <span class="item-name font-bold">{{ it.product_name }}</span>
                    <button type="button" class="btn-remove-batch-item" @click="sendBatchItems.splice(idx, 1)" title="Hapus">
                      <Icon name="trash" size="14" />
                    </button>
                  </div>

                  <!-- Referensi: Permintaan, Stok Gudang, Stok Sales Saat Ini -->
                  <div class="batch-item-refs">
                    <span class="ref-pill">
                      Permintaan: <strong>{{ formatNumber(it.demand_qty) }} pcs</strong>
                    </span>
                    <span class="ref-pill" :class="{ 'ref-warn': it.qty > it.admin_stock }">
                      Stok Gudang: <strong>{{ formatNumber(it.admin_stock) }} pcs</strong>
                    </span>
                    <span class="ref-pill">
                      Stok Sales: <strong>{{ formatNumber(it.current_sales_stock) }} pcs</strong>
                    </span>
                  </div>

                  <!-- Input Qty Kirim Bebas dengan Stepper -->
                  <div class="batch-item-control-row">
                    <label class="control-label">Jumlah Kirim:</label>
                    <div class="batch-stepper">
                      <button type="button" @click="it.qty = Math.max(0, (parseInt(it.qty, 10) || 0) - 1)">−</button>
                      <input
                        v-model.number="it.qty"
                        type="number"
                        min="1"
                        class="batch-qty-input"
                        @input="it.qty = Math.max(0, parseInt(it.qty, 10) || 0)"
                      />
                      <button type="button" @click="it.qty = (parseInt(it.qty, 10) || 0) + 1">+</button>
                    </div>
                    <button
                      type="button"
                      class="btn-set-demand"
                      v-if="it.demand_qty > 0"
                      @click="it.qty = it.demand_qty"
                      title="Set ke jumlah permintaan"
                    >
                      = Minta ({{ it.demand_qty }})
                    </button>
                    <button
                      type="button"
                      class="btn-set-max"
                      @click="it.qty = it.admin_stock"
                      title="Set ke maksimal stok gudang"
                    >
                      Max ({{ it.admin_stock }})
                    </button>
                  </div>

                  <!-- Validasi Error Per Baris -->
                  <div v-if="it.qty > it.admin_stock" class="item-row-error">
                    ⚠️ Melebihi stok gudang (tersedia: {{ formatNumber(it.admin_stock) }} pcs, kurang {{ formatNumber(it.qty - it.admin_stock) }} pcs)
                  </div>
                  <div v-else-if="it.qty <= 0" class="item-row-error">
                    ⚠️ Jumlah kirim minimal 1 pcs
                  </div>
                </div>
              </div>

              <!-- Catatan Pengiriman -->
              <div class="form-group send-batch-note-box">
                <label class="form-label">Catatan Pengiriman / No Surat Jalan (Opsional)</label>
                <input
                  v-model="sendForm.note"
                  type="text"
                  placeholder="Contoh: Titipan pengiriman pagi via kurir A"
                  class="form-input"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 5. STICKY SUMMARY & TOMBOL KIRIM SEMUA DI BAWAH -->
        <div class="sheet-footer batch-send-footer">
          <div class="batch-summary-info">
            <span class="summary-kinds">{{ sendBatchItems.length }} Jenis Barang</span>
            <span class="summary-dot">·</span>
            <strong class="summary-total-qty">Total: {{ formatNumber(totalBatchSendQty) }} pcs</strong>
          </div>
          <div class="batch-footer-actions">
            <button type="button" class="btn-secondary" @click="showSendStockModal = false">
              Batal
            </button>
            <button
              type="button"
              class="btn-primary btn-submit-batch-send"
              :disabled="sendStockLoading || sendBatchItems.length === 0 || hasBatchValidationErrors || !sendForm.sales_id"
              @click="submitSendStockBatch"
            >
              <Icon name="truck" size="16" />
              <span>{{ sendStockLoading ? 'Mengirim...' : 'Kirim Semua' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Datalist Rekomendasi Kategori Dinamis -->
    <datalist id="category-suggestions">
      <option v-for="cat in dynamicCategoryList" :key="cat" :value="cat" />
    </datalist>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { apiFetch } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useAppStore } from '../stores/app.js';
import Icon from '../components/Icon.vue';
import { formatNumber } from '../utils/format.js';

const authStore = useAuthStore();
const appStore = useAppStore();
const user = computed(() => authStore.user);
const isSales = computed(() => user.value?.role === 'sales');
const isAdmin = computed(() => ['admin', 'manajer'].includes(user.value?.role));
const canSendStock = computed(() => isAdmin.value);
const stockSource = ref('mine'); // 'mine' | 'admin'
const mySalesStock = ref([]);
const myStockCount = computed(() => mySalesStock.value.filter(s => s.stock > 0).length);

const periodOptions = [
  { key: 'semua', label: 'Semua' },
  { key: 'hari_ini', label: 'Hari Ini' },
  { key: 'minggu_ini', label: 'Minggu Ini' },
  { key: 'bulan_ini', label: 'Bulan Ini' }
];
const selectedPeriod = ref('semua');

function changePeriod(pKey) {
  selectedPeriod.value = pKey;
  fetchProducts();
}

// State Kirim Stok Batch ke Sales (R1)
const showSendStockModal = ref(false);
const sendStockLoading = ref(false);
const salesUsersList = ref([]);
const allAdminProducts = ref([]);
const sendBatchItems = ref([]);
const sendSearchQuery = ref('');
const sendSelectedCategory = ref('Semua');
const salesStocksMap = ref({}); // sales_id -> { product_id: stock }
const sendForm = ref({
  sales_id: '',
  note: ''
});
const activeRequestsList = ref([]); // [{ sales_id, product_id, qty, product_name }]

const sendPickerCategories = computed(() => {
  const cats = new Set(['Semua']);
  allAdminProducts.value.forEach(p => {
    if (p.category) cats.add(p.category);
  });
  return Array.from(cats);
});

const filteredSendPickerProducts = computed(() => {
  const q = sendSearchQuery.value.toLowerCase().trim();
  const cat = sendSelectedCategory.value;
  return allAdminProducts.value.filter(p => {
    const matchCat = cat === 'Semua' || p.category === cat;
    const matchQ = !q || (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });
});

const totalRequestedForSelectedSales = computed(() => {
  if (!sendForm.value.sales_id) return 0;
  return activeRequestsList.value
    .filter(r => r.sales_id === sendForm.value.sales_id)
    .reduce((sum, r) => sum + (parseInt(r.qty, 10) || 0), 0);
});

const totalBatchSendQty = computed(() => {
  return sendBatchItems.value.reduce((sum, it) => sum + (parseInt(it.qty, 10) || 0), 0);
});

const hasBatchValidationErrors = computed(() => {
  if (sendBatchItems.value.length === 0) return true;
  return sendBatchItems.value.some(it => {
    const q = parseInt(it.qty, 10) || 0;
    const maxStock = parseInt(it.admin_stock, 10) || 0;
    return q <= 0 || q > maxStock;
  });
});

function getDemandQtyForProduct(productId) {
  if (!sendForm.value.sales_id) return 0;
  const match = activeRequestsList.value.find(r => r.sales_id === sendForm.value.sales_id && r.product_id === productId);
  return match ? match.qty : 0;
}

function getSendBatchItemQty(productId) {
  const match = sendBatchItems.value.find(it => it.product_id === productId);
  return match ? match.qty : 0;
}

function isProductInSendBatch(productId) {
  return sendBatchItems.value.some(it => it.product_id === productId);
}

function addProductToSendBatch(product) {
  const existing = sendBatchItems.value.find(it => it.product_id === product.id);
  if (existing) {
    existing.qty = (parseInt(existing.qty, 10) || 0) + 1;
  } else {
    const demand = getDemandQtyForProduct(product.id);
    const adminStock = parseInt(product.stock, 10) || 0;
    const salesStock = getSalesStockForProduct(sendForm.value.sales_id, product.id);
    sendBatchItems.value.push({
      product_id: product.id,
      product_name: product.name,
      qty: demand > 0 ? demand : 1,
      admin_stock: adminStock,
      demand_qty: demand,
      current_sales_stock: salesStock
    });
  }
}

function getSalesStockForProduct(salesId, productId) {
  if (!salesId || !salesStocksMap.value[salesId]) return 0;
  return salesStocksMap.value[salesId][productId] || 0;
}

function onSalesSelectedChange() {
  // Update sales stock dan demand referensi pada barang-barang di batch
  sendBatchItems.value.forEach(it => {
    it.demand_qty = getDemandQtyForProduct(it.product_id);
    it.current_sales_stock = getSalesStockForProduct(sendForm.value.sales_id, it.product_id);
  });
}

function fillItemsFromDemand() {
  if (!sendForm.value.sales_id) return;
  const demands = activeRequestsList.value.filter(r => r.sales_id === sendForm.value.sales_id && r.qty > 0);
  if (demands.length === 0) {
    return appStore.showToast('Tidak ada permintaan aktif dari sales ini', 'info');
  }

  demands.forEach(d => {
    const prod = allAdminProducts.value.find(p => p.id === d.product_id);
    const existing = sendBatchItems.value.find(it => it.product_id === d.product_id);
    const adminStock = prod ? (parseInt(prod.stock, 10) || 0) : 0;
    const salesStock = getSalesStockForProduct(sendForm.value.sales_id, d.product_id);

    if (existing) {
      existing.qty = d.qty;
      existing.demand_qty = d.qty;
      existing.admin_stock = adminStock;
      existing.current_sales_stock = salesStock;
    } else {
      sendBatchItems.value.push({
        product_id: d.product_id,
        product_name: prod ? prod.name : (d.product_name || 'Barang'),
        qty: d.qty,
        admin_stock: adminStock,
        demand_qty: d.qty,
        current_sales_stock: salesStock
      });
    }
  });

  appStore.showToast(`Berhasil memuat ${demands.length} barang sesuai permintaan sales`, 'success');
}

async function openSendStockModal() {
  showSendStockModal.value = true;
  sendForm.value = { sales_id: '', note: '' };
  sendBatchItems.value = [];
  sendSearchQuery.value = '';
  sendSelectedCategory.value = 'Semua';

  try {
    const [usersRes, prodRes, ordersRes] = await Promise.all([
      apiFetch('/api/users'),
      apiFetch('/api/products?active=true'),
      apiFetch('/api/orders?status=Proses&limit=100')
    ]);
    salesUsersList.value = (usersRes.data || []).filter(u => u.role === 'sales' && u.active !== false);
    allAdminProducts.value = prodRes.data || [];

    // Kumpulkan referensi permintaan aktif per sales & product
    const reqMap = new Map();
    (ordersRes.data || []).forEach(o => {
      (o.items || []).forEach(it => {
        const key = `${o.sales_id}_${it.product_id}`;
        const qty = parseInt(it.qty, 10) || 0;
        if (reqMap.has(key)) {
          reqMap.get(key).qty += qty;
        } else {
          reqMap.set(key, {
            sales_id: o.sales_id,
            product_id: it.product_id,
            product_name: it.product_name || it.name,
            qty
          });
        }
      });
    });
    activeRequestsList.value = Array.from(reqMap.values());

    // Coba muat data stok sales saat ini jika ada endpoint
    try {
      const stockRes = await apiFetch('/api/sales-stock');
      const sMap = {};
      (stockRes.data || []).forEach(st => {
        if (!sMap[st.sales_id]) sMap[st.sales_id] = {};
        sMap[st.sales_id][st.product_id] = parseInt(st.stock, 10) || 0;
      });
      salesStocksMap.value = sMap;
    } catch (e) {
      salesStocksMap.value = {};
    }
  } catch (err) {
    appStore.showToast('Gagal memuat data pengiriman: ' + err.message, 'error');
  }
}

async function submitSendStockBatch() {
  if (!sendForm.value.sales_id) {
    return appStore.showToast('Pilih sales penerima terlebih dahulu', 'warning');
  }
  if (sendBatchItems.value.length === 0) {
    return appStore.showToast('Tambahkan minimal 1 barang untuk dikirim', 'warning');
  }
  if (hasBatchValidationErrors.value) {
    return appStore.showToast('Terdapat kesalahan jumlah kirim pada beberapa barang. Periksa peringatan merah.', 'warning');
  }

  sendStockLoading.value = true;
  try {
    const payload = {
      sales_id: sendForm.value.sales_id,
      note: sendForm.value.note || '',
      items: sendBatchItems.value.map(it => ({
        product_id: it.product_id,
        qty: parseInt(it.qty, 10) || 0
      }))
    };

    const res = await apiFetch('/api/products/send-stock', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const totalSent = res.data?.total_qty || totalBatchSendQty.value;
    const targetSales = salesUsersList.value.find(s => s.id === sendForm.value.sales_id);
    const sName = targetSales ? (targetSales.full_name || targetSales.username) : 'Sales';

    appStore.showToast(`Berhasil mengirim ${totalSent} pcs barang ke ${sName}!`, 'success');
    
    // Tawarkan kirim ke sales lain atau tutup modal
    if (confirm(`Pengiriman batch berhasil!\nKirim lagi ke sales lain?`)) {
      sendForm.value.sales_id = '';
      sendForm.value.note = '';
      sendBatchItems.value = [];
    } else {
      showSendStockModal.value = false;
    }

    await fetchProducts();
  } catch (err) {
    appStore.showToast('Gagal mengirim stok batch: ' + err.message, 'error');
  } finally {
    sendStockLoading.value = false;
  }
}

const canManageStock = computed(() => user.value?.role === 'admin' || (user.value?.role !== 'sales' && stockSource.value !== 'mine'));
const canViewCost = computed(() => user.value?.role === 'admin' || user.value?.role === 'manajer');

function switchSource(src) {
  stockSource.value = src;
  stockCurrentPage.value = 1;
  fetchProducts();
}

// Watch perubahan user jika halaman di-refresh saat auth baru selesai dimuat
watch(() => authStore.user, (newVal) => {
  if (newVal) {
    fetchProducts();
  }
});

const loading = ref(false);
const products = ref([]);
const searchQuery = ref('');
const dynamicCategoryList = computed(() => {
  const cats = new Set();
  // Default suggestions
  ['Bakso & Daging', 'Sosis', 'Mie & Pasta', 'Dimsum & Pangsit', 'Camilan & Gorengan', 'Nugget & Ayam', 'Kue & Roti', 'Frozen Food'].forEach(c => cats.add(c));
  products.value.forEach(p => {
    if (p.category && p.category.trim()) {
      cats.add(p.category.trim());
    }
  });
  return Array.from(cats).sort((a, b) => a.localeCompare(b));
});

const categories = computed(() => {
  return ['Semua', ...dynamicCategoryList.value];
});

const selectedCategory = ref('Semua');

// Filter & Pagination Stok Barang (10 per halaman)
const stockCurrentPage = ref(1);
const stockPageSize = ref(10);

function selectCategory(cat) {
  selectedCategory.value = cat;
  stockCurrentPage.value = 1;
}

watch(searchQuery, () => {
  stockCurrentPage.value = 1;
});

const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value !== 'Semua') {
    list = list.filter(p => p.category === selectedCategory.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  return list;
});

const stockTotalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredProducts.value.length / stockPageSize.value));
});

const paginatedProducts = computed(() => {
  const start = (stockCurrentPage.value - 1) * stockPageSize.value;
  return filteredProducts.value.slice(start, start + stockPageSize.value);
});

// State Koreksi Stok
const adjustProduct = ref(null);
const adjustReason = ref('Koreksi');
const adjustChange = ref(0);
const adjustNote = ref('');
const adjustLoading = ref(false);

const adjustFinalStock = computed(() => {
  if (!adjustProduct.value) return 0;
  return (adjustProduct.value.stock || 0) + (adjustChange.value || 0);
});

// State Tambah Produk
const showAddModal = ref(false);
const createLoading = ref(false);
const newProd = ref({
  name: '',
  category: 'Frozen Food',
  price: 0,
  cost_price: 0,
  stock: 0,
  emoji: '📦',
  image: ''
});

// State Edit Produk (Admin)
const editProduct = ref(null);
const editLoading = ref(false);
const editForm = ref({
  id: '',
  name: '',
  category: 'Frozen Food',
  price: 0,
  cost_price: 0,
  stock: 0,
  emoji: '📦',
  image: ''
});

function openEditModal(p) {
  editProduct.value = p;
  editForm.value = {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    cost_price: p.cost_price || 0,
    stock: p.stock || 0,
    emoji: p.emoji || '📦',
    image: p.image || ''
  };
}

function onFormattedInput(obj, field, event) {
  const raw = event.target.value.replace(/\D/g, '');
  const val = raw ? parseInt(raw, 10) : 0;
  obj[field] = val;
  event.target.value = formatNumber(val);
}

function formatChangeNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '';
  const num = Number(val);
  const isNegative = num < 0;
  const absFormatted = formatNumber(Math.abs(num));
  return isNegative ? `-${absFormatted}` : absFormatted;
}

function onAdjustChangeInput(event) {
  const raw = event.target.value;
  const isNegative = raw.trim().startsWith('-');
  const cleanDigits = raw.replace(/\D/g, '');
  if (!cleanDigits) {
    adjustChange.value = null;
    event.target.value = isNegative ? '-' : '';
    return;
  }
  const intVal = parseInt(cleanDigits, 10);
  adjustChange.value = isNegative ? -intVal : intVal;
  event.target.value = (isNegative ? '-' : '') + formatNumber(intVal);
}

// Handler kompresi & resize gambar via HTML Canvas sebelum dikirim
function handleImageUpload(event, target = 'edit') {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Resize gambar proporsional maks 160x160 agar ringan, cepat, dan muat dalam batas sel Google Spreadsheet
      const maxDim = 160;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Konversi ke format web JPEG 75% quality (~5KB - 8KB)
      const base64Data = canvas.toDataURL('image/jpeg', 0.75);
      if (target === 'edit') {
        editForm.value.image = base64Data;
      } else {
        newProd.value.image = base64Data;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitEditProduct() {
  if (!editForm.value.name || !editForm.value.price) {
    appStore.showToast('Nama dan harga barang wajib diisi', 'warning');
    return;
  }

  const payload = { ...editForm.value };

  // 1. Optimistic Update Instan: langsung update di state produk agar gambar dan data langsung tampil seketika
  const idx = products.value.findIndex(p => p.id === payload.id);
  if (idx !== -1) {
    products.value[idx] = {
      ...products.value[idx],
      name: payload.name,
      category: payload.category,
      price: payload.price,
      cost_price: payload.cost_price,
      stock: payload.stock,
      emoji: payload.emoji,
      image: payload.image || ''
    };
  }

  editProduct.value = null;
  appStore.showToast('Data barang berhasil diperbarui!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    // Refresh quietly in background
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

async function fetchProducts() {
  loading.value = true;
  try {
    if (isSales.value && stockSource.value === 'mine') {
      const res = await apiFetch(`/api/products/sales-stock?period=${selectedPeriod.value}`);
      mySalesStock.value = res.data || [];
      // Format sama dengan products agar komponen menampilkan nama, emoji, dll
      products.value = mySalesStock.value.map(s => ({
        id: s.product_id,
        name: s.product_name,
        category: s.category || 'Lainnya',
        price: s.price,
        stock: s.stock,
        diminta: s.diminta || 0,
        dikirim: s.dikirim || 0,
        laku: s.laku || 0,
        sisa_stok: s.sisa_stok !== undefined ? s.sisa_stok : s.stock,
        emoji: s.emoji || '📦',
        image: s.image || '',
        active: true,
        is_low_stock: (s.sisa_stok !== undefined ? s.sisa_stok : s.stock) <= 5
      }));
    } else {
      const res = await apiFetch('/api/products');
      products.value = res.data || [];
      // Jika sales membuka stok admin, preload juga stok sendiri untuk count badge
      if (isSales.value) {
        apiFetch('/api/products/sales-stock').then(r => { mySalesStock.value = r.data || []; }).catch(() => {});
      }
    }
  } catch (err) {
    appStore.showToast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}

function openAddStockModal(p) {
  adjustProduct.value = p;
  adjustReason.value = 'Masuk';
  adjustChange.value = null;
  adjustNote.value = 'Penambahan stok gudang';
}

function openAdjustModal(p) {
  adjustProduct.value = p;
  adjustReason.value = 'Koreksi';
  adjustChange.value = 0;
  adjustNote.value = '';
}

async function submitAdjust() {
  if (adjustFinalStock.value < 0) {
    appStore.showToast('Stok akhir tidak boleh negatif', 'warning');
    return;
  }

  const prodId = adjustProduct.value?.id;
  const changeVal = adjustChange.value;
  const reasonVal = adjustReason.value;
  const noteVal = adjustNote.value;

  // Optimistic stock update
  if (prodId) {
    const p = products.value.find(item => item.id === prodId);
    if (p) p.stock = (p.stock || 0) + changeVal;
  }

  adjustProduct.value = null;
  appStore.showToast('Stok berhasil diperbarui!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products/stock', {
      method: 'POST',
      body: JSON.stringify({
        product_id: prodId,
        change: changeVal,
        reason: reasonVal,
        note: noteVal
      })
    });
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

async function submitCreateProduct() {
  const payload = { ...newProd.value };

  // Optimistic add product
  const tempId = 'PRD-' + Date.now().toString(36);
  products.value.unshift({
    id: tempId,
    name: payload.name,
    category: payload.category,
    price: payload.price,
    cost_price: payload.cost_price,
    stock: payload.stock,
    emoji: payload.emoji,
    image: payload.image || '',
    active: true
  });

  showAddModal.value = false;
  newProd.value = { name: '', category: 'Frozen Food', price: 0, cost_price: 0, stock: 0, emoji: '📦', image: '' };
  appStore.showToast('Barang baru berhasil disimpan!', 'success');
  appStore.startSync();

  try {
    await apiFetch('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const res = await apiFetch('/api/products');
    if (res.data) products.value = res.data;
  } catch (err) {
    appStore.showToast(err.message, 'error');
    fetchProducts();
  } finally {
    appStore.finishSync();
  }
}

function isValidImage(img) {
  if (!img || typeof img !== 'string') return false;
  const s = img.trim();
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

function onImgError(product) {
  if (product) {
    product.image = '';
  }
}

onMounted(() => {
  fetchProducts();
});
</script>

<style scoped>
.stock-page {
  padding: 16px;
  padding-bottom: 90px;
}
.btn-send-stock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
}
.stock-period-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  overflow-x: auto;
}
.period-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #888);
}
.period-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e5e5e5);
  background: var(--bg-card, #fff);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #666);
  cursor: pointer;
}
.period-btn.active {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
}
.sales-stock-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px;
  margin-top: 8px;
  background: var(--bg-hover, #f8fafc);
  border-radius: 8px;
  border-top: 1px dashed var(--border-color, #e5e5e5);
}
.stat-pill-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stat-pill-label {
  font-size: 10px;
  color: var(--text-muted, #888);
  font-weight: 600;
  text-transform: uppercase;
}
.stat-pill-value {
  font-size: 13px;
  font-weight: 700;
}
.stat-pill-item.highlight .stat-pill-value {
  font-size: 14px;
}
.stock-source-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tab-btn-source {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border-color, #e5e5e5);
  background: var(--bg-card, #fff);
  color: var(--text-color, #333);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.tab-btn-source.active {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 2px 8px rgba(37, 99, 235, .25);
}
.tab-btn-source.btn-return-action {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  border-color: #fcd34d;
}
.tab-btn-source.btn-return-action:hover {
  background: rgba(245, 158, 11, 0.2);
}
.stock-header {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.search-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding-left: 36px !important;
  padding-right: 34px !important;
  height: 40px;
}
.search-clear-btn {
  position: absolute;
  right: 10px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.15s ease;
}
.search-clear-btn:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--danger, #ef4444);
}
.header-action-group {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-manage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-btn, 8px);
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-manage:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-nav-stock {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-main);
  text-decoration: none;
  font-size: 13px;
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-btn, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.btn-nav-stock:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--bg-hover, #f8fafc);
  transform: translateY(-1px);
}
.category-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 14px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.category-tabs::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.cat-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 12px;
  min-height: 34px;
  padding: 4px 10px;
  white-space: nowrap;
  border-radius: 8px;
}
.cat-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.stock-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}
.stock-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 14px);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.stock-card:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}
.card-low {
  border-left: 4px solid var(--danger);
}

/* Card Top Row */
.stock-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.stock-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.stock-emoji {
  font-size: 26px;
}
.stock-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}
.prod-name {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--text-main);
  line-height: 1.35;
  word-break: break-word;
}
.prod-cat {
  font-size: 11.5px;
  color: var(--text-muted);
}
.price-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.price-val {
  font-size: 14px;
  font-weight: 800;
  color: var(--primary);
}
.cost-price {
  font-size: 11px;
  color: var(--text-light);
}

/* Badge Stok Pill di kanan atas */
.stock-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}
.stock-pill-lbl {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.8;
}
.stock-pill-val {
  font-size: 16px;
  font-weight: 800;
}
.badge-safe {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid rgba(21, 128, 61, 0.2);
}
.badge-low {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.2);
}

/* Card Bottom Row: Action Buttons */
.stock-card-bottom {
  border-top: 1px dashed var(--border-color);
  padding-top: 12px;
}
.stock-actions-btn {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.stock-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.stock-btn:active {
  transform: scale(0.97);
}

/* + Stok Masuk */
.btn-add-stock {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
  border-color: rgba(22, 163, 74, 0.25);
}
.btn-add-stock:hover {
  background: #16a34a;
  color: #ffffff;
  border-color: #16a34a;
  box-shadow: 0 2px 6px rgba(22, 163, 74, 0.3);
}
[data-theme="dark"] .btn-add-stock {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.3);
}
[data-theme="dark"] .btn-add-stock:hover {
  background: #22c55e;
  color: #0f172a;
}

/* Edit Data */
.btn-edit {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.22);
}
.btn-edit:hover {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
}
[data-theme="dark"] .btn-edit {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}
[data-theme="dark"] .btn-edit:hover {
  background: #38bdf8;
  color: #0f172a;
}

/* Koreksi Stok */
.btn-adjust {
  background: var(--bg-app, #f8fafc);
  color: var(--text-main, #334155);
  border-color: var(--border-color, #e2e8f0);
}
.btn-adjust:hover {
  background: var(--bg-hover, #e2e8f0);
  border-color: #94a3b8;
  color: var(--text-main);
}
[data-theme="dark"] .btn-adjust {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
}
[data-theme="dark"] .btn-adjust:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

/* Sheet Modals */
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
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
}
.sheet-head {
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
.cur-stock-box {
  background: var(--bg-app);
  padding: 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
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

/* Image Thumbnail & Upload Styles */
.prod-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--bg-app);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}
.prod-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.image-upload-section {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: 10px;
  border: 1px dashed var(--border-color);
  margin-bottom: 4px;
}
.preview-box {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.uploaded-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-placeholder {
  font-size: 30px;
}
.upload-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.btn-upload-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  min-height: 36px;
  transition: opacity 0.15s ease;
}
.btn-upload-file:hover {
  opacity: 0.9;
}
.hidden-file-input {
  display: none;
}
.btn-remove-img {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  font-size: 11px;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 6px;
}
.input-disabled {
  background: var(--bg-app) !important;
  color: var(--text-muted) !important;
  cursor: not-allowed;
  opacity: 0.85;
  border-style: dashed !important;
  font-weight: 700;
}
.helper-note {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}
.helper-note strong {
  color: var(--primary);
}

@media (max-width: 640px) {
  .stock-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .search-input-wrapper {
    width: 100%;
  }
  .header-action-group {
    width: 100%;
  }
  .header-action-group .btn-manage {
    flex: 1.2;
    justify-content: center;
  }
  .header-action-group .btn-nav-stock {
    flex: 0.8;
    justify-content: center;
  }
  .stock-list {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .stock-card {
    padding: 14px;
    gap: 12px;
  }
  .stock-btn {
    padding: 0 6px;
    font-size: 11.5px;
    height: 32px;
  }
}

/* Pagination Bar (Konsisten dengan halaman lain) */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card, 12px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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

/* R1 Batch Send Stock Styles */
.batch-send-overlay {
  align-items: center !important;
  padding: 16px;
}
.batch-send-content {
  max-width: 720px;
  max-height: 92vh !important;
  display: flex;
  flex-direction: column;
  border-radius: 18px !important;
  overflow: hidden !important;
  padding: 0 !important;
}
.batch-send-content .sheet-head {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.batch-send-body {
  overflow-y: auto !important;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.sticky-sales-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-card, #fff);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sales-main-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--border-color, #cbd5e1);
  font-size: 14px;
  font-weight: 600;
  background: var(--bg-hover, #f8fafc);
  outline: none;
}
.sales-main-select:focus {
  border-color: #2563eb;
  background: #fff;
}
.sales-quick-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
}
.btn-auto-fill-req {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-auto-fill-req:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sales-unselected-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  padding: 30px 20px;
  border-radius: 12px;
  color: #64748b;
  text-align: center;
  justify-content: center;
}

.batch-send-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.batch-product-picker-section {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-hover, #f8fafc);
}
.picker-search-bar {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.picker-search-bar .search-ic {
  position: absolute;
  left: 10px;
  color: #94a3b8;
}
.picker-search-input {
  width: 100%;
  padding: 8px 30px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  background: #fff;
}
.btn-clear-sm {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 16px;
  color: #94a3b8;
  cursor: pointer;
}
.picker-cat-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-bottom: 10px;
  padding-bottom: 4px;
}
.picker-cat-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}
.picker-cat-btn.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.batch-prod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 2px;
}
.batch-prod-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 10px;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: all 0.15s ease;
}
.batch-prod-tile:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
}
.batch-prod-tile.is-selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.batch-prod-tile.is-requested {
  border-color: #f59e0b;
}
.batch-prod-tile.is-out-of-stock {
  opacity: 0.6;
}
.tile-name {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  margin-top: 4px;
  line-height: 1.2;
}
.tile-meta {
  font-size: 10.5px;
  color: #64748b;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tile-demand-tag {
  color: #b45309;
  font-weight: 700;
}
.tile-badge-qty {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #2563eb;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 800;
}

.batch-items-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.batch-items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.btn-clear-all-batch {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.batch-empty-box {
  padding: 24px;
  text-align: center;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  color: #94a3b8;
}
.batch-items-scroll-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}
.batch-item-card {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s ease;
}
.batch-item-card.has-error {
  border-color: #ef4444;
  background: #fffafa;
}
.batch-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-remove-batch-item {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}
.btn-remove-batch-item:hover {
  color: #ef4444;
}
.batch-item-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ref-pill {
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
}
.ref-pill.ref-warn {
  color: #dc2626;
  background: #fee2e2;
  font-weight: 700;
}
.batch-item-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.control-label {
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}
.batch-stepper {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.batch-stepper button {
  width: 28px;
  height: 28px;
  border: none;
  background: #f1f5f9;
  cursor: pointer;
  font-weight: 700;
}
.batch-qty-input {
  width: 50px;
  height: 28px;
  border: none;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
}
.btn-set-demand, .btn-set-max {
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  cursor: pointer;
}
.btn-set-demand {
  border-color: #fcd34d;
  background: #fffbeb;
  color: #b45309;
}
.item-row-error {
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  margin-top: 2px;
}

.batch-send-footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--bg-card, #fff);
  border-top: 1px solid var(--border-color, #e2e8f0);
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.batch-summary-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.summary-kinds {
  color: #64748b;
}
.summary-total-qty {
  font-size: 15px;
  color: #0f172a;
}
.batch-footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-submit-batch-send {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  font-weight: 700;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}
</style>
