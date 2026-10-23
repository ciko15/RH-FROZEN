import { authenticate } from '../_lib/auth.js';
import { sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const invoiceId = req.query.id;

    if (!invoiceId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Invoice wajib disertakan');
    }

    const tabs = await getTabsBatch(['Invoices', 'OrderItems', 'Config', 'Branches', 'Users', 'Customers', 'Returns', 'ReturnItems']);
    const invoices = tabs.Invoices || [];
    const invoice = invoices.find(inv => inv.id === invoiceId);

    if (!invoice) {
      throw new ApiError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');
    }

    // RBAC
    if (authUser.role !== 'admin' && authUser.branch_id && invoice.branch_id !== authUser.branch_id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki hak akses untuk invoice cabang ini');
    }
    if (authUser.role === 'sales' && invoice.sales_id !== authUser.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat melihat invoice milik Anda sendiri');
    }

    const orderItems = (tabs.OrderItems || []).filter(oi => oi.order_id === invoice.order_id);
    const configs = tabs.Config || [];
    const getCfg = k => (configs.find(c => c.key === k)?.value) || '';

    const branch = (tabs.Branches || []).find(b => b.id === invoice.branch_id);
    const sales = (tabs.Users || []).find(u => u.id === invoice.sales_id);
    const customer = (tabs.Customers || []).find(c => c.id === invoice.customer_id);

    // Ambil riwayat retur untuk invoice ini jika ada
    const invoiceReturns = (tabs.Returns || []).filter(r => r.invoice_id === invoice.id);
    const allReturnItems = tabs.ReturnItems || [];
    const enrichedReturns = invoiceReturns.map(r => {
      const items = allReturnItems.filter(ri => ri.return_id === r.id);
      return {
        ...r,
        total: parseFloat(r.total || 0),
        items: items.map(it => ({
          ...it,
          qty: parseInt(it.qty, 10),
          price: parseFloat(it.price)
        }))
      };
    });
    const totalReturnedAmount = enrichedReturns.reduce((sum, r) => sum + r.total, 0);

    const rawTotalDue = parseFloat(invoice.total_due || 0);
    const rawPaid = parseFloat(invoice.paid_amount || 0);
    const adjustedTotalDue = Math.max(0, rawTotalDue - totalReturnedAmount);
    const adjustedRemaining = Math.max(0, adjustedTotalDue - rawPaid);

    const fullInvoice = {
      ...invoice,
      customer_phone: customer ? customer.phone : '',
      customer_address: customer ? customer.address : (invoice.customer_address || ''),
      returns: enrichedReturns,
      total_returned_amount: totalReturnedAmount,
      adjusted_total_due: adjustedTotalDue,
      remaining: adjustedRemaining,
      config: {
        business_name: getCfg('business_name') || 'RH FROZEN FOOD',
        business_address: getCfg('business_address') || '',
        business_phone: getCfg('business_phone') || '',
        invoice_footer: getCfg('invoice_footer') || ''
      },
      branch_paper_width: branch ? branch.paper_width : 58,
      sales_name: sales ? sales.full_name : '-',
      items: orderItems.map(it => ({
        ...it,
        line_total: (parseInt(it.qty, 10) * parseFloat(it.price)) - parseFloat(it.discount || 0)
      }))
    };

    return res.status(200).json({
      ok: true,
      data: sanitizeOutputForRole(authUser.role, fullInvoice)
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
