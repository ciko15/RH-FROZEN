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

    // Ambil semua retur yang valid (tidak ditolak)
    const validReturns = returns.filter(r => r.status !== 'Ditolak');
    const periodInvoiceIds = new Set(periodInvoices.map(inv => inv.id));
    const allReturnItems = tabs.ReturnItems || [];

    // Map retur per invoice ID untuk satu sumber kebenaran (menghindari duplikasi)
    const returnsByInvoiceId = new Map();
    validReturns.forEach(r => {
      const targetInvId = r.ref_id || r.invoice_id;
      if (!targetInvId) return;
      if (!returnsByInvoiceId.has(targetInvId)) {
        returnsByInvoiceId.set(targetInvId, []);
      }
      returnsByInvoiceId.get(targetInvId).push(r);
    });

    // Hitung metrik keuangan per invoice periode ini
    let totalGrossSales = 0;
    let totalReturnVal = 0;
    let totalCashReceived = 0;
    let totalCashRefund = 0;
    let totalPeriodDebt = 0;

    periodInvoices.forEach(inv => {
      const invTotal = parseFloat(inv.subtotal || inv.total_due || 0);
      const paid = parseFloat(inv.paid_amount || 0);
      totalGrossSales += invTotal;
      totalCashReceived += paid;

      // Ambil retur milik invoice ini
      const invReturns = returnsByInvoiceId.get(inv.id) || [];
      const invReturnAmount = invReturns.reduce((sum, r) => {
        const directTotal = parseFloat(r.total || 0);
        if (directTotal > 0) return sum + directTotal;
        const itemsTot = allReturnItems
          .filter(ri => ri.return_id === r.id)
          .reduce((s, it) => s + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);
        return sum + itemsTot;
      }, 0);

      totalReturnVal += invReturnAmount;

      // Rumus keuangan baku:
      // tagihan_bersih = total_invoice - nilai_retur
      // refund_tunai   = MAX(0, total_bayar - tagihan_bersih)
      // sisa_hutang    = MAX(0, tagihan_bersih - total_bayar)
      const tagihanBersih = Math.max(0, invTotal - invReturnAmount);
      const refundTunai = Math.max(0, paid - tagihanBersih);
      const sisaHutang = Math.max(0, tagihanBersih - paid);

      totalCashRefund += refundTunai;
      totalPeriodDebt += sisaHutang;

      // Simpan atribut terhitung di objek invoice agar konsisten untuk CSV & rincian
      inv.calculated_return = invReturnAmount;
      inv.calculated_net_due = tagihanBersih;
      inv.calculated_refund = refundTunai;
      inv.calculated_remaining = sisaHutang;
      inv.calculated_net_cash = paid - refundTunai;
    });

    // 1. Total Penjualan Kotor & Penjualan Bersih (Setelah Retur)
    const grossSales = totalGrossSales;
    const totalReturnAmount = totalReturnVal;
    const netSales = Math.max(0, grossSales - totalReturnAmount);

    // 2. Jumlah Transaksi Faktur (Periode Ini)
    const totalOrdersCount = periodInvoices.length;

    // 3. Pembayaran Masuk Bersih (Diterima dikurangi Refund Tunai Retur)
    const totalPaymentsIn = totalCashReceived;
    const totalRefunds = totalCashRefund;
    const netPayments = Math.max(0, totalPaymentsIn - totalRefunds);

    // 4. Total Piutang Pelanggan (Saldo Berjalan) & Hutang Periode Ini
    const totalReceivables = customers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);
    const periodDebtAmount = totalPeriodDebt;

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

      // Hitung dari invoice milik sales ini (sumber kebenaran tunggal)
      const userGrossOmset = userInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal || inv.total_due) || 0), 0);
      const userReturnAmount = userInvoices.reduce((sum, inv) => sum + (inv.calculated_return || 0), 0);
      const userOmsetBersih = Math.max(0, userGrossOmset - userReturnAmount);
      const userCashReceived = userInvoices.reduce((sum, inv) => sum + (parseFloat(inv.paid_amount) || 0), 0);
      const userCashRefund = userInvoices.reduce((sum, inv) => sum + (inv.calculated_refund || 0), 0);
      const userNetCash = Math.max(0, userCashReceived - userCashRefund);
      const userRemainingBon = userInvoices.reduce((sum, inv) => sum + (inv.calculated_remaining || 0), 0);

      // Pelunasan bon lama terpisah via Payments (jika ada)
      const userDirectPayments = periodPayments.filter(p =>
        (p.created_by === salesUser.id || invoiceIds.has(p.invoice_id)) && (p.type === 'Piutang' || p.type === 'Pelunasan')
      );
      const standaloneDebtAmount = userDirectPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      const totalFaktur = userInvoices.length;
      const fakturLunas = userInvoices.filter(inv => (inv.calculated_remaining || 0) <= 0).length;

      return {
        sales_id: salesUser.id,
        sales_name: salesUser.full_name || salesUser.username,
        username: salesUser.username,
        branch_id: salesUser.branch_id,
        total_invoices: totalFaktur,
        invoices_lunas: fakturLunas,
        total_omset: userOmsetBersih,
        gross_omset: userGrossOmset,
        return_amount: userReturnAmount,
        cash_received: userCashReceived,
        invoice_paid: userCashReceived,
        debt_paid: standaloneDebtAmount,
        refund_amount: userCashRefund,
        net_cash: userNetCash + standaloneDebtAmount,
        remaining_bon: userRemainingBon
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
          total_receivables: totalReceivables,
          period_debt: periodDebtAmount
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
