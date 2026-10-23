import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const createInvoiceSchema = z.object({
  customer_id: z.string().min(1, 'Pelanggan wajib dipilih'),
  items: z.array(z.object({
    product_id: z.string().min(1),
    qty: z.coerce.number().int().positive('Qty harus positif'),
    price: z.coerce.number().min(0).optional(),
    discount: z.coerce.number().min(0).optional().default(0)
  })).min(1, 'Minimal 1 barang'),
  pay_method: z.enum(['Tunai', 'Transfer', 'Tempo'], { required_error: 'Metode pembayaran wajib dipilih' }),
  paid_amount: z.coerce.number().min(0, 'Jumlah bayar tidak boleh negatif').optional().default(0),
  note: z.string().optional().default(''),
  approved_by: z.string().optional(),
  client_key: z.string().optional()
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Invoice (Penjualan Selesai)
    // ==========================================
    if (req.method === 'GET') {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      const search = (req.query.search || '').toLowerCase().trim();

      const tabs = await getTabsBatch(['Invoices', 'Branches']);
      let invoices = tabs.Invoices || [];

      // RBAC
      if (authUser.role !== 'admin' && authUser.branch_id) {
        invoices = invoices.filter(inv => inv.branch_id === authUser.branch_id);
      }
      if (authUser.role === 'sales') {
        invoices = invoices.filter(inv => inv.sales_id === authUser.id);
      }

      if (search) {
        invoices = invoices.filter(inv =>
          (inv.invoice_no && inv.invoice_no.toLowerCase().includes(search)) ||
          (inv.customer_name && inv.customer_name.toLowerCase().includes(search))
        );
      }

      invoices.sort((a, b) => new Date(`${b.invoice_date} ${b.invoice_time || '00:00:00'}`) - new Date(`${a.invoice_date} ${a.invoice_time || '00:00:00'}`));

      const total = invoices.length;
      const startIndex = (page - 1) * limit;
      const paginated = invoices.slice(startIndex, startIndex + limit);

      return res.status(200).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, paginated),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    // ==========================================
    // POST: Simpan Pembayaran & Buat Invoice
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cachedRes = await checkIdempotency(idempotencyKey);
        if (cachedRes) {
          return res.status(200).json(cachedRes);
        }
      }

      const data = validateBody(createInvoiceSchema, req.body);

      // Teruskan ke Google Apps Script (transaksi atomik ber-lock)
      const gasPayload = {
        customer_id: data.customer_id,
        items: data.items,
        pay_method: data.pay_method,
        paid_amount: data.paid_amount,
        note: data.note,
        user_id: authUser.id,
        branch_id: authUser.branch_id || '',
        approved_by: data.approved_by,
        client_key: data.client_key || idempotencyKey || ''
      };

      const resultInvoice = await callGas('createSalesTx', gasPayload);

      const responsePayload = {
        ok: true,
        data: sanitizeOutputForRole(authUser.role, resultInvoice),
        message: 'Pembayaran berhasil disimpan dan invoice diterbitkan'
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
