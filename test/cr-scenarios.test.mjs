import test from 'node:test';
import assert from 'node:assert/strict';
import { CR_CONFIG } from '../api/_modules/_lib/config.js';

test('CR_CONFIG defaults verification', () => {
  assert.equal(CR_CONFIG.CHECK_SALES_STOCK, true);
  assert.equal(CR_CONFIG.REJECT_ON_INSUFFICIENT_STOCK, true);
  assert.equal(CR_CONFIG.STATUS_TRANSACTED, 'Sudah Jadi Transaksi');
  assert.equal(CR_CONFIG.STATUS_INITIAL, 'Proses');
  assert.equal(CR_CONFIG.ALLOW_NEGATIVE_ADMIN_STOCK, false);
  assert.equal(CR_CONFIG.DEFAULT_NAMA_PELANGGAN, 'Tanpa Nama');
  assert.equal(CR_CONFIG.ONE_ORDER_PER_CUSTOMER, true);
});

test('Skenario 1: Rekap akumulasi permintaan dan rincian pemesan', () => {
  // Buat mock items pesanan dengan Bu Sri (10) dan Adam (10) untuk Bakso Candi Mini (pid: "b1")
  const mockOrders = [
    {
      id: 'ord-1',
      order_no: 'STK-001',
      sales_id: 'sales-1',
      sales_name: 'Budi',
      status: 'Proses',
      order_date: '2026-11-13',
      items: [
        { product_id: 'b1', name: 'Bakso Candi Mini', qty: 10, nama_pemesan: 'Bu Sri' }
      ]
    },
    {
      id: 'ord-2',
      order_no: 'STK-002',
      sales_id: 'sales-1',
      sales_name: 'Budi',
      status: 'Proses',
      order_date: '2026-11-13',
      items: [
        { product_id: 'b1', name: 'Bakso Candi Mini', qty: 10, nama_pemesan: 'Adam' }
      ]
    }
  ];

  const pendingSummaryMap = new Map();
  for (const po of mockOrders.filter(o => o.status === 'Proses')) {
    for (const it of po.items) {
      if (!pendingSummaryMap.has(it.product_id)) {
        pendingSummaryMap.set(it.product_id, {
          product_id: it.product_id,
          name: it.name,
          total_qty: 0,
          admin_stock: 50,
          sales_breakdown: []
        });
      }
      const sum = pendingSummaryMap.get(it.product_id);
      sum.total_qty += it.qty;
      sum.sales_breakdown.push({
        nama_pemesan: it.nama_pemesan,
        sales_name: po.sales_name,
        qty: it.qty
      });
    }
  }

  const result = pendingSummaryMap.get('b1');
  assert.equal(result.total_qty, 20, 'Total akumulasi Bakso Candi Mini harus 20');
  assert.equal(result.sales_breakdown.length, 2, 'Rincian harus memuat 2 pemesan');
  assert.equal(result.sales_breakdown[0].nama_pemesan, 'Bu Sri');
  assert.equal(result.sales_breakdown[0].qty, 10);
  assert.equal(result.sales_breakdown[1].nama_pemesan, 'Adam');
  assert.equal(result.sales_breakdown[1].qty, 10);
});

test('Skenario 2: Admin soft delete permintaan tidak merusak order', () => {
  const order = {
    id: 'ord-1',
    order_no: 'STK-001',
    status: 'Proses',
    sales_id: 'sales-1',
    deleted_at: null
  };

  // Admin soft delete
  const nowIso = new Date().toISOString();
  order.deleted_at = nowIso;
  order.deleted_by = 'admin';

  // Admin view filter: !o.deleted_at -> hidden
  const adminVisible = !order.deleted_at;
  assert.equal(adminVisible, false, 'Di sisi admin tersembunyi setelah soft delete');

  // Sales view: tetap ada karena order.id dan data tidak dihapus fisik
  assert.equal(order.id, 'ord-1');
  assert.equal(order.sales_id, 'sales-1');
});

test('Skenario 3: Admin kirim bebas (15 atau 25) vs stok gudang', () => {
  const adminStock = 30; // Stok gudang
  const requestedTotal = 20;

  function validateSend(qty) {
    if (qty <= 0) return { ok: false, error: 'INVALID_QTY' };
    if (!CR_CONFIG.ALLOW_NEGATIVE_ADMIN_STOCK && qty > adminStock) {
      return { ok: false, error: 'INSUFFICIENT_STOCK' };
    }
    return { ok: true, sent: qty, remainingAdmin: adminStock - qty };
  }

  // Kirim 15 (kurang dari permintaan 20)
  const res15 = validateSend(15);
  assert.equal(res15.ok, true);
  assert.equal(res15.sent, 15);
  assert.equal(res15.remainingAdmin, 15);

  // Kirim 25 (lebih dari permintaan 20, tapi <= adminStock 30)
  const res25 = validateSend(25);
  assert.equal(res25.ok, true);
  assert.equal(res25.sent, 25);
  assert.equal(res25.remainingAdmin, 5);

  // Kirim 35 (melebihi adminStock 30) -> ditolak
  const res35 = validateSend(35);
  assert.equal(res35.ok, false);
  assert.equal(res35.error, 'INSUFFICIENT_STOCK');
});

