import { authenticate } from './_lib/auth.js';
import { getTabsBatch } from './_lib/sheets.js';
import { sanitizeOutputForRole } from './_lib/rbac.js';
import { handleApiError } from './_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Invoices', 'Returns', 'Payments']);

    let invoices = tabs.Invoices || [];
    let returns = tabs.Returns || [];
    let payments = tabs.Payments || [];

    // RBAC
    if (authUser.role !== 'admin' && authUser.branch_id) {
      invoices = invoices.filter(i => i.branch_id === authUser.branch_id);
    }
    if (authUser.role === 'sales') {
      invoices = invoices.filter(i => i.sales_id === authUser.id);
      payments = payments.filter(p => p.created_by === authUser.id);
    }

    const historyItems = [];

    // Invoices
    invoices.forEach(inv => {
      historyItems.push({
        id: inv.id,
        type: 'Invoice',
        title: `Faktur #${inv.invoice_no}`,
        customer: inv.customer_name,
        date: `${inv.invoice_date} ${inv.invoice_time || ''}`,
        amount: parseFloat(inv.total_due || 0),
        status: parseFloat(inv.remaining || 0) <= 0 ? 'Lunas' : 'Belum Lunas'
      });
    });

    // Returns
    returns.forEach(r => {
      historyItems.push({
        id: r.id,
        type: 'Retur',
        title: `Retur #${r.return_no}`,
        customer: `Invoice Ref`,
        date: r.date,
        amount: -parseFloat(r.total || 0),
        status: 'Retur'
      });
    });

    // Payments Piutang
    payments.filter(p => p.type === 'Piutang').forEach(p => {
      historyItems.push({
        id: p.id,
        type: 'Pelunasan',
        title: `Pelunasan Piutang`,
        customer: p.note || 'Pelunasan',
        date: `${p.payment_date} ${p.payment_time || ''}`,
        amount: parseFloat(p.amount || 0),
        status: 'Masuk'
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
