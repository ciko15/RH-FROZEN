import { authenticate } from './_lib/auth.js';
import { sanitizeOutputForRole } from './_lib/rbac.js';
import { getTabsBatch } from './_lib/sheets.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Invoices', 'InvoiceItems', 'OrderItems', 'Orders', 'Payments', 'Customers', 'Config', 'Returns', 'ReturnItems', 'Users']);

    const period = req.query.period || 'Bulanan'; // Harian | Mingguan | Bulanan
    const filterDate = req.query.date || new Date().toISOString().substring(0, 10);
    const branchFilter = req.query.branch_id;
    const salesFilter = req.query.sales_id;

    let invoices = tabs.Invoices || [];
    let orders = tabs.Orders || [];
    let payments = tabs.Payments || [];
    let returns = tabs.Returns || [];
    const returnItems = tabs.ReturnItems || [];
    let customers = tabs.Customers || [];
    const users = tabs.Users || [];
    const configs = tabs.Config || [];
    const commissionPercent = parseFloat(configs.find(c => c.key === 'commission_percent')?.value || '0');

    // Filter Cabang
    if (authUser.role !== 'admin' && authUser.branch_id) {
      invoices = invoices.filter(inv => inv.branch_id === authUser.branch_id);
      orders = orders.filter(o => o.branch_id === authUser.branch_id);
      customers = customers.filter(c => c.branch_id === authUser.branch_id);
    } else if (branchFilter && branchFilter !== 'Semua') {
      invoices = invoices.filter(inv => inv.branch_id === branchFilter);
      orders = orders.filter(o => o.branch_id === branchFilter);
      customers = customers.filter(c => c.branch_id === branchFilter);
    }

    // Filter Sales
    if (authUser.role === 'sales') {
      invoices = invoices.filter(inv => inv.sales_id === authUser.id);
      orders = orders.filter(o => o.sales_id === authUser.id);
      customers = customers.filter(c => c.sales_id === authUser.id);
      const myInvoiceIds = new Set(invoices.map(inv => inv.id));
      payments = payments.filter(p => myInvoiceIds.has(p.invoice_id) || p.created_by === authUser.id);
      returns = returns.filter(r => myInvoiceIds.has(r.invoice_id));
    } else if (salesFilter && salesFilter !== 'Semua') {
      invoices = invoices.filter(inv => inv.sales_id === salesFilter);
      orders = orders.filter(o => o.sales_id === salesFilter);
      customers = customers.filter(c => c.sales_id === salesFilter);
      const filteredInvoiceIds = new Set(invoices.map(inv => inv.id));
      payments = payments.filter(p => filteredInvoiceIds.has(p.invoice_id));
    }

    // Filter Periode Tanggal
    let periodInvoices = [];
    let periodOrders = [];
    let periodPayments = [];

    if (period === 'Harian') {
      periodInvoices = invoices.filter(inv => (inv.invoice_date || inv.tx_date) === filterDate);
      periodOrders = orders.filter(o => o.order_date === filterDate);
      periodPayments = payments.filter(p => p.payment_date === filterDate);
    } else if (period === 'Mingguan') {
      // 7 hari berakhir pada filterDate
      const endDate = new Date(filterDate);
      const startDate = new Date(endDate.getTime() - (6 * 24 * 60 * 60 * 1000));
      const sStr = startDate.toISOString().substring(0, 10);

      periodInvoices = invoices.filter(inv => {
        const invoiceDate = inv.invoice_date || inv.tx_date || '';
        return invoiceDate >= sStr && invoiceDate <= filterDate;
      });
      periodOrders = orders.filter(o => o.order_date >= sStr && o.order_date <= filterDate);
      periodPayments = payments.filter(p => p.payment_date >= sStr && p.payment_date <= filterDate);
    } else {
      // Bulanan (yyyy-mm)
      const monthPrefix = filterDate.substring(0, 7);
      periodInvoices = invoices.filter(inv => (inv.invoice_date || inv.tx_date || '').startsWith(monthPrefix));
      periodOrders = orders.filter(o => o.order_date && o.order_date.startsWith(monthPrefix));
      periodPayments = payments.filter(p => p.payment_date && p.payment_date.startsWith(monthPrefix));
    }

    // Ambil semua retur yang terkait dengan invoice periode ini
    const validReturns = returns.filter(r => r.status !== 'Ditolak');
    const periodInvoiceIds = new Set(periodInvoices.map(inv => inv.id));
    const periodReturns = validReturns.filter(r =>
      periodInvoiceIds.has(r.invoice_id) || periodInvoiceIds.has(r.ref_id)
    );

    // Hitung total nilai retur periode ini
    const totalReturnAmount = periodReturns.reduce((sum, r) => {
      const directTotal = parseFloat(r.total || 0);
      if (directTotal > 0) return sum + directTotal;
      const itemsTot = returnItems
        .filter(ri => ri.return_id === r.id)
        .reduce((s, it) => s + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);
      return sum + itemsTot;
    }, 0);

    // 1. Total Penjualan Kotor & Penjualan Bersih (Setelah Retur)
    const grossSales = periodInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal || inv.total_due) || 0), 0);
    const netSales = Math.max(0, grossSales - totalReturnAmount);

    // 2. Order Masuk
    const totalOrdersCount = periodOrders.length;
    // 3. Pembayaran Masuk Bersih (Pemasukan / Pelunasan dikurangi Pengembalian Uang Tunai Retur)
    const totalPaymentsIn = periodPayments
      .filter(p => p.type !== 'Pengeluaran')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalRefunds = periodPayments
      .filter(p => p.type === 'Pengeluaran')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const netPayments = Math.max(0, totalPaymentsIn - totalRefunds);

    // 4. Total Piutang Pelanggan
    const totalReceivables = customers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);

    // 5. Pelanggan Terbanyak Belanja (Top 3)
    const customerSpendMap = {};
    periodInvoices.forEach(inv => {
      const name = inv.customer_name || 'Pelanggan';
      customerSpendMap[name] = (customerSpendMap[name] || 0) + (parseFloat(inv.subtotal || inv.total_due) || 0);
    });
    const topCustomers = Object.entries(customerSpendMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // 6. Laba Kotor (Hanya untuk Admin dan Manajer)
    let grossProfitData = null;
    if (authUser.role === 'admin' || authUser.role === 'manajer') {
      const invoiceItems = tabs.InvoiceItems || [];
      const periodInvoiceItems = invoiceItems.filter(item => periodInvoiceIds.has(item.invoice_id));
      const invoicesWithItems = new Set(periodInvoiceItems.map(item => item.invoice_id));
      const orderIdsWithoutInvoiceItems = new Set(periodInvoices
        .filter(inv => !invoicesWithItems.has(inv.id) && inv.order_id)
        .map(inv => inv.order_id));
      const periodOrderItems = [
        ...periodInvoiceItems,
        ...(tabs.OrderItems || []).filter(item => orderIdsWithoutInvoiceItems.has(item.order_id))
      ];

      const totalHpp = periodOrderItems.reduce((sum, item) => {
        const q = parseInt(item.qty, 10) || 0;
        const c = parseFloat(item.cost_price) || 0;
        return sum + (q * c);
      }, 0);

      const grossProfit = netSales - totalHpp;

      grossProfitData = {
        total_sales: grossSales,
        net_sales: netSales,
        total_hpp: totalHpp,
        total_returns: totalReturnAmount,
        gross_profit: grossProfit,
        margin_percent: netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : '0'
      };
    }

    // 7. Komisi Sales
    const paidInvoices = periodInvoices.filter(inv => parseFloat(inv.remaining || 0) <= 0);
    const paidSalesTotal = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal || inv.total_due) || 0), 0);
    const estimatedCommission = (paidSalesTotal * commissionPercent) / 100;

    // 8. Rekap Uang Diterima & Penjualan Per Sales (Harian / Periode Terpilih)
    // Ambil daftar user berrole sales
    const allSalesUsers = users.filter(u => u.role === 'sales' && String(u.active).toUpperCase() !== 'FALSE');
    const salesPerformance = allSalesUsers.map(salesUser => {
      // Invoices milik sales ini di periode terpilih
      const userInvoices = periodInvoices.filter(inv => inv.sales_id === salesUser.id);
      const invoiceIds = new Set(userInvoices.map(inv => inv.id));

      // Pembayaran uang masuk untuk sales ini di periode terpilih (baik dari faktur langsung maupun bayar piutang/bon)
      const userPayments = periodPayments.filter(p =>
        (p.created_by === salesUser.id || invoiceIds.has(p.invoice_id)) && p.type !== 'Pengeluaran'
      );
      const userRefunds = periodPayments.filter(p =>
        (p.created_by === salesUser.id || invoiceIds.has(p.invoice_id)) && p.type === 'Pengeluaran'
      );

      // Rincian penerimaan uang:
      // Uang yang dibayar langsung saat faktur terbit:
      // Faktur bisa memuat pembayaran barang hari ini + pelunasan bon sebelumnya (previous_balance).
      let directItemCash = 0; // Uang belanja barang hari ini
      let invoiceDebtPaid = 0; // Uang bon lama yang ikut dibayar di kasir faktur hari ini

      userInvoices.forEach(inv => {
        const paid = parseFloat(inv.paid_amount || 0);
        const subtotal = parseFloat(inv.subtotal || 0);
        const prevBal = parseFloat(inv.previous_balance || 0);
        if (paid > 0) {
          // Bagian untuk belanja barang hari ini (maksimal subtotal)
          const forItems = Math.min(paid, subtotal);
          directItemCash += forItems;
          // Sisanya adalah pelunasan bon lama
          const forPrevBal = Math.max(0, paid - subtotal);
          invoiceDebtPaid += forPrevBal;
        }
      });

      // Penagihan piutang / cicilan bon yang dibayar terpisah lewat form 'Terima Pembayaran'
      const standaloneDebtPayments = userPayments.filter(p => p.type === 'Piutang' || p.type === 'Pelunasan');
      const standaloneDebtAmount = standaloneDebtPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      // Total pelunasan bon lama yang diterima hari ini
      const totalDebtCollected = invoiceDebtPaid + standaloneDebtAmount;

      // Nilai retur invoice milik sales ini
      const userReturns = periodReturns.filter(r => invoiceIds.has(r.invoice_id) || invoiceIds.has(r.ref_id));
      const userReturnAmount = userReturns.reduce((sum, r) => {
        const directTotal = parseFloat(r.total || 0);
        if (directTotal > 0) return sum + directTotal;
        const itemsTot = returnItems
          .filter(ri => ri.return_id === r.id)
          .reduce((s, it) => s + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);
        return sum + itemsTot;
      }, 0);

      const totalFaktur = userInvoices.length;
      const totalOmsetKotor = userInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal || inv.total_due) || 0), 0);
      const totalOmsetBersih = Math.max(0, totalOmsetKotor - userReturnAmount);
      const totalUangMasuk = userPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalUangRetur = userRefunds.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const uangBersih = Math.max(0, totalUangMasuk - totalUangRetur);

      // Sisa piutang/bon invoice periode ini
      const sisaBon = userInvoices.reduce((sum, inv) => sum + (parseFloat(inv.remaining) || 0), 0);

      // Jumlah faktur lunas
      const fakturLunas = userInvoices.filter(inv => parseFloat(inv.remaining || 0) <= 0).length;

      return {
        sales_id: salesUser.id,
        sales_name: salesUser.full_name || salesUser.username,
        username: salesUser.username,
        branch_id: salesUser.branch_id,
        total_invoices: totalFaktur,
        invoices_lunas: fakturLunas,
        total_omset: totalOmsetBersih,
        gross_omset: totalOmsetKotor,
        return_amount: userReturnAmount,
        cash_received: totalUangMasuk,
        invoice_paid: directItemCash,
        debt_paid: totalDebtCollected,
        refund_amount: totalUangRetur,
        net_cash: uangBersih,
        remaining_bon: sisaBon
      };
    }).sort((a, b) => b.net_cash - a.net_cash);

    // Daftar sales untuk opsi dropdown filter
    const salesOptions = allSalesUsers.map(u => ({
      id: u.id,
      name: u.full_name || u.username
    }));

    return res.status(200).json({
      ok: true,
      data: {
        summary: {
          total_sales: netSales,
          gross_sales: grossSales,
          total_returns: totalReturnAmount,
          total_orders: totalOrdersCount,
          total_payments: netPayments,
          gross_payments: totalPaymentsIn,
          total_refunds: totalRefunds,
          total_receivables: totalReceivables
        },
        sales_performance: salesPerformance,
        sales_options: salesOptions,
        top_customers: topCustomers,
        gross_profit: grossProfitData,
        commission: {
          percent: commissionPercent,
          paid_sales: paidSalesTotal,
          estimated_amount: estimatedCommission
        },
        invoices: sanitizeOutputForRole(authUser.role, periodInvoices)
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
