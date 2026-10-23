import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const orderItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.number().int().positive('Qty harus berupa angka bulat positif'),
  discount: z.number().min(0, 'Diskon tidak boleh negatif').optional().default(0)
});

const createOrderSchema = z.object({
  customer_id: z.string().min(1, 'Pelanggan wajib dipilih'),
  branch_id: z.string().optional(),
  order_date: z.string().optional(),
  note: z.string().optional().default(''),
  client_key: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'Minimal pilih 1 barang'),
  approved_by: z.string().optional()
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Orders (dengan filter & pagination)
    // ==========================================
    if (req.method === 'GET') {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      const statusFilter = req.query.status; // Proses | Dikirim | Selesai
      const search = (req.query.search || '').toLowerCase().trim();

      const tabs = await getTabsBatch(['Orders', 'Customers', 'OrderItems', 'Users']);
      let orders = tabs.Orders || [];
      const customers = tabs.Customers || [];
      const orderItems = tabs.OrderItems || [];
      const users = tabs.Users || [];

      // RBAC Filter
      if (authUser.role !== 'admin' && authUser.branch_id) {
        orders = orders.filter(o => o.branch_id === authUser.branch_id);
      }
      if (authUser.role === 'sales') {
        orders = orders.filter(o => o.sales_id === authUser.id);
      }

      // Filter status
      if (statusFilter && statusFilter !== 'Semua') {
        orders = orders.filter(o => o.status === statusFilter);
      }

      // Map pelanggan & total belanja
      const enrichedOrders = orders.map(o => {
        const cust = customers.find(c => c.id === o.customer_id);
        const sales = users.find(u => u.id === o.sales_id);
        const items = orderItems.filter(oi => oi.order_id === o.id);

        const totalAmount = items.reduce((sum, it) => {
          const q = parseInt(it.qty, 10) || 0;
          const p = parseFloat(it.price) || 0;
          const d = parseFloat(it.discount || 0);
          return sum + (q * p - d);
        }, 0);

        const shortageTotal = items.reduce((sum, it) => sum + (parseInt(it.shortage, 10) || 0), 0);

        return {
          ...o,
          customer_name: cust ? cust.name : '-',
          sales_name: sales ? sales.full_name : '-',
          total_amount: totalAmount,
          items_count: items.length,
          shortage_total: shortageTotal,
          shortage_items: items.filter(it => (parseInt(it.shortage, 10) || 0) > 0).length
        };
      });

      // Filter search
      let filtered = enrichedOrders;
      if (search) {
        filtered = enrichedOrders.filter(o => 
          (o.order_no && o.order_no.toLowerCase().includes(search)) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(search))
        );
      }

      // Urutkan dari yang terbaru
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      const total = filtered.length;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);

      const sanitized = sanitizeOutputForRole(authUser.role, paginated);

      return res.status(200).json({
        ok: true,
        data: sanitized,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    // ==========================================
    // POST: Buat Order Baru
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);

      // Cek Idempotency-Key
      const idempotencyKey = req.headers['idempotency-key'] || req.body?.client_key;
      if (idempotencyKey) {
        const cachedRes = await checkIdempotency(idempotencyKey);
        if (cachedRes) {
          return res.status(200).json(cachedRes);
        }
      }

      const data = validateBody(createOrderSchema, req.body);
      const branchId = authUser.role === 'admin' ? (data.branch_id || authUser.branch_id || 'BR-SOLO') : authUser.branch_id;

      // Teruskan ke Google Apps Script (transaksi atomik ber-lock)
      const gasPayload = {
        customer_id: data.customer_id,
        order_date: data.order_date,
        items: data.items,
        sales_id: authUser.id,
        branch_id: branchId,
        note: data.note,
        client_key: idempotencyKey || data.client_key,
        approved_by: data.approved_by
      };

      const resultOrder = await callGas('createOrder', gasPayload);

      const responsePayload = {
        ok: true,
        data: sanitizeOutputForRole(authUser.role, resultOrder),
        message: 'Order berhasil dibuat'
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
