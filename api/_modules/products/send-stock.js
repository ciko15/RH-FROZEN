import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow, appendRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';
import { callGas } from '../_lib/gas.js';
import { CR_CONFIG } from '../_lib/config.js';

const sendStockSchema = z.object({
  sales_id: z.string().min(1, 'Sales wajib dipilih'),
  product_id: z.string().min(1, 'Barang wajib dipilih'),
  qty: z.coerce.number().int().positive('Jumlah kirim harus lebih dari 0'),
  note: z.string().optional().default('')
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    const data = validateBody(sendStockSchema, req.body);
    const { sales_id, product_id, qty, note } = data;

    // Coba via GAS terlebih dahulu bila tersedia
    try {
      const gasRes = await callGas('sendStockDirect', {
        sales_id,
        product_id,
        qty,
        note,
        admin_id: authUser.id
      });
      return res.status(200).json({
        ok: true,
        data: gasRes,
        message: 'Stok berhasil dikirim ke sales'
      });
    } catch (gasErr) {
      console.warn('[GAS SEND_STOCK FALLBACK] Memproses kirim stok via Sheets langsung:', gasErr.message);
    }

    // Fallback eksekusi langsung ke Google Sheets API
    const tabs = await getTabsBatch(['Products', 'SalesStock', 'Users'], true);
    const products = tabs.Products || [];
    const salesStocks = tabs.SalesStock || [];
    const users = tabs.Users || [];

    const targetSales = users.find(u => u.id === sales_id && (u.role === 'sales' || u.role === 'kasir'));
    if (!targetSales) {
      throw new ApiError(404, 'NOT_FOUND', 'Sales tidak ditemukan');
    }

    const prod = products.find(p => p.id === product_id);
    if (!prod) {
      throw new ApiError(404, 'NOT_FOUND', 'Barang tidak ditemukan');
    }

    const currentAdminStock = parseInt(prod.stock || 0, 10);
    if (!CR_CONFIG.ALLOW_NEGATIVE_ADMIN_STOCK && qty > currentAdminStock) {
      throw new ApiError(400, 'INSUFFICIENT_STOCK', `Stok gudang pusat tidak cukup untuk ${prod.name} (Tersedia: ${currentAdminStock}, Diminta kirim: ${qty})`);
    }

    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const refNo = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Kurangi stok gudang pusat
    const newAdminStock = Math.max(0, currentAdminStock - qty);
    prod.stock = newAdminStock;
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];
    if (prod._rowIndex) {
      await updateRow('Products', prod._rowIndex, prod, prodHeaders);
    }

    await appendRow('StockMovements', {
      id: crypto.randomUUID(),
      date_time: nowIso,
      product_id: prod.id,
      change: -qty,
      reason: 'Kirim ke Sales ' + (targetSales.full_name || targetSales.name || ''),
      ref: refNo + (note ? ` (${note})` : ''),
      balance_after: newAdminStock,
      user_id: authUser.id,
      stock_type: 'ADMIN'
    }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type']);

    // 2. Tambah stok SalesStock
    const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
    const ssRow = salesStocks.find(s => s.sales_id === sales_id && s.product_id === product_id);
    let finalSalesStock = qty;

    if (ssRow && ssRow._rowIndex) {
      finalSalesStock = (parseInt(ssRow.stock || 0, 10)) + qty;
      ssRow.stock = finalSalesStock;
      ssRow.updated_at = nowIso;
      await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
    } else {
      await appendRow('SalesStock', {
        sales_id,
        product_id,
        stock: finalSalesStock,
        updated_at: nowIso
      }, salesStockHeaders);
    }

    await appendRow('StockMovements', {
      id: crypto.randomUUID(),
      date_time: nowIso,
      product_id,
      change: qty,
      reason: 'Kirim dari Admin (' + (authUser.username || 'Admin') + ')',
      ref: refNo + (note ? ` (${note})` : ''),
      balance_after: finalSalesStock,
      user_id: sales_id,
      stock_type: 'SALES'
    }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type']);

    clearCache();

    await logAudit(authUser.id, 'SEND_STOCK_TO_SALES', {
      sales_id,
      sales_name: targetSales.full_name,
      product_id,
      product_name: prod.name,
      qty,
      ref: refNo
    });

    return res.status(200).json({
      ok: true,
      data: {
        product_id,
        sales_id,
        qty_sent: qty,
        admin_stock_after: newAdminStock,
        sales_stock_after: finalSalesStock
      },
      message: `Berhasil mengirim ${qty} pcs ${prod.name} ke ${targetSales.full_name || 'sales'}`
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
