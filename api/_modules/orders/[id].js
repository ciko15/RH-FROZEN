import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';
import { CR_CONFIG } from '../_lib/config.js';

const editOrderSchema = z.object({
  note: z.string().optional(),
  customer_id: z.string().optional(),
  nama_pelanggan: z.string().optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  status: z.string().optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    product_id: z.string().min(1),
    qty: z.coerce.number().int().positive('Qty harus positif'),
    nama_pemesan: z.string().optional().default(CR_CONFIG.DEFAULT_NAMA_PELANGGAN)
  })).min(1, 'Minimal 1 barang').optional()
});

const ORDER_HEADERS = ['id', 'order_no', 'order_date', 'order_time', 'sales_id', 'branch_id', 'customer_id', 'nama_pelanggan', 'status', 'note', 'type', 'client_key', 'created_at', 'updated_at', 'cancelled_by', 'deleted_at', 'deleted_by'];
const CUST_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
const ORDER_ITEM_HEADERS = ['id', 'order_id', 'product_id', 'name', 'qty', 'nama_pemesan', 'shortage', 'qty_shipped', 'deleted_at'];

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
        const resolvedName = prod ? prod.name : (it.name || it.product_name || 'Produk');
        return {
          ...it,
          name: resolvedName,
          product_name: resolvedName,
          nama_pemesan: it.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
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

      const firstItemPemesan = mappedItems.find(it => it.nama_pemesan && it.nama_pemesan !== '-' && it.nama_pemesan !== 'Tanpa Nama')?.nama_pemesan;
      const resolvedNamaPelanggan = (order.nama_pelanggan && order.nama_pelanggan.trim())
        ? order.nama_pelanggan.trim()
        : (firstItemPemesan || customer?.name || CR_CONFIG.DEFAULT_NAMA_PELANGGAN);

      const enriched = {
        ...order,
        nama_pelanggan: resolvedNamaPelanggan,
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
              nama_pemesan: newItem.nama_pemesan || oldRow.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
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
                name: oldRow.name || '',
                qty: 0,
                nama_pemesan: oldRow.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
                shortage: 0,
                qty_shipped: 0,
                deleted_at: new Date().toISOString()
              }, ORDER_ITEM_HEADERS);
            }
          } else if (i >= currentOrderItems.length && i < data.items.length) {
            // Tambah row baru
            const newItem = data.items[i];
            await appendRow('OrderItems', {
              id: crypto.randomUUID(),
              order_id: order.id,
              product_id: newItem.product_id,
              name: '',
              qty: newItem.qty,
              nama_pemesan: newItem.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
              shortage: 0,
              qty_shipped: ''
            }, ORDER_ITEM_HEADERS);
          }
        }
      }

      // 1b. Update status pesanan jika diminta (misal: "Sudah Jadi Transaksi")
      if (data.status && data.status !== order.status) {
        order.status = data.status;
        order.updated_at = new Date().toISOString();
        if (order._rowIndex) {
          await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
        }
      }

      // 2. Update catatan & nama pelanggan order jika ada
      let orderChanged = false;
      if (data.note !== undefined && order._rowIndex) {
        order.note = data.note;
        orderChanged = true;
      }
      if (data.nama_pelanggan !== undefined && order._rowIndex) {
        order.nama_pelanggan = data.nama_pelanggan;
        orderChanged = true;
      }
      if (data.customer_id !== undefined && order._rowIndex) {
        order.customer_id = data.customer_id;
        orderChanged = true;
      }
      if (orderChanged && order._rowIndex) {
        order.updated_at = new Date().toISOString();
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
    // - Jika sales: membatalkan/menghapus order miliknya
    // - Jika admin: soft delete pada tampilan admin, data sales tetap ada
    // ==========================================
    if (req.method === 'DELETE') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);

      if (authUser.role === 'sales' && order.sales_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat menghapus pesanan milik Anda sendiri');
      }

      const nowIso = new Date().toISOString();

      if (authUser.role === 'admin' || authUser.role === 'manajer') {
        // Admin soft delete: sembunyikan di admin namun tandai
        order.deleted_at = nowIso;
        order.deleted_by = authUser.username || authUser.id;
        order.note = (order.note ? order.note + ' | ' : '') + 'Dihapus oleh Admin ' + (authUser.username || '');
        if (order._rowIndex) {
          await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
        }
      } else {
        // Sales menghapus order miliknya sendiri (hanya bila belum transaksi)
        if (order.status === CR_CONFIG.STATUS_TRANSACTED) {
          throw new ApiError(400, 'INVALID_STATUS', 'Pesanan yang sudah jadi transaksi tidak dapat dihapus');
        }
        order.status = CR_CONFIG.STATUS_CANCELLED;
        order.deleted_at = nowIso;
        order.deleted_by = authUser.username || authUser.id;
        order.note = (order.note ? order.note + ' | ' : '') + 'Dihapus oleh ' + authUser.username;
        if (order._rowIndex) {
          await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
        }
      }

      const { clearCache } = await import('../_lib/cache.js');
      clearCache();

      await logAudit(authUser.id, 'DELETE_ORDER', {
        order_id: order.id,
        order_no: order.order_no,
        role: authUser.role
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
