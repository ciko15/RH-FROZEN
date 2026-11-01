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
  customer_phone: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().min(1),
    qty: z.coerce.number().int().positive('Qty harus positif')
  })).min(1, 'Minimal 1 barang').optional()
});

const ORDER_HEADERS = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
const CUST_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
const ORDER_ITEM_HEADERS = ['id', 'order_id', 'product_id', 'qty', 'qty_shipped', 'price'];

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

      const mappedItems = items.map(it => {
        const prod = (tabs.Products || []).find(p => p.id === it.product_id);
        const requestedQty = parseInt(it.qty, 10) || 0;
        const shippedQty = it.qty_shipped !== undefined && it.qty_shipped !== '' && it.qty_shipped !== null
          ? (parseInt(it.qty_shipped, 10) || 0)
          : (order.status === 'Dikirim' ? requestedQty : null);
        return {
          ...it,
          emoji: prod ? prod.emoji : '📦',
          admin_stock: parseInt(prod?.stock || 0, 10),
          qty: requestedQty,
          qty_shipped: shippedQty,
          shortage: parseInt(it.shortage, 10) || 0,
          line_total: (requestedQty * parseFloat(it.price || 0)) - parseFloat(it.discount || 0)
        };
      });

      const totalQty = mappedItems.reduce((sum, it) => sum + it.qty, 0);
      const totalShippedQty = mappedItems.reduce((sum, it) => sum + (it.qty_shipped !== null ? it.qty_shipped : 0), 0);

      const enriched = {
        ...order,
        customer,
        customer_phone: customer ? customer.phone : '',
        sales_name: sales ? sales.full_name : '-',
        total_qty: totalQty,
        total_qty_shipped: order.status === 'Dikirim' ? totalShippedQty : null,
        items: mappedItems
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

      // 1. Update items jika dikirim dan status masih Proses
      if (data.items) {
        if (order.status !== 'Proses') {
          throw new ApiError(400, 'INVALID_STATUS', 'Hanya pesanan berstatus Proses yang dapat diubah rincian barangnya');
        }

        const { appendRow } = await import('../_lib/sheets.js');
        const currentOrderItems = (tabs.OrderItems || []).filter(oi => oi.order_id === order.id);

        for (let i = 0; i < Math.max(currentOrderItems.length, data.items.length); i++) {
          if (i < currentOrderItems.length && i < data.items.length) {
            // Update existing row
            const oldRow = currentOrderItems[i];
            const newItem = data.items[i];
            const updated = {
              ...oldRow,
              product_id: newItem.product_id,
              qty: newItem.qty,
              qty_shipped: ''
            };
            if (oldRow._rowIndex) {
              await updateRow('OrderItems', oldRow._rowIndex, updated, ORDER_ITEM_HEADERS);
            }
          } else if (i < currentOrderItems.length && i >= data.items.length) {
            // Hapus item berlebih
            const oldRow = currentOrderItems[i];
            if (oldRow._rowIndex) {
              await updateRow('OrderItems', oldRow._rowIndex, {
                id: oldRow.id,
                order_id: order.id,
                product_id: oldRow.product_id,
                qty: 0,
                qty_shipped: 0,
                price: 0
              }, ORDER_ITEM_HEADERS);
            }
          } else if (i >= currentOrderItems.length && i < data.items.length) {
            // Tambah row baru
            const newItem = data.items[i];
            await appendRow('OrderItems', {
              id: crypto.randomUUID(),
              order_id: order.id,
              product_id: newItem.product_id,
              qty: newItem.qty,
              qty_shipped: '',
              price: 0
            }, ORDER_ITEM_HEADERS);
          }
        }
      }

      // 2. Update catatan order jika ada
      if (data.note !== undefined && order._rowIndex) {
        order.note = data.note;
        await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
      }

      // 3. Update nomor tujuan / nama pelanggan di tab Customers jika diisi
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

      const { clearCache } = await import('../_lib/cache.js');
      clearCache();

      await logAudit(authUser.id, 'UPDATE_ORDER', {
        order_id: order.id,
        order_no: order.order_no,
        customer_phone: data.customer_phone,
        items_count: data.items ? data.items.length : undefined,
        note: data.note
      });

      return res.status(200).json({
        ok: true,
        message: 'Pesanan permintaan stok berhasil diperbarui'
      });
    }

    // ==========================================
    // DELETE: Hapus Pesanan Permintaan (Admin / Sales)
    // ==========================================
    if (req.method === 'DELETE') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);

      if (authUser.role === 'sales' && order.sales_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat menghapus pesanan milik Anda sendiri');
      }

      if (order.status !== 'Proses') {
        throw new ApiError(400, 'INVALID_STATUS', 'Hanya pesanan berstatus Proses yang dapat dihapus');
      }

      // Tandai order menjadi Dibatalkan / Dihapus
      order.status = 'Dibatalkan';
      order.note = (order.note ? order.note + ' | ' : '') + 'Dihapus oleh ' + authUser.username;
      if (order._rowIndex) {
        await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
      }

      const { clearCache } = await import('../_lib/cache.js');
      clearCache();

      await logAudit(authUser.id, 'DELETE_ORDER', {
        order_id: order.id,
        order_no: order.order_no
      });

      return res.status(200).json({
        ok: true,
        message: 'Pesanan permintaan stok berhasil dihapus'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
