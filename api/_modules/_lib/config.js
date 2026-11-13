/**
 * Konfigurasi Default Alur Pesanan, Permintaan & Stok
 * Seluruh asumsi dipusatkan di sini agar mudah disesuaikan bila ada perubahan kebijakan.
 */
export const CR_CONFIG = {
  // 1. Stok yang dicek saat Jadikan Transaksi = stok milik sales (SalesStock)
  CHECK_SALES_STOCK: true,

  // 2. Stok kurang saat transaksi -> transaksi ditolak (tanpa partial)
  REJECT_ON_INSUFFICIENT_STOCK: true,

  // 3. Status pesanan setelah berhasil jadi transaksi kasir
  STATUS_TRANSACTED: 'Sudah Jadi Transaksi',

  // 4. Status pesanan awal saat dibuat oleh sales
  STATUS_INITIAL: 'Proses',

  // 5. Status pesanan saat dibatalkan / dihapus
  STATUS_CANCELLED: 'Dibatalkan',

  // 6. Stok gudang pusat (Products.stock) tidak boleh minus saat admin kirim stok
  ALLOW_NEGATIVE_ADMIN_STOCK: false,

  // 7. Nilai default nama pemesan untuk data lama / kosong
  DEFAULT_NAMA_PEMESAN: '-'
};
