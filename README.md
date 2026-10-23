# Sales Terpadu - RH Frozen Food
Aplikasi Mobile-Web Progressive Web App (PWA) untuk manajemen pesanan, penjualan, kasir, invoice dengan piutang bertingkat, retur, stok barang, pembelian, laporan laba kotor, dan mode offline order untuk sales lapangan.

---

## 1. Arsitektur & Teknologi

- **Front-end**: Vue 3 (Composition API, `<script setup>`), Vite, Vue Router, Pinia, `vite-plugin-pwa`, `idb` (IndexedDB).
- **Styling**: Vanilla CSS Mobile-First dengan CSS Variables (`--primary`, Safe-Area Inset, dark/light theme, max-width 480px di tengah layar).
- **Back-end Serverless**: Node.js 20 ESM di Vercel (`/api`). Library: `googleapis` (Sheets API v4), `bcryptjs`, `jsonwebtoken`, `zod`, `cookie`.
- **Database Utama**: 1 Google Spreadsheet (`SPREADSHEET_ID: 1nq3PVJm0--u34XKWS4KzOchVPmXbQPcdW5EJzXWTF9Y`).
- **Google Apps Script Web App**: Menangani seluruh penulisan transaksi atomik dengan `LockService.getScriptLock().waitLock(20000)`, generator PDF, dan trigger backup harian ke Google Drive.
- **PWA**: Mode offline order, service worker caching app shell, instalasi layar utama (A2HS di Android & Safari iPhone).

---

## 2. Struktur Peran & Hak Akses (RBAC)

| Fitur / Menu | Admin | Manajer | Sales | Kasir |
| :--- | :---: | :---: | :---: | :---: |
| Dashboard & Ringkasan | Semua Cabang | Cabang Sendiri | Milik Sendiri | Cabang Sendiri |
| Buat Order (Online / Offline) | Ya | Ya | Ya (Milik Sendiri) | Tidak |
| Tandai Dikirim & Batalkan Order | Ya | Ya | Tidak | Tidak |
| Proses Pembayaran & Invoice | Ya | Ya | Ya (Order Sendiri) | Ya |
| Retur Penjualan | Ya | Ya | Tidak | Ya |
| Terima Pelunasan Piutang | Ya | Ya | Tidak | Ya |
| Stok & Penyesuaian | Ya | Ya | Hanya Lihat Stok | Hanya Lihat Stok |
| Harga Beli (HPP) & Laba Kotor | **Terlihat** | **Terlihat** | **Disensor Server** | **Disensor Server** |
| Kelola Pelanggan & Harga Khusus | Ya | Ya (Cabang) | Tidak | Tidak |
| Kelola Cabang & Pengaturan Usaha | Ya | Tidak | Tidak | Tidak |
| Manajemen User & Audit Log | Ya | Tidak | Tidak | Tidak |

---

## 3. Panduan Setup Lengkap

### Langkah 1: Google Spreadsheet & Service Account
1. Buka spreadsheet database: [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1nq3PVJm0--u34XKWS4KzOchVPmXbQPcdW5EJzXWTF9Y/edit)
2. Buka Google Cloud Console, buat project baru dan aktifkan **Google Sheets API**.
3. Buat **Service Account**, buat kunci baru berformat **JSON**.
4. Bagikan (Share) Google Spreadsheet ke email service account tersebut dengan peran **Editor**.

### Langkah 2: Deploy Google Apps Script Web App
1. Di Google Spreadsheet, buka **Extensions > Apps Script**.
2. Salin seluruh isi file [apps-script/kode.gs](file:///Users/ahqmb-tt017/Development/RH%20FROZEN/apps-script/kode.gs) ke editor Apps Script.
3. Buka **Project Settings (ikon gerigi ⚙️)** di panel kiri, gulir ke bagian **Script Properties**, klik **Add script property**:
   - Property: `APP_SECRET`
   - Value: String rahasia yang sama dengan `APPS_SCRIPT_SECRET` di `.env`.
4. Jalankan fungsi `setupDatabase()` sekali untuk membuat seluruh tab, kolom header, validasi data, dan data awal produk serta cabang.
5. Jalankan fungsi `installTriggers()` sekali untuk memasang backup otomatis harian ke Google Drive setiap pukul 01:00 WIB.
6. Klik tombol biru **Deploy > New Deployment**:
   - Pilih jenis: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Salin URL Web App yang dihasilkan.

### Langkah 3: Konfigurasi Lingkungan (`.env`)
Buat file `.env` di root direktori:
```env
SPREADSHEET_ID=1nq3PVJm0--u34XKWS4KzOchVPmXbQPcdW5EJzXWTF9Y
GOOGLE_SERVICE_ACCOUNT_EMAIL=email-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=rh_frozen_secret_app_key_2026_secure
JWT_SECRET=rh_frozen_jwt_secret_key_production_2026_super_secure

NODE_ENV=development
```

### Langkah 4: Pembuatan Akun Administrator Pertama
Jalankan perintah berikut di terminal:
```bash
npm run create-admin
```
Masukkan username, nama lengkap, dan password admin awal (minimal 8 karakter huruf & angka). Akun admin pertama akan otomatis dibuat di tab `Users` dengan hash bcrypt (cost 10) dan flag `must_change_password = true`.

---

## 4. Cara Menjalankan Aplikasi

### Menjalankan Secara Lokal (Development)
1. Jalankan server frontend:
```bash
npm run dev
```
2. Aplikasi dapat diakses di:
👉 **http://localhost:9000/**

### Menjalankan / Deploy ke Vercel (Produksi)
1. Push repositori ke GitHub / GitLab.
2. Buka dashboard Vercel, pilih **Import Project**.
3. Masukkan seluruh variabel lingkungan dari `.env` ke bagian **Environment Variables** di Vercel.
4. Klik **Deploy**. Vercel akan otomatis menyediakan HTTPS gratis (wajib untuk fitur PWA & Service Worker).

---

## 5. Cara Memasang Aplikasi di HP (PWA)

### Android (Google Chrome):
1. Buka URL aplikasi di Google Chrome.
2. Ketuk ikon titik tiga di pojok kanan atas, lalu pilih **"Tambahkan ke Layar Utama"** atau **"Instal Aplikasi"**.
3. Ikon RH Frozen Food akan muncul di menu aplikasi HP dan dapat dibuka layar penuh tanpa bilah browser.

### iPhone (Apple Safari):
1. Buka URL aplikasi di browser Safari.
2. Ketuk tombol **Bagikan (Share)** (ikon kotak berpanah ke atas di bagian bawah).
3. Gulir ke bawah dan ketuk **"Tambah ke Layar Utama" (Add to Home Screen)**.
4. Aplikasi siap dibuka dari layar beranda iPhone.

---

## 6. Batasan Sistem Google Sheets

Google Sheets API v4 sangat efisien untuk skala UKM:
- **Kapasitas**: Cocok untuk puluhan pengguna aktif dan hingga ribuan transaksi per bulan.
- **Kuota Google API**: Sekitar 60 request baca per menit per user (dioptimalkan dengan cache memori 10 detik dan `batchGet` di backend).
- **Rekomendasi Skalabilitas**: Jika transaksi telah melampaui 10.000 order per bulan, disarankan untuk migrasi database ke PostgreSQL / MySQL dengan tetap mempertahankan antarmuka Vue PWA yang sama.
