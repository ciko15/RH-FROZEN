import { getTabRows, updateRow, appendRow, deleteRow } from '../api/_modules/_lib/sheets.js';
import { clearCache } from '../api/_modules/_lib/cache.js';

async function reconcileData() {
  console.log('=== MEMULAI REKONSILIASI DATA LAMA RH FROZEN ===\n');

  const [salesStock, orders, orderItems, invoices, invoiceItems, customers, products] = await Promise.all([
    getTabRows('SalesStock', true),
    getTabRows('Orders', true),
    getTabRows('OrderItems', true),
    getTabRows('Invoices', true),
    getTabRows('InvoiceItems', true),
    getTabRows('Customers', true),
    getTabRows('Products', true)
  ]);

  // 1. REKONSILIASI TRANSAKSI ALIFIA (CUST-070)
  console.log('1. Memproses transaksi Alifia (Mandiraja)...');
  const alifiaCust = customers.find(c => c.id === 'CUST-070' || c.name.toLowerCase().includes('alifia'));
  const inv5 = invoices.find(i => i.invoice_no === 'INV-BR-MANDIRAJA-20261110-005');
  const inv6 = invoices.find(i => i.invoice_no === 'INV-BR-MANDIRAJA-20261110-006');

  if (inv5 && inv5._rowIndex) {
    console.log(`- Menghapus invoice gantung #${inv5.invoice_no} (Row ${inv5._rowIndex})...`);
    await deleteRow('Invoices', inv5._rowIndex, inv5.id);
  }

  if (inv6 && inv6._rowIndex) {
    console.log(`- Mengupdate invoice final #${inv6.invoice_no} (Row ${inv6._rowIndex}) previous_balance ke 2550000...`);
    inv6.previous_balance = 2550000;
    const INVOICE_HEADERS = ['id', 'invoice_no', 'tx_date', 'tx_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by'];
    await updateRow('Invoices', inv6._rowIndex, inv6, INVOICE_HEADERS);
  }

  if (alifiaCust && alifiaCust._rowIndex) {
    const correctBalance = 2550000 + 267600; // 2817600
    console.log(`- Mengoreksi saldo pelanggan Alifia dari ${alifiaCust.balance} menjadi ${correctBalance}...`);
    alifiaCust.balance = correctBalance;
    const CUSTOMER_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
    await updateRow('Customers', alifiaCust._rowIndex, alifiaCust, CUSTOMER_HEADERS);
  }

  // 2. REKONSILIASI STOK SALES
  console.log('\n2. Memproses rekonsiliasi stok seluruh sales...');
  const shippedOrders = orders.filter(o => ['Dikirim', 'Selesai'].includes(o.status));
  const stockIn = {};
  shippedOrders.forEach(o => {
    const items = orderItems.filter(oi => oi.order_id === o.id);
    items.forEach(it => {
      const key = `${o.sales_id}:${it.product_id}`;
      const qty = parseInt(it.qty_shipped || it.qty, 10) || 0;
      stockIn[key] = (stockIn[key] || 0) + qty;
    });
  });

  // Karena inv5 sudah dihapus, hitung barang keluar tanpa inv5
  const activeInvoices = invoices.filter(i => i.id !== inv5?.id);
  const stockOut = {};
  activeInvoices.forEach(inv => {
    const items = invoiceItems.filter(ii => ii.invoice_id === inv.id && !ii.name.includes('(Dihapus)'));
    items.forEach(it => {
      const key = `${inv.sales_id}:${it.product_id}`;
      const qty = parseFloat(it.qty || 0);
      stockOut[key] = (stockOut[key] || 0) + qty;
    });
  });

  const SALES_STOCK_HEADERS = ['sales_id', 'product_id', 'stock', 'updated_at'];
  const nowIso = new Date().toISOString();

  // Pastikan Chic Nuget Mandiraja (USR-SLS-MDR : p35) tepat 24
  const mdrChicKey = 'USR-SLS-MDR:p35';
  if (!stockIn[mdrChicKey]) {
    stockIn[mdrChicKey] = 48; // Order STK 48
  }

  let updatedCount = 0;
  for (const [key, inQty] of Object.entries(stockIn)) {
    const [salesId, pId] = key.split(':');
    const outQty = stockOut[key] || 0;
    const theoreticalStock = Math.max(0, inQty - outQty);

    const ss = salesStock.find(s => s.sales_id === salesId && s.product_id === pId);
    const currentStock = ss ? parseFloat(ss.stock || 0) : 0;

    if (theoreticalStock !== currentStock) {
      const prodName = products.find(p => p.id === pId)?.name || pId;
      console.log(`- Update Stok [${salesId}] ${prodName}: dari ${currentStock} -> ${theoreticalStock}`);
      if (ss && ss._rowIndex) {
        ss.stock = theoreticalStock;
        ss.updated_at = nowIso;
        await updateRow('SalesStock', ss._rowIndex, ss, SALES_STOCK_HEADERS);
      } else {
        await appendRow('SalesStock', {
          sales_id: salesId,
          product_id: pId,
          stock: theoreticalStock,
          updated_at: nowIso
        }, SALES_STOCK_HEADERS);
      }
      updatedCount++;
      // Berikan jeda 1.2 detik agar GAS tidak throttling
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  clearCache();
  console.log(`\n=== REKONSILIASI SELESAI. Total ${updatedCount} baris stok diperbarui ===`);
}

reconcileData().catch(err => {
  console.error('Rekonsiliasi gagal:', err);
  process.exit(1);
});