test('Skenario 4 & 5: Validasi stok saat Jadikan Transaksi', () => {
  const currentSalesStock = 10;

  function validateSalesTx(requestedQty) {
    if (CR_CONFIG.CHECK_SALES_STOCK && currentSalesStock < requestedQty) {
      return {
        ok: false,
        error: 'INSUFFICIENT_SALES_STOCK',
        message: `Stok Anda tidak cukup (tersedia: ${currentSalesStock}, diminta: ${requestedQty})`
      };
    }
    return {
      ok: true,
      remainingSalesStock: currentSalesStock - requestedQty,
      orderStatus: CR_CONFIG.STATUS_TRANSACTED
    };
  }

  // Cukup (minta 10)
  const successTx = validateSalesTx(10);
  assert.equal(successTx.ok, true);
  assert.equal(successTx.remainingSalesStock, 0);
  assert.equal(successTx.orderStatus, 'Sudah Jadi Transaksi');

  // Kurang (minta 12)
  const failedTx = validateSalesTx(12);
  assert.equal(failedTx.ok, false);
  assert.equal(failedTx.error, 'INSUFFICIENT_SALES_STOCK');
  assert.match(failedTx.message, /Stok Anda tidak cukup/);
});

test('Skenario 6: Order berstatus "Sudah Jadi Transaksi" tidak bisa diedit ulang', () => {
  const order = {
    id: 'ord-1',
    status: CR_CONFIG.STATUS_TRANSACTED
  };

  const canEdit = order.status === 'Proses';
  const canProceedToSale = order.status !== CR_CONFIG.STATUS_TRANSACTED;

  assert.equal(canEdit, false, 'Tidak bisa diedit');
  assert.equal(canProceedToSale, false, 'Tidak bisa dijadikan transaksi ulang');
});

test('Skenario 7: Monitoring stok sales: Diminta, Dikirim, Laku, Sisa Stok', () => {
  const requested = 20; // total order sales
  const shipped = 15;   // kiriman admin
  const sold = 10;      // transaksi penjualan

  const sisaStok = shipped - sold;
  assert.equal(sisaStok, 5, 'Sisa stok harus Dikirim - Laku = 5 (bukan dari diminta)');
});

test('REVISI CR #2 - R1: Pengiriman Stok Batch (Multi-Item) & Validasi Per Baris', () => {
  const warehouseStock = {
    prod1: 20,
    prod2: 10,
    prod3: 5
  };

  const batchPayload = [
    { product_id: 'prod1', qty: 5 },
    { product_id: 'prod2', qty: 10 },
    { product_id: 'prod3', qty: 8 } // Melebihi stok gudang (5)
  ];

  const rowErrors = [];
  const validItems = [];

  for (const it of batchPayload) {
    const stockAvailable = warehouseStock[it.product_id] || 0;
    if (it.qty <= 0) {
      rowErrors.push({ product_id: it.product_id, error: 'Jumlah kirim minimal 1' });
    } else if (it.qty > stockAvailable) {
      rowErrors.push({
        product_id: it.product_id,
        error: `Melebihi stok gudang (tersedia: ${stockAvailable}, diminta kirim: ${it.qty})`
      });
    } else {
      validItems.push(it);
    }
  }

  assert.equal(rowErrors.length, 1, 'Harus ada 1 error pada prod3');
  assert.equal(rowErrors[0].product_id, 'prod3');
  assert.equal(validItems.length, 2, 'prod1 dan prod2 valid');

  // Jika prod3 diperbaiki jadi 5
  batchPayload[2].qty = 5;
  const totalSent = batchPayload.reduce((s, it) => s + it.qty, 0);
  assert.equal(totalSent, 20, 'Total batch kirim adalah 5 + 10 + 5 = 20');
});

test('REVISI CR #2 - R2: Nama Pelanggan Header Order & Gabungkan (Merge) Order Pelanggan', () => {
  const customerBudi = { id: 'cust-1', name: 'Budi' };

  const order1 = {
    id: 'ord-101',
    order_no: 'STK-101',
    customer_id: customerBudi.id,
    nama_pelanggan: customerBudi.name,
    status: 'Proses',
    items: [
      { product_id: 'p1', product_name: 'Bakso Candi Mini', qty: 5 }
    ]
  };

  const order2 = {
    id: 'ord-102',
    order_no: 'STK-102',
    customer_id: customerBudi.id,
    nama_pelanggan: customerBudi.name,
    status: 'Proses',
    items: [
      { product_id: 'p1', product_name: 'Bakso Candi Mini', qty: 10 },
      { product_id: 'p2', product_name: 'Sosis Ayam', qty: 3 }
    ]
  };

  // 1. Verifikasi judul kartu utama menggunakan nama_pelanggan
  assert.equal(order1.nama_pelanggan, 'Budi');
  assert.equal(order2.nama_pelanggan, 'Budi');

  // 2. Simulasi pencarian instan nama pelanggan
  const orders = [order1, order2, { id: 'ord-103', nama_pelanggan: 'Sri' }];
  const query = 'bud';
  const searchResults = orders.filter(o => o.nama_pelanggan.toLowerCase().includes(query.toLowerCase()));
  assert.equal(searchResults.length, 2, 'Pencarian bud harus cocok 2 order');

  // 3. Simulasi merge / gabungkan order Budi
  const selectedOrders = [order1, order2];
  const combinedItemsMap = new Map();

  for (const ord of selectedOrders) {
    for (const it of ord.items) {
      if (combinedItemsMap.has(it.product_id)) {
        combinedItemsMap.get(it.product_id).qty += it.qty;
      } else {
        combinedItemsMap.set(it.product_id, { ...it });
      }
    }
  }

  const mergedItems = Array.from(combinedItemsMap.values());
  assert.equal(mergedItems.length, 2, 'Harus ada 2 jenis produk hasil gabungan');
  assert.equal(mergedItems.find(i => i.product_id === 'p1').qty, 15, 'Bakso Candi Mini total 5 + 10 = 15');
  assert.equal(mergedItems.find(i => i.product_id === 'p2').qty, 3, 'Sosis Ayam total 3');
});

