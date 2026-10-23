import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { callGas } from '../../_lib/gas.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    const orderId = req.query.id;
    if (!orderId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Order wajib disertakan');
    }

    let updated;
    try {
      updated = await callGas('setShipped', {
        order_id: orderId,
        user_id: authUser.id
      });
    } catch (gasErr) {
      console.warn('[GAS SHIP FALLBACK] Memproses pengiriman via Sheets langsung:', gasErr.message);
      // Fallback langsung ke Google Sheets
      const { getTabRows, updateRow, appendRow } = await import('../../_lib/sheets.js');
      const { clearCache } = await import('../../_lib/cache.js');

      const orders = await getTabRows('Orders', true);
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        throw new ApiError(404, 'NOT_FOUND', 'Order tidak ditemukan');
      }

      // Kurangi stok admin dan tambah SalesStock jika order berstatus Proses
      if (order.status === 'Proses') {
        const orderItems = (await getTabRows('OrderItems', true)).filter(oi => oi.order_id === orderId);
        const products = await getTabRows('Products', true);
        const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];
        const salesStocks = await getTabRows('SalesStock', true);
        const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
        const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const salesId = order.sales_id;

        for (const item of orderItems) {
          const qty = parseInt(item.qty || 0, 10);
          const prod = products.find(p => p.id === item.product_id);

          // 1. Kurangi stok admin
          if (prod && prod._rowIndex) {
            const currentStock = parseInt(prod.stock || 0, 10);
            const newStock = Math.max(0, currentStock - qty);
            prod.stock = newStock;
            await updateRow('Products', prod._rowIndex, prod, prodHeaders);

            await appendRow('StockMovements', {
              id: crypto.randomUUID(),
              date_time: nowIso,
              product_id: prod.id,
              change: -qty,
              reason: 'Kirim ke Sales',
              ref: order.order_no || order.id,
              balance_after: newStock,
              user_id: authUser.id,
              stock_type: 'ADMIN'
            }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type']);
          }

          // 2. Tambah stok sales
          if (salesId) {
            const ssRow = salesStocks.find(s => s.sales_id === salesId && s.product_id === item.product_id);
            if (ssRow && ssRow._rowIndex) {
              const currentSalesStock = parseInt(ssRow.stock || 0, 10);
              const newSalesStock = currentSalesStock + qty;
              ssRow.stock = newSalesStock;
              ssRow.updated_at = nowIso;
              await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);

              await appendRow('StockMovements', {
                id: crypto.randomUUID(),
                date_time: nowIso,
                product_id: item.product_id,
                change: qty,
                reason: 'Terima dari Admin',
                ref: order.order_no || order.id,
                balance_after: newSalesStock,
                user_id: salesId,
                stock_type: 'SALES'
              }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type']);
            } else {
              const newSalesStock = qty;
              await appendRow('SalesStock', {
                sales_id: salesId,
                product_id: item.product_id,
                stock: newSalesStock,
                updated_at: nowIso
              }, salesStockHeaders);

              await appendRow('StockMovements', {
                id: crypto.randomUUID(),
                date_time: nowIso,
                product_id: item.product_id,
                change: qty,
                reason: 'Terima dari Admin',
                ref: order.order_no || order.id,
                balance_after: newSalesStock,
                user_id: salesId,
                stock_type: 'SALES'
              }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type']);
            }
          }
        }
      }

      order.status = 'Dikirim';
      const headers = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
      await updateRow('Orders', order._rowIndex, order, headers);
      clearCache();
      updated = order;
    }

    return res.status(200).json({
      ok: true,
      data: updated,
      message: 'Status order berhasil diubah menjadi Dikirim'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
