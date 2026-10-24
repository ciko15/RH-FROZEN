import { authenticate } from './_lib/auth.js';
import { sanitizeOutputForRole } from './_lib/rbac.js';
import { getTabsBatch } from './_lib/sheets.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Invoices', 'InvoiceItems', 'OrderItems', 'Orders', 'Payments', 'Customers', 'Config', 'Returns']);

    const period = req.query.period || 'Bulanan'; // Harian | Mingguan | Bulanan
    const filterDate = req.query.date || new Date().toISOString().substring(0, 10);
    const branchFilter = req.query.branch_id;
    const salesFilter = req.query.sales_id;

    let invoices = tabs.Invoices || [];
    let orders = tabs.Orders || [];
    let payments = tabs.Payments || [];
    let returns = tabs.Returns || [];
    let customers = tabs.Customers || [];
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

    // 1. Total Penjualan Periode
    const totalSales = periodInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
    // 2. Order Masuk
    const totalOrdersCount = periodOrders.length;
    // 3. Pembayaran Masuk (Hanya Pemasukan / Pelunasan, bukan Pengeluaran)
    const totalPayments = periodPayments
      .filter(p => p.type !== 'Pengeluaran')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    // 4. Total Piutang Pelanggan
    const totalReceivables = customers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);

    // 5. Pelanggan Terbanyak Belanja (Top 3)
    const customerSpendMap = {};
    periodInvoices.forEach(inv => {
      const name = inv.customer_name || 'Pelanggan';
      customerSpendMap[name] = (customerSpendMap[name] || 0) + (parseFloat(inv.subtotal) || 0);
    });
    const topCustomers = Object.entries(customerSpendMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // 6. Laba Kotor (Hanya untuk Admin dan Manajer)
    let grossProfitData = null;
    if (authUser.role === 'admin' || authUser.role === 'manajer') {
      const invoiceItems = tabs.InvoiceItems || [];
      const periodInvoiceIds = new Set(periodInvoices.map(inv => inv.id));
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

      const periodReturns = returns.filter(r => periodInvoices.some(inv => inv.id === r.invoice_id));
      const totalReturns = periodReturns.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
      const grossProfit = totalSales - totalHpp - totalReturns;

      grossProfitData = {
        total_sales: totalSales,
        total_hpp: totalHpp,
        total_returns: totalReturns,
        gross_profit: grossProfit,
        margin_percent: totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0'
      };
    }

    // 7. Komisi Sales
    const paidInvoices = periodInvoices.filter(inv => parseFloat(inv.remaining || 0) <= 0);
    const paidSalesTotal = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
    const estimatedCommission = (paidSalesTotal * commissionPercent) / 100;

    return res.status(200).json({
      ok: true,
      data: {
        summary: {
          total_sales: totalSales,
          total_orders: totalOrdersCount,
          total_payments: totalPayments,
          total_receivables: totalReceivables
        },
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
