import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const editOrderSchema = z.object({
  note: z.string().optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional()
});

const ORDER_HEADERS = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
const CUST_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const orderId = req.query.id;

    if (!orderId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Order wajib disertakan');
    }

    const tabs = await getTabsBatch(['Orders', 'OrderItems', 'Customers', 'Users', 'Products']);
    const orders = tabs.Orders || [];
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new ApiError(404, 'NOT_FOUND', 'Order tidak ditemukan');
    }

    // ==========================================
    // GET: Detail Order
    // ==========================================
    if (req.method === 'GET') {
      // RBAC: Cek akses cabang atau sales
      if (authUser.role !== 'admin' && authUser.branch_id && order.branch_id !== authUser.branch_id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki hak akses untuk order cabang ini');
      }
      if (authUser.role === 'sales' && order.sales_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat melihat order milik Anda sendiri');
      }

      const items = (tabs.OrderItems || []).filter(oi => oi.order_id === orderId);
      const customer = (tabs.Customers || []).find(c => c.id === order.customer_id);
      const sales = (tabs.Users || []).find(u => u.id === order.sales_id);

      const enriched = {
        ...order,
        customer,
        customer_phone: customer ? customer.phone : '',
        sales_name: sales ? sales.full_name : '-',
        items: items.map(it => {
          const prod = (tabs.Products || []).find(p => p.id === it.product_id);
          return {
            ...it,
            emoji: prod ? prod.emoji : '📦',
            line_total: (parseInt(it.qty, 10) * parseFloat(it.price)) - parseFloat(it.discount || 0)
          };
        })
      };

      return res.status(200).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, enriched)
      });
    }

    // ==========================================
    // PUT: Ubah Data Order / Nomor HP Customer (Admin, Manajer, Sales)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);
      
      // Jika sales, pastikan order miliknya sendiri
      if (authUser.role === 'sales' && order.sales_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat mengedit order milik Anda sendiri');
      }

      const data = validateBody(editOrderSchema, req.body);

      // 1. Update catatan order jika ada
      if (data.note !== undefined && order._rowIndex) {
        order.note = data.note;
        await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
      }

      // 2. Update nomor tujuan / nama pelanggan di tab Customers jika diisi
      const customers = tabs.Customers || [];
      const customer = customers.find(c => c.id === order.customer_id);
      if (customer && customer._rowIndex) {
        let changed = false;
        if (data.customer_phone !== undefined) {
          let p = data.customer_phone.trim();
          if (p && !p.startsWith('0') && !p.startsWith('+')) {
            p = '0' + p;
          }
          customer.phone = p;
          changed = true;
        }
        if (data.customer_name !== undefined && data.customer_name.trim()) {
          customer.name = data.customer_name.trim();
          changed = true;
        }
        if (changed) {
          await updateRow('Customers', customer._rowIndex, customer, CUST_HEADERS);
        }
      }

      await logAudit(authUser.id, 'UPDATE_ORDER', {
        order_id: order.id,
        order_no: order.order_no,
        customer_phone: data.customer_phone,
        note: data.note
      });

      return res.status(200).json({
        ok: true,
        message: 'Data order dan nomor telepon tujuan berhasil diperbarui'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
