import { authenticate } from './_lib/auth.js';
import { getTabsBatch } from './_lib/sheets.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Orders', 'Invoices', 'Payments', 'OrderItems', 'SalesTargets']);

    const todayStr = new Date().toISOString().substring(0, 10);
    const branchId = authUser.branch_id;
    const isGlobal = authUser.role === 'admin';

    // 1. Filter Orders
    let orders = tabs.Orders || [];
    if (!isGlobal && branchId) {
      orders = orders.filter(o => o.branch_id === branchId);
    }
    if (authUser.role === 'sales') {
      orders = orders.filter(o => o.sales_id === authUser.id);
    }

    // Hari Ini
    const todayOrders = orders.filter(o => o.order_date === todayStr && o.status !== 'Dibatalkan');
    const todayOrderItems = (tabs.OrderItems || []).filter(oi => todayOrders.some(o => o.id === oi.order_id));
    const totalOrdersAmount = todayOrderItems.reduce((sum, it) => {
      const q = parseInt(it.qty, 10) || 0;
      const p = parseFloat(it.price) || 0;
      const d = parseFloat(it.discount || 0);
      return sum + (q * p - d);
    }, 0);

    // 2. Filter Invoices
    let invoices = tabs.Invoices || [];
    if (!isGlobal && branchId) {
      invoices = invoices.filter(inv => inv.branch_id === branchId);
    }
    if (authUser.role === 'sales') {
      invoices = invoices.filter(inv => inv.sales_id === authUser.id);
    }

    const todayInvoices = invoices.filter(inv => inv.invoice_date === todayStr);
    const totalSalesAmount = todayInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);

    // 3. Total Barang Dikirim Hari Ini (Orders Dikirim / Selesai)
    const shippedOrders = orders.filter(o => o.order_date === todayStr && (o.status === 'Dikirim' || o.status === 'Selesai'));
    const shippedItems = (tabs.OrderItems || []).filter(oi => shippedOrders.some(o => o.id === oi.order_id));
    const totalShippedQty = shippedItems.reduce((sum, it) => sum + (parseInt(it.qty, 10) || 0), 0);

    // 4. Kas Hari Ini (Pemasukan, Pengeluaran, Saldo Awal, Saldo Akhir)
    let payments = tabs.Payments || [];
    const todayPayments = payments.filter(p => p.payment_date === todayStr);
    const pemasukanHariIni = todayPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    
    // Total pembayaran sebelum hari ini untuk menghitung saldo berjalan
    const pastPayments = payments.filter(p => p.payment_date < todayStr);
    const totalPemasukanLalu = pastPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    
    // Pengeluaran operasional (default 0 atau jika ada tab pengeluaran)
    const pengeluaranHariIni = 0; 
    const saldoAwal = totalPemasukanLalu;
    const saldoAkhir = saldoAwal + pemasukanHariIni - pengeluaranHariIni;

    // 5. Pengiriman Hari Ini (Status Dikirim & Selesai)
    const pendingOrdersCount = orders.filter(o => o.status === 'Proses').length;
    const shippingOrdersCount = orders.filter(o => o.status === 'Dikirim').length;

    // 6. Grafik 7 Hari Terakhir
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().substring(0, 10);
      const dayInvoices = invoices.filter(inv => inv.invoice_date === dStr);
      const amount = dayInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
      
      const parts = dStr.split('-');
      const label = `${parts[2]}/${parts[1]}`;
      last7Days.push({ date: dStr, label, amount });
    }

    // 7. Target Bulanan Sales (jika sales)
    let salesTarget = null;
    if (authUser.role === 'sales') {
      const curMonth = todayStr.substring(0, 7);
      const targets = tabs.SalesTargets || [];
      const myTarget = targets.find(t => t.sales_id === authUser.id && t.month === curMonth);
      const targetAmount = myTarget ? parseFloat(myTarget.target) || 0 : 0;

      // Realisasi penjualan sales bulan ini
      const monthInvoices = invoices.filter(inv => inv.invoice_date.startsWith(curMonth));
      const achievedAmount = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
      const percent = targetAmount > 0 ? Math.min(Math.round((achievedAmount / targetAmount) * 100), 100) : 0;

      salesTarget = {
        month: curMonth,
        target: targetAmount,
        achieved: achievedAmount,
        percent
      };
    }

    return res.status(200).json({
      ok: true,
      data: {
        summary: {
          total_orders_amount: totalOrdersAmount,
          total_orders_count: todayOrders.length,
          pending_orders_count: pendingOrdersCount,
          shipping_orders_count: shippingOrdersCount,
          total_sales_amount: totalSalesAmount,
          total_invoices_count: todayInvoices.length,
          total_shipped_qty: totalShippedQty,
          total_payments_amount: pemasukanHariIni,
          // Kas Hari Ini (sesuai SOP Aplikasi.docx)
          kas: {
            saldo_awal: saldoAwal,
            pemasukan: pemasukanHariIni,
            pengeluaran: pengeluaranHariIni,
            saldo_akhir: saldoAkhir
          }
        },
        chart: last7Days,
        sales_target: salesTarget
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
