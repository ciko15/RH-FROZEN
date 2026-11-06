import { authenticate } from '../../_lib/auth.js';
import { getTabsBatch } from '../../_lib/sheets.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const customerId = req.query.id;

    if (!customerId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Pelanggan wajib disertakan');
    }

    const tabs = await getTabsBatch(['Customers', 'Invoices', 'Payments', 'AuditLog', 'Users']);
    const customers = tabs.Customers || [];
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
      throw new ApiError(404, 'NOT_FOUND', 'Pelanggan tidak ditemukan');
    }

    // RBAC: Non-admin cek branch_id
    if (authUser.role !== 'admin' && authUser.branch_id && customer.branch_id && customer.branch_id !== authUser.branch_id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke pelanggan cabang lain');
    }

    const invoices = tabs.Invoices || [];
    const payments = tabs.Payments || [];
    const auditLogs = tabs.AuditLog || [];
    const users = tabs.Users || [];

    // 1. INVOICES / HUTANG
    const customerInvoices = invoices.filter(inv => inv.customer_id === customerId);
    const debts = customerInvoices.map(inv => {
      const totalDue = parseFloat(inv.total_due || 0);
      const remaining = parseFloat(inv.remaining !== undefined && inv.remaining !== '' ? inv.remaining : (inv.pay_method === 'Tempo' ? totalDue : 0));
      const paid = Math.max(0, totalDue - remaining);
      const isUnpaid = remaining > 0;

      // Hitung overdue jika ada due_date
      let isOverdue = false;
      let overdueDays = 0;
      if (inv.due_date && isUnpaid) {
        const due = new Date(inv.due_date);
        const now = new Date();
        const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
        if (diff > 0) {
          isOverdue = true;
          overdueDays = diff;
        }
      }

      return {
        id: inv.id,
        invoice_no: inv.invoice_no,
        date: `${inv.invoice_date || inv.tx_date || ''} ${inv.invoice_time || inv.tx_time || ''}`.trim(),
        due_date: inv.due_date || '',
        pay_method: inv.pay_method || 'Tempo',
        total_due: totalDue,
        paid_amount: paid,
        remaining: remaining,
        status: isUnpaid ? 'Belum Lunas' : 'Lunas',
        is_unpaid: isUnpaid,
        is_overdue: isOverdue,
        overdue_days: overdueDays,
        is_initial_balance: false,
        note: inv.note || ''
      };
    });

    // Cek jika ada saldo hutang pelanggan di tab Customers
    const customerBalance = parseFloat(customer.balance || 0);
    const totalRemainingFromInvoices = debts.reduce((sum, d) => sum + (d.remaining || 0), 0);

    // Jika customer memiliki saldo hutang (balance > 0) dan ada selisih dari invoice (misal saldo awal/inputan manual admin)
    if (customerBalance > 0 && customerBalance > totalRemainingFromInvoices) {
      const initialDebtAmount = customerBalance - totalRemainingFromInvoices;
      debts.unshift({
        id: `INIT-${customerId}`,
        invoice_no: 'SALDO-AWAL',
        title: 'Saldo Awal / Inputan Hutang Pelanggan',
        date: 'Saldo Berjalan',
        due_date: `${customer.term_days || 14} Hari`,
        pay_method: 'Tempo',
        total_due: initialDebtAmount,
        paid_amount: 0,
        remaining: initialDebtAmount,
        status: 'Belum Lunas',
        is_unpaid: true,
        is_overdue: false,
        overdue_days: 0,
        is_initial_balance: true,
        note: 'Inputan saldo hutang awal / penyesuaian saldo pelanggan dari admin'
      });
    }

    // Urutkan: YANG BELUM LUNAS POSISINYA DI ATAS, lalu tanggal terbaru
    debts.sort((a, b) => {
      if (a.is_unpaid && !b.is_unpaid) return -1;
      if (!a.is_unpaid && b.is_unpaid) return 1;
      if (a.is_initial_balance) return -1;
      if (b.is_initial_balance) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    // 2. PAYMENTS / PEMBAYARAN & PELUNASAN
    const customerPayments = payments
      .filter(p => p.customer_id === customerId || (p.invoice_id && customerInvoices.some(ci => ci.id === p.invoice_id)))
      .map(p => {
        const relatedInvoice = invoices.find(inv => inv.id === p.invoice_id);
        const creator = users.find(u => u.id === p.created_by);
        return {
          id: p.id,
          payment_date: p.payment_date || '',
          payment_time: p.payment_time || '',
          date: `${p.payment_date || ''} ${p.payment_time || ''}`.trim(),
          amount: parseFloat(p.amount || 0),
          method: p.method || 'Tunai',
          type: p.type || 'Pelunasan',
          invoice_id: p.invoice_id || '',
          invoice_no: relatedInvoice ? relatedInvoice.invoice_no : '',
          note: p.note || '',
          created_by_name: creator ? creator.full_name : (p.created_by || '-')
        };
      });

    customerPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 3. RIWAYAT PENYESUAIAN HUTANG / AUDIT PENYESUAIAN
    // Mencari entri audit log terkait customer ini
    const adjustments = [];
    auditLogs.forEach(log => {
      try {
        let detail = {};
        if (typeof log.detail_json === 'string') {
          detail = JSON.parse(log.detail_json);
        } else if (typeof log.detail_json === 'object') {
          detail = log.detail_json || {};
        }

        if (detail.id === customerId || detail.customer_id === customerId) {
          const user = users.find(u => u.id === log.user_id);
          adjustments.push({
            id: log.id,
            date_time: log.date_time,
            action: log.action,
            user_name: user ? user.full_name : log.user_id,
            old_balance: detail.old_balance !== undefined ? detail.old_balance : null,
            new_balance: detail.new_balance !== undefined ? detail.new_balance : (detail.balance !== undefined ? detail.balance : null),
            reason: detail.reason || detail.note || ''
          });
        }
      } catch (e) {}
    });

    // Jika ada saldo hutang berjalan namun belum ada catatan audit log spesifik, sertakan informasi saldo awal
    if (customerBalance > 0 && adjustments.length === 0) {
      adjustments.push({
        id: `ADJ-INIT-${customerId}`,
        date_time: 'Saldo Awal Sistem',
        action: 'SALDO_AWAL',
        user_name: 'Admin / Sistem',
        old_balance: 0,
        new_balance: customerBalance,
        reason: 'Pencatatan saldo hutang awal pelanggan dari database'
      });
    }

    adjustments.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));

    const salesUser = users.find(u => u.id === customer.sales_id);

    return res.status(200).json({
      ok: true,
      data: {
        customer: {
          ...customer,
          sales_name: salesUser ? salesUser.full_name : '-',
          balance: parseFloat(customer.balance || 0),
          credit_limit: parseFloat(customer.credit_limit || 0),
          term_days: parseInt(customer.term_days || 14, 10),
          active: String(customer.active).toUpperCase() === 'TRUE'
        },
        debts,
        payments: customerPayments,
        adjustments
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
