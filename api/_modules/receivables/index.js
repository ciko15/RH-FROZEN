import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const receivePaymentSchema = z.object({
  customer_id: z.string().min(1, 'Pelanggan wajib dipilih'),
  amount: z.number().positive('Jumlah pelunasan harus lebih dari 0'),
  method: z.enum(['Tunai', 'Transfer']).default('Tunai'),
  note: z.string().optional().default('Pelunasan Piutang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Pelanggan yang Memiliki Piutang
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Customers', 'Invoices', 'Orders']);
      let customers = tabs.Customers || [];
      const invoices = tabs.Invoices || [];
      const orders = tabs.Orders || [];

      // RBAC
      if (authUser.role !== 'admin' && authUser.branch_id) {
        customers = customers.filter(c => c.branch_id === authUser.branch_id);
      }
      if (authUser.role === 'sales') {
        customers = customers.filter(c => {
          if (c.sales_id) return c.sales_id === authUser.id;
          return orders.some(o => o.customer_id === c.id && o.sales_id === authUser.id);
        });
      }

      // Filter hanya pelanggan dengan saldo piutang > 0
      const debtors = customers
        .filter(c => parseFloat(c.balance || 0) > 0)
        .map(c => {
          const custInvoices = invoices.filter(inv => inv.customer_id === c.id && parseFloat(inv.remaining || 0) > 0);
          
          // Hitung umur piutang & jatuh tempo
          const now = new Date();
          let maxOverdueDays = 0;
          let hasOverdue = false;

          custInvoices.forEach(inv => {
            if (inv.due_date) {
              const due = new Date(inv.due_date);
              const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
              if (diffDays > 0) {
                hasOverdue = true;
                if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
              }
            }
          });

          return {
            ...c,
            balance: parseFloat(c.balance),
            credit_limit: parseFloat(c.credit_limit || 0),
            has_overdue: hasOverdue,
            overdue_days: maxOverdueDays
          };
        });

      // Urutkan saldo piutang terbesar di atas
      debtors.sort((a, b) => b.balance - a.balance);

      const totalReceivables = debtors.reduce((sum, d) => sum + d.balance, 0);

      return res.status(200).json({
        ok: true,
        data: {
          total_receivables: totalReceivables,
          debtors
        }
      });
    }

    // ==========================================
    // POST: Terima Pelunasan Piutang
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await checkIdempotency(idempotencyKey);
        if (cached) return res.status(200).json(cached);
      }

      const data = validateBody(receivePaymentSchema, req.body);

      const result = await callGas('receivePayment', {
        customer_id: data.customer_id,
        amount: data.amount,
        method: data.method,
        note: data.note,
        user_id: authUser.id
      });

      const responsePayload = {
        ok: true,
        data: result,
        message: 'Pelunasan piutang berhasil disimpan'
      };

      if (idempotencyKey) {
        await saveIdempotency(idempotencyKey, responsePayload);
      }

      return res.status(201).json(responsePayload);
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
