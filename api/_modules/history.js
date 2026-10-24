import { authenticate } from './_lib/auth.js';
import { getTabsBatch } from './_lib/sheets.js';
import { sanitizeOutputForRole } from './_lib/rbac.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Invoices', 'Returns', 'Payments', 'Customers']);

    let invoices = tabs.Invoices || [];
    let returns = tabs.Returns || [];
    let payments = tabs.Payments || [];
    const customers = tabs.Customers || [];

    // RBAC
    if (authUser.role !== 'admin' && authUser.branch_id) {
      invoices = invoices.filter(i => i.branch_id === authUser.branch_id);
      payments = payments.filter(p => {
        const customer = customers.find(c => c.id === p.customer_id);
        return customer?.branch_id === authUser.branch_id;
      });
    }
    if (authUser.role === 'sales') {
      invoices = invoices.filter(i => i.sales_id === authUser.id);
      const myInvoiceIds = new Set(invoices.map(i => i.id));
      const customerIds = new Set(customers
        .filter(c => c.sales_id === authUser.id)
        .map(c => c.id));
      invoices.forEach(invoice => customerIds.add(invoice.customer_id));
      payments = payments.filter(p => p.created_by === authUser.id || customerIds.has(p.customer_id));
      // Filter returns: hanya yang terkait invoice milik sales ini
      returns = returns.filter(r => myInvoiceIds.has(r.invoice_id));
    }

    const historyItems = [];
    const validReturns = (tabs.Returns || []).filter(r => r.status !== 'Ditolak');

    // Invoices
    invoices.forEach(inv => {
      const invReturns = validReturns.filter(r => r.invoice_id === inv.id || r.ref_id === inv.id);
      historyItems.push({
        id: inv.id,
        type: 'Invoice',
        title: `Faktur #${inv.invoice_no}`,
        customer: inv.customer_name,
        date: `${inv.invoice_date || inv.tx_date || ''} ${inv.invoice_time || inv.tx_time || ''}`,
        amount: parseFloat(inv.total_due || 0),
        status: parseFloat(inv.remaining || 0) <= 0 ? 'Lunas' : 'Belum Lunas',
        has_return: invReturns.length > 0,
        return_count: invReturns.length
      });
    });

    // Returns
    returns.forEach(r => {
      const custName = customers.find(c => c.id === r.customer_id)?.name || r.customer_id || 'Pelanggan';
      const retDate = r.date || r.invoice_date || '';
      historyItems.push({
        id: r.id,
        type: 'Retur',
        title: `Retur #${r.return_no}`,
        customer: custName,
        date: retDate,
        amount: -parseFloat(r.total || 0),
        status: 'Retur'
      });
    });

    // Payments Pelunasan / Piutang
    payments.filter(p => p.type === 'Pelunasan' || p.type === 'Piutang').forEach(p => {
      historyItems.push({
        id: p.id,
        type: 'Pelunasan',
        title: `Pelunasan Piutang`,
        customer: customers.find(c => c.id === p.customer_id)?.name || p.note || 'Pelanggan',
        date: `${p.payment_date} ${p.payment_time || ''}`.trim(),
        amount: parseFloat(p.amount || 0),
        status: 'Masuk',
        method: p.method || ''
      });
    });

    // Urutkan waktu terbaru
    historyItems.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      ok: true,
      data: sanitizeOutputForRole(authUser.role, historyItems.slice(0, 50))
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
