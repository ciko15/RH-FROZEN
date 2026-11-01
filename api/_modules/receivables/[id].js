import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow, deleteRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const editPaymentSchema = z.object({
  customer_id: z.string().optional(),
  payment_date: z.string().optional(),
  amount: z.coerce.number().positive('Jumlah pembayaran harus lebih dari 0'),
  method: z.enum(['Tunai', 'Transfer']).default('Tunai'),
  note: z.string().optional().default('')
});

const PAYMENT_HEADERS = ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by'];
const CUSTOMER_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const paymentId = req.query.id;

    if (!paymentId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Pembayaran wajib disertakan');
    }

    const tabs = await getTabsBatch(['Payments', 'Customers', 'Invoices'], true);
    const payments = tabs.Payments || [];
    const payment = payments.find(p => p.id === paymentId);

    if (!payment) {
      throw new ApiError(404, 'NOT_FOUND', 'Data pembayaran tidak ditemukan');
    }

    const customers = tabs.Customers || [];
    const customer = customers.find(c => c.id === payment.customer_id);

    // ==========================================
    // GET: Detail Pembayaran
    // ==========================================
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        data: {
          ...payment,
          customer_name: customer ? customer.name : (payment.note || 'Pelanggan'),
          customer_balance: customer ? parseFloat(customer.balance || 0) : 0
        }
      });
    }

    // ==========================================
    // PUT: Edit Pembayaran Pelunasan Piutang
    // (Bisa dilakukan oleh Sales terkait, Kasir, Manajer, Admin)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

      // Jika sales, hanya boleh mengedit jika ini pembayarannya atau pelanggan miliknya
      if (authUser.role === 'sales') {
        const isCreator = payment.created_by === authUser.id;
        const isCustSales = customer && customer.sales_id === authUser.id;
        if (!isCreator && !isCustSales) {
          throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses untuk mengedit pembayaran ini');
        }
      }

      const data = validateBody(editPaymentSchema, req.body);
      const oldAmount = parseFloat(payment.amount || 0);
      const newAmount = parseFloat(data.amount);
      const oldCustomerId = payment.customer_id;
      const targetCustomerId = data.customer_id || oldCustomerId;

      // Jika pelanggan diubah, kembalikan saldo pelanggan lama dan kurangi pelanggan baru
      if (data.customer_id && data.customer_id !== oldCustomerId) {
        const newCustomer = customers.find(c => c.id === targetCustomerId);
        if (!newCustomer) {
          throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan baru tidak ditemukan');
        }

        // Kembalikan saldo pelanggan lama
        if (customer && customer._rowIndex) {
          customer.balance = parseFloat(customer.balance || 0) + oldAmount;
          await updateRow('Customers', customer._rowIndex, customer, CUSTOMER_HEADERS);
        }

        // Kurangi saldo pelanggan baru
        if (newCustomer._rowIndex) {
          newCustomer.balance = parseFloat(newCustomer.balance || 0) - newAmount;
          await updateRow('Customers', newCustomer._rowIndex, newCustomer, CUSTOMER_HEADERS);
        }

        payment.customer_id = targetCustomerId;
      } else {
        // Pelanggan tetap sama: sesuaikan selisih nominal
        const diff = newAmount - oldAmount; // Jika bayar bertambah, sisa piutang berkurang
        if (customer && customer._rowIndex) {
          customer.balance = parseFloat(customer.balance || 0) - diff;
          await updateRow('Customers', customer._rowIndex, customer, CUSTOMER_HEADERS);
        }
      }

      // Update baris payment
      payment.amount = newAmount;
      payment.method = data.method;
      if (data.payment_date) payment.payment_date = data.payment_date;
      payment.note = data.note !== undefined ? data.note : payment.note;
      await updateRow('Payments', payment._rowIndex, payment, PAYMENT_HEADERS);

      await logAudit(authUser.id, 'EDIT_PAYMENT', {
        payment_id: payment.id,
        old_amount: oldAmount,
        new_amount: newAmount,
        old_customer_id: oldCustomerId,
        new_customer_id: payment.customer_id
      });

      return res.status(200).json({
        ok: true,
        data: payment,
        message: 'Pembayaran pelunasan berhasil diperbarui'
      });
    }

    // ==========================================
    // DELETE: Hapus Pembayaran Pelunasan Piutang
    // (HANYA BISA OLEH ADMIN / MANAJER)
    // ==========================================
    if (req.method === 'DELETE') {
      requireRole(authUser, ['admin', 'manajer']);

      const oldAmount = parseFloat(payment.amount || 0);

      // Kembalikan saldo hutang customer (karena pembayaran dihapus/dibatalkan)
      if (customer) {
        const currentBalance = parseFloat(customer.balance || 0);
        customer.balance = currentBalance + oldAmount;
        await updateRow('Customers', customer._rowIndex, customer, CUSTOMER_HEADERS);
      }

      // Hapus baris payment
      await deleteRow('Payments', payment._rowIndex, payment.id);

      await logAudit(authUser.id, 'DELETE_PAYMENT', {
        payment_id: payment.id,
        amount: oldAmount,
        customer_id: payment.customer_id
      });

      return res.status(200).json({
        ok: true,
        message: 'Pembayaran pelunasan berhasil dihapus dan saldo piutang telah dikembalikan'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
