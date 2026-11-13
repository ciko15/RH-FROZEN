import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { CR_CONFIG } from '../_lib/config.js';

// Schema order item: wajib nama_pemesan, product_id, qty
const orderItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.number().int().positive('Qty harus berupa angka bulat positif'),
  nama_pemesan: z.string().min(1, 'Nama pemesan wajib diisi').default(CR_CONFIG.DEFAULT_NAMA_PEMESAN),
});

const createOrderSchema = z.object({
  branch_id: z.string().optional(),
  note: z.string().optional().default(''),
  client_key: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'Minimal pilih 1 barang'),
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Permintaan Stok
    // ==========================================
    if (req.method === 'GET') {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      const statusFilter = req.query.status;
      const search = (req.query.search || '').toLowerCase().trim();

      const tabs = await getTabsBatch(['Orders', 'OrderItems', 'Users', 'Products']);
      let orders = (tabs.Orders || []).filter(o => !o.type || o.type === 'STOCK_REQUEST' || (o.order_no && o.order_no.startsWith('STK-')));
      const orderItems = tabs.OrderItems || [];
      const users = tabs.Users || [];
      const products = tabs.Products || [];

      // Normalisasi jika kolom sempat bergeser (misal sales_id kosong tapi ada di branch_id)
      orders = orders.map(o => {
        let sales_id = o.sales_id || '';
        let branch_id = o.branch_id || '';
        let status = o.status || '';

        // Jika sales_id kosong tapi branch_id terisi kode USR-SLS-* atau UUID sales
        if (!sales_id && branch_id && (branch_id.startsWith('USR-SLS-') || users.some(u => u.id === branch_id))) {
          sales_id = branch_id;
          branch_id = status.startsWith('BR-') ? status : '';
          status = o.note && (o.note === 'Dibatalkan' || o.note === 'Dikirim' || o.note === 'Proses') ? o.note : 'Dibatalkan';
        }

        return {
          ...o,
          sales_id,
          branch_id,
          status: status || o.status || 'Proses'
        };
      });

      // RBAC & Soft delete handling:
      // - Admin menyembunyikan order jika dihapus oleh admin (deleted_by atau deleted_at ada)
      // - Sales tetap melihat order miliknya
      if (authUser.role === 'sales') {
        orders = orders.filter(o => o.sales_id === authUser.id && o.status !== CR_CONFIG.STATUS_CANCELLED);
      } else if (authUser.role === 'admin' || authUser.role === 'manajer') {
        // Sembunyikan order yang di-soft-delete admin
        orders = orders.filter(o => !o.deleted_at && o.status !== CR_CONFIG.STATUS_CANCELLED);
      } else if (authUser.branch_id) {
        orders = orders.filter(o => (!o.branch_id || o.branch_id === authUser.branch_id) && !o.deleted_at);
      }

      // Filter status
      if (statusFilter && statusFilter !== 'Semua') {
        orders = orders.filter(o => o.status === statusFilter);
      }

      // Enrich orders
      const enrichedOrders = orders.map(o => {
        const sales = users.find(u => u.id === o.sales_id);
        const items = orderItems.filter(oi => oi.order_id === o.id).map(oi => {
          const prod = products.find(p => p.id === oi.product_id);
          const requestedQty = parseInt(oi.qty, 10) || 0;
          const shippedQty = oi.qty_shipped !== undefined && oi.qty_shipped !== '' && oi.qty_shipped !== null
            ? (parseInt(oi.qty_shipped, 10) || 0)
            : (o.status === 'Dikirim' ? requestedQty : null);
          return {
            ...oi,
            nama_pemesan: oi.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
            product_name: prod ? prod.name : oi.name,
            admin_stock: parseInt(prod?.stock || 0, 10),
            qty: requestedQty,
            qty_shipped: shippedQty,
            shortage: parseInt(oi.shortage, 10) || 0
          };
        });
        const totalQty = items.reduce((sum, it) => sum + (parseInt(it.qty, 10) || 0), 0);
        const totalShippedQty = items.reduce((sum, it) => sum + (it.qty_shipped !== null ? it.qty_shipped : 0), 0);
        const shortageTotal = items.reduce((sum, it) => sum + (it.shortage || 0), 0);

        const hasCorrection = items.some(it => it.qty_shipped !== null && it.qty_shipped !== undefined && it.qty_shipped !== it.qty);

        return {
          ...o,
          sales_name: sales ? sales.full_name : '-',
          total_qty: totalQty,
          total_qty_shipped: o.status === 'Dikirim' ? totalShippedQty : null,
          items_count: items.length,
          shortage_total: shortageTotal,
          shortage_items: items.filter(it => it.shortage > 0).length,
          has_correction: hasCorrection,
          items
        };
      });

      // Filter search
      let filtered = enrichedOrders;
      if (search) {
        filtered = enrichedOrders.filter(o =>
          (o.order_no && o.order_no.toLowerCase().includes(search)) ||
          (o.sales_name && o.sales_name.toLowerCase().includes(search)) ||
          (o.items && o.items.some(it => (it.nama_pemesan && it.nama_pemesan.toLowerCase().includes(search))))
        );
      }

      // Urutkan data yang baru berubah / terbaru di posisi paling atas
      filtered.sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || (a.order_date + ' ' + (a.order_time || '00:00:00')) || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || (b.order_date + ' ' + (b.order_time || '00:00:00')) || 0).getTime();
        return timeB - timeA;
      });

      // Rekap akumulasi produk yang belum ditransaksikan / belum dikirim (status: Proses) dari semua order
      const pendingOrders = enrichedOrders.filter(o => o.status === 'Proses');
      const pendingSummaryMap = new Map();

      for (const po of pendingOrders) {
        for (const it of po.items) {
          const pid = it.product_id;
          const pName = it.product_name || it.name || 'Produk';
          const qty = parseInt(it.qty, 10) || 0;
          if (!pendingSummaryMap.has(pid)) {
            // Cari stok admin saat ini dari master products
            const prodData = products.find(p => p.id === pid);
            const adminStock = parseInt(prodData?.stock || 0, 10);
            pendingSummaryMap.set(pid, {
              product_id: pid,
              name: pName,
              total_qty: 0,
              admin_stock: adminStock,
              sales_breakdown: []
            });
          }
          const itemSummary = pendingSummaryMap.get(pid);
          itemSummary.total_qty += qty;
          itemSummary.sales_breakdown.push({
            order_id: po.id,
            order_no: po.order_no,
            sales_name: po.sales_name,
            nama_pemesan: it.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
            qty,
            date: po.order_date || po.created_at || '-'
          });
        }
      }

      // Hitung kekurangan stok setelah total_qty dihitung
      const pendingSummary = Array.from(pendingSummaryMap.values())
        .map(ps => ({
          ...ps,
          shortage: Math.max(0, ps.total_qty - ps.admin_stock),
          is_sufficient: ps.admin_stock >= ps.total_qty
        }))
        .sort((a, b) => b.total_qty - a.total_qty);


      const total = filtered.length;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);

      return res.status(200).json({
        ok: true,
        data: paginated,
        meta: {
          pending_summary: pendingSummary,
          total_pending_orders: pendingOrders.length
        },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }

    // ==========================================
    // POST: Buat Permintaan Stok Baru (Sales only)
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['sales']); // Hanya sales yang bisa minta stok

      const idempotencyKey = req.headers['idempotency-key'] || req.body?.client_key;
      if (idempotencyKey) {
        const cachedRes = await checkIdempotency(idempotencyKey);
        if (cachedRes) return res.status(200).json(cachedRes);
      }

      const data = validateBody(createOrderSchema, req.body);
      const branchId = authUser.branch_id;

      const gasPayload = {
        items: data.items,
        sales_id: authUser.id,
        branch_id: branchId,
        note: data.note,
        client_key: idempotencyKey || data.client_key,
      };

      let resultOrder;
      try {
        resultOrder = await callGas('createOrder', gasPayload);
      } catch (gasErr) {
        console.warn('[GAS CREATE_ORDER FALLBACK] Menulis langsung ke Sheets:', gasErr.message);
        const { getNextId, clearCache } = await import('../_lib/sheets.js');
        const now = new Date();
        const dateStr = now.toISOString().substring(0, 10);
        const timeStr = now.toTimeString().substring(0, 8);
        const orderId = crypto.randomUUID();
        const orderNo = `STK-${branchId || 'BR'}-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const newOrder = {
          id: orderId,
          order_no: orderNo,
          order_date: dateStr,
          order_time: timeStr,
          sales_id: authUser.id,
          branch_id: branchId || '',
          status: CR_CONFIG.STATUS_INITIAL,
          note: data.note || '',
          type: 'STOCK_REQUEST',
          client_key: idempotencyKey || data.client_key || '',
          created_at: now.toISOString()
        };

        const ORDER_HEADERS = ['id', 'order_no', 'order_date', 'order_time', 'sales_id', 'branch_id', 'status', 'note', 'type', 'client_key', 'created_at'];
        await appendRow('Orders', newOrder, ORDER_HEADERS);

        const ORDER_ITEM_HEADERS = ['id', 'order_id', 'product_id', 'name', 'qty', 'nama_pemesan', 'shortage', 'qty_shipped'];
        for (const it of data.items) {
          await appendRow('OrderItems', {
            id: crypto.randomUUID(),
            order_id: orderId,
            product_id: it.product_id,
            name: '',
            qty: it.qty,
            nama_pemesan: it.nama_pemesan || CR_CONFIG.DEFAULT_NAMA_PEMESAN,
            shortage: 0,
            qty_shipped: ''
          }, ORDER_ITEM_HEADERS);
        }

        clearCache();
        resultOrder = newOrder;
      }

      const responsePayload = {
        ok: true,
        data: resultOrder,
        message: 'Permintaan stok berhasil dibuat'
      };

      if (idempotencyKey) await saveIdempotency(idempotencyKey, responsePayload);
      return res.status(201).json(responsePayload);
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
