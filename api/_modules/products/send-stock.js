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

const batchItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.coerce.number().int().positive('Jumlah kirim harus lebih dari 0')
});

const sendStockBatchSchema = z.object({
  sales_id: z.string().min(1, 'Sales wajib dipilih'),
  note: z.string().optional().default(''),
  // Mendukung kirim multi-barang (items array) atau single-item legacy
  items: z.array(batchItemSchema).min(1, 'Minimal pilih 1 barang untuk dikirim').optional(),
  product_id: z.string().optional(),
  qty: z.coerce.number().optional()
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    const data = validateBody(sendStockBatchSchema, req.body);
    const sales_id = data.sales_id;
    const note = data.note || '';

    // Normalisasi items (apakah kirim multi-item atau single item)
    let sendItems = [];
    if (Array.isArray(data.items) && data.items.length > 0) {
      sendItems = data.items;
    } else if (data.product_id && data.qty && data.qty > 0) {
      sendItems = [{ product_id: data.product_id, qty: parseInt(data.qty, 10) }];
    } else {
      throw new ApiError(400, 'BAD_REQUEST', 'Minimal sertakan 1 barang dengan kuantitas > 0');
    }

    // Ambil data sheet terkini
    const tabs = await getTabsBatch(['Products', 'SalesStock', 'Users'], true);
    const products = tabs.Products || [];
    const salesStocks = tabs.SalesStock || [];
    const users = tabs.Users || [];

    const targetSales = users.find(u => u.id === sales_id && (u.role === 'sales' || u.role === 'kasir'));
    if (!targetSales) {
      throw new ApiError(404, 'NOT_FOUND', 'Sales tidak ditemukan');
    }

    // Validasi stok per baris: pastikan tidak ada baris yang melebih stok gudang pusat
    const rowErrors = [];
    const validatedBatch = [];
    for (const item of sendItems) {
      const prod = products.find(p => p.id === item.product_id);
      if (!prod) {
        rowErrors.push({ product_id: item.product_id, message: 'Barang tidak ditemukan' });
        continue;
      }
      const currentAdminStock = parseInt(prod.stock || 0, 10);
      if (!CR_CONFIG.ALLOW_NEGATIVE_ADMIN_STOCK && item.qty > currentAdminStock) {
        rowErrors.push({
          product_id: item.product_id,
          product_name: prod.name,
          available: currentAdminStock,
          requested: item.qty,
          message: `Stok gudang pusat tidak cukup untuk ${prod.name} (Tersedia: ${currentAdminStock}, Dikirim: ${item.qty})`
        });
      } else {
        validatedBatch.push({
          product: prod,
          qty: item.qty
        });
      }
    }

    if (rowErrors.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'INSUFFICIENT_STOCK',
        message: rowErrors.map(e => e.message).join(' | '),
        errors: rowErrors
      });
    }

    // Eksekusi batch pengiriman dalam satu transaksi nomor ref batch
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchNo = `TRF-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];
    const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
    const movementHeaders = ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id', 'stock_type'];

    const detailsResult = [];

    for (const v of validatedBatch) {
      const prod = v.product;
      const qty = v.qty;
      const currentAdminStock = parseInt(prod.stock || 0, 10);

      // 1. Kurangi stok gudang pusat
      const newAdminStock = Math.max(0, currentAdminStock - qty);
      prod.stock = newAdminStock;
      if (prod._rowIndex) {
        await updateRow('Products', prod._rowIndex, prod, prodHeaders);
      }

      await appendRow('StockMovements', {
        id: crypto.randomUUID(),
        date_time: nowIso,
        product_id: prod.id,
        change: -qty,
        reason: 'Kirim ke Sales ' + (targetSales.full_name || targetSales.name || ''),
        ref: batchNo + (note ? ` (${note})` : ''),
        balance_after: newAdminStock,
        user_id: authUser.id,
        stock_type: 'ADMIN'
      }, movementHeaders);

      // 2. Tambah stok SalesStock
      const ssRow = salesStocks.find(s => s.sales_id === sales_id && s.product_id === prod.id);
      let finalSalesStock = qty;

      if (ssRow && ssRow._rowIndex) {
        finalSalesStock = (parseInt(ssRow.stock || 0, 10)) + qty;
        ssRow.stock = finalSalesStock;
        ssRow.updated_at = nowIso;
        await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
      } else {
        await appendRow('SalesStock', {
          sales_id,
          product_id: prod.id,
          stock: finalSalesStock,
          updated_at: nowIso
        }, salesStockHeaders);
      }

      await appendRow('StockMovements', {
        id: crypto.randomUUID(),
        date_time: nowIso,
        product_id: prod.id,
        change: qty,
        reason: 'Kirim dari Admin (' + (authUser.username || 'Admin') + ')',
        ref: batchNo + (note ? ` (${note})` : ''),
        balance_after: finalSalesStock,
        user_id: sales_id,
        stock_type: 'SALES'
      }, movementHeaders);

      detailsResult.push({
        product_id: prod.id,
        product_name: prod.name,
        qty_sent: qty,
        admin_stock_after: newAdminStock,
        sales_stock_after: finalSalesStock
      });
    }

    clearCache();

    await logAudit(authUser.id, 'SEND_STOCK_BATCH_TO_SALES', {
      batch_no: batchNo,
      sales_id,
      sales_name: targetSales.full_name,
      items_count: validatedBatch.length,
      total_qty: validatedBatch.reduce((s, it) => s + it.qty, 0),
      note
    });

    const totalQtySent = validatedBatch.reduce((s, it) => s + it.qty, 0);

    return res.status(200).json({
      ok: true,
      data: {
        batch_no: batchNo,
        sales_id,
        sales_name: targetSales.full_name,
        date_time: nowIso,
        items_count: validatedBatch.length,
        total_qty: totalQtySent,
        items: detailsResult
      },
      message: `Berhasil mengirim ${validatedBatch.length} jenis barang (${totalQtySent} pcs) ke ${targetSales.full_name || 'sales'} (Batch #${batchNo})`
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
