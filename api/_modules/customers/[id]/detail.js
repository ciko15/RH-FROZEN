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
    const customerBalance = parseFloat(customer.balance || 0);
    const customerInvoices = invoices.filter(inv => inv.customer_id === customerId);
    const debts = customerInvoices.map(inv => {
      // Nilai belanja murni invoice
      const invoiceSubtotal = parseFloat(inv.subtotal || 0) || (parseFloat(inv.total_due || 0) - parseFloat(inv.previous_balance || 0));
      const paid = parseFloat(inv.paid_amount || 0);

      // Hitung sisa hutang murni dari invoice ini saja:
      const pureRemaining = Math.max(0, invoiceSubtotal - paid);
      const isUnpaid = pureRemaining > 0;

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
        total_due: invoiceSubtotal, // Nilai belanja faktur ini saja
        paid_amount: paid,
        remaining: pureRemaining, // Sisa hutang murni dari transaksi ini saja
        status: isUnpaid ? 'Belum Lunas' : 'Lunas',
        is_unpaid: isUnpaid,
        is_overdue: isOverdue,
        overdue_days: overdueDays,
        is_initial_balance: false,
        note: inv.note || ''
      };
    });

    // Cek jika ada saldo hutang awal atau pembayaran langsung (Pelunasan Piutang)
    const totalRemainingFromInvoices = debts.reduce((sum, d) => sum + (d.remaining || 0), 0);

    // Hitung seluruh pembayaran piutang langsung (tanpa invoice_id) untuk customer ini
    const directPayments = payments.filter(p => p.customer_id === customerId && !p.invoice_id);
    const totalDirectPaid = directPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // Sisa hutang saldo awal / bon lama yang belum terbayar
    const remainingInitial = Math.max(0, customerBalance - totalRemainingFromInvoices);

    // Total nominal hutang saldo awal sebelum dicicil langsung
    const rawInitialDebt = remainingInitial + totalDirectPaid;

    if (rawInitialDebt > 0 || totalDirectPaid > 0 || remainingInitial > 0) {
      const isInitialUnpaid = remainingInitial > 0;
      const initialPaid = Math.min(rawInitialDebt, totalDirectPaid);

      debts.unshift({
        id: `INIT-${customerId}`,
        invoice_no: 'SALDO-AWAL',
        title: 'Saldo Awal / Inputan Hutang Pelanggan',
        date: 'Saldo Berjalan',
        due_date: `${customer.term_days || 14} Hari`,
        pay_method: 'Tempo',
        total_due: rawInitialDebt > 0 ? rawInitialDebt : initialPaid,
        paid_amount: initialPaid,
        remaining: remainingInitial,
        status: isInitialUnpaid ? (initialPaid > 0 ? 'Sebagian' : 'Belum Lunas') : 'Lunas',
        is_unpaid: isInitialUnpaid,
        is_overdue: false,
        overdue_days: 0,
        is_initial_balance: true,
        note: isInitialUnpaid
          ? (initialPaid > 0 ? `Sudah dicicil Rp ${initialPaid.toLocaleString('id-ID')}, sisa hutang Rp ${remainingInitial.toLocaleString('id-ID')}` : 'Inputan saldo hutang awal dari admin')
          : `Sudah lunas dibayarkan (Total lunas: Rp ${initialPaid.toLocaleString('id-ID')})`
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
    // Mencari entri audit log terkait penyesuaian saldo / edit hutang customer ini
    const adjustments = [];
    auditLogs.forEach(log => {
      try {
        let detail = {};
        if (typeof log.detail_json === 'string') {
          detail = JSON.parse(log.detail_json);
        } else if (typeof log.detail_json === 'object') {
          detail = log.detail_json || {};
        }

        // Cek kecocokan customer
        const isMatch = detail.id === customerId || detail.customer_id === customerId;
        if (!isMatch) return;

        // Hanya masukkan log yang relevan dengan saldo hutang atau update customer
        const isBalanceAdj = log.action === 'ADJUST_CUSTOMER_BALANCE' || detail.old_balance !== undefined || detail.new_balance !== undefined;
        const isCustomerUpdate = log.action === 'UPDATE_CUSTOMER';

        if (isBalanceAdj || isCustomerUpdate) {
          const user = users.find(u => u.id === log.user_id);
          
          let oldBal = detail.old_balance !== undefined ? detail.old_balance : null;
          let newBal = detail.new_balance !== undefined ? detail.new_balance : (detail.balance !== undefined ? detail.balance : null);
          let actionLabel = log.action;

          if (isBalanceAdj || (oldBal !== null && newBal !== null)) {
            actionLabel = 'Penyesuaian Saldo';
          } else if (isCustomerUpdate) {
            actionLabel = 'Pembaruan Data Pelanggan';
          }

          adjustments.push({
            id: log.id,
            date_time: log.date_time,
            action: actionLabel,
            user_name: user ? user.full_name : (log.user_id || 'Admin'),
            old_balance: oldBal,
            new_balance: newBal,
            reason: detail.reason || detail.note || (isBalanceAdj ? 'Penyesuaian saldo hutang' : 'Pembaruan profil / data pelanggan')
          });
        }
      } catch (e) {}
    });

    // Jika ada saldo hutang awal atau belum ada log penyesuaian saldo, tambahkan entri saldo awal
    if (customerBalance > 0 && !adjustments.some(a => a.action === 'Penyesuaian Saldo' || a.action === 'SALDO_AWAL')) {
      adjustments.push({
        id: `ADJ-INIT-${customerId}`,
        date_time: 'Saldo Awal Sistem',
        action: 'Saldo Awal Terdaftar',
        user_name: 'Admin / Sistem',
        old_balance: 0,
        new_balance: customerBalance,
        reason: 'Pencatatan saldo hutang awal pelanggan di database'
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
