import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow, appendRow, deleteRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { validateBody } from '../_lib/validate.js';
import crypto from 'crypto';

const updateReturnSchema = z.object({
  return_action: z.enum(['RETURN_STOCK', 'DAMAGED_STOCK', 'CUSTOMER_RETURN']).optional(),
  reason: z.string().min(1, 'Alasan wajib diisi').trim(),
  items: z.array(z.object({
    product_id: z.string().min(1),
    qty: z.number().int().positive('Qty harus bilangan bulat positif')
  })).min(1, 'Minimal pilih 1 barang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'sales']);

    const { id } = req.query;
    if (!id) throw new ApiError(400, 'BAD_REQUEST', 'ID pengajuan retur wajib disertakan');

    const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'Products', 'SalesStock']);
    const returns = tabs.Returns || [];
    const ret = returns.find(r => r.id === id);

    if (!ret) throw new ApiError(404, 'NOT_FOUND', 'Data pengajuan retur tidak ditemukan');

    // Sales hanya boleh mengoreksi pengajuan miliknya sendiri
    if (authUser.role === 'sales' && ret.sales_id !== authUser.id && ret.user_id !== authUser.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke pengajuan ini');
    }

    // Hanya pengajuan yang masih status Menunggu yang boleh dikoreksi
    if (ret.status !== 'Menunggu') {
      throw new ApiError(400, 'INVALID_STATUS', `Pengajuan tidak bisa dikoreksi karena sudah ${ret.status}`);
    }

    if (req.method === 'PUT') {
      const data = validateBody(updateReturnSchema, req.body);
      const products = tabs.Products || [];
      const salesStocks = tabs.SalesStock || [];
      const returnAction = data.return_action || ret.type || 'RETURN_STOCK';

      // Validasi stok sales (tidak boleh melebihi stok yang saat ini dipegang)
      if (returnAction === 'RETURN_STOCK' || returnAction === 'DAMAGED_STOCK') {
        const salesId = ret.sales_id || authUser.id;
        for (const item of data.items) {
          const prod = products.find(p => p.id === item.product_id);
          const ss = salesStocks.find(s => s.sales_id === salesId && s.product_id === item.product_id);
          const currentSalesStock = parseInt(ss?.stock || 0, 10);
          if (item.qty > currentSalesStock) {
            throw new ApiError(400, 'INSUFFICIENT_STOCK', `Stok ${prod?.name || item.product_id} di sales (${currentSalesStock} pcs) tidak cukup untuk mengembalikan ${item.qty} pcs`);
          }
        }
      }

      const totalQty = data.items.reduce((s, it) => s + it.qty, 0);
      const nowStr = new Date().toISOString();

      // 1. Update data pada sheet Returns
      ret.type = returnAction;
      ret.reason = data.reason;
      ret.total_qty = totalQty;
      ret.updated_at = nowStr;

      const RETURN_HEADERS = ['id', 'return_no', 'type', 'ref_id', 'sales_id', 'branch_id', 'date', 'reason', 'status', 'approved_by', 'approved_at', 'total_qty', 'user_id'];
      if (ret._rowIndex) {
        await updateRow('Returns', ret._rowIndex, ret, RETURN_HEADERS);
      }

      // 2. Update ReturnItems: tandai/hapus item lama dan masukkan item baru
      const existingItems = (tabs.ReturnItems || []).filter(ri => ri.return_id === id);
      const RETURN_ITEM_HEADERS = ['id', 'return_id', 'product_id', 'name', 'qty', 'price'];

      // Timpa item lama yang ada atau tambahkan yang baru
      for (let i = 0; i < data.items.length; i++) {
        const it = data.items[i];
        const prod = products.find(p => p.id === it.product_id);
        const name = prod ? prod.name : 'Produk';
        const price = parseFloat(prod?.cost_price || prod?.price || 0);

        if (i < existingItems.length) {
          // Update item baris yang ada
          const oldItem = existingItems[i];
          oldItem.product_id = it.product_id;
          oldItem.name = name;
          oldItem.qty = it.qty;
          oldItem.price = price;
          if (oldItem._rowIndex) {
            await updateRow('ReturnItems', oldItem._rowIndex, oldItem, RETURN_ITEM_HEADERS);
          }
        } else {
          // Tambah baris baru
          await appendRow('ReturnItems', {
            id: crypto.randomUUID(),
            return_id: id,
            product_id: it.product_id,
            name: name,
            qty: it.qty,
            price: price
          }, RETURN_ITEM_HEADERS);
        }
      }

      // Jika jumlah item baru lebih sedikit dari item lama, kosongkan sisa baris lama
      if (existingItems.length > data.items.length) {
        for (let j = data.items.length; j < existingItems.length; j++) {
          const surplusItem = existingItems[j];
          surplusItem.qty = 0;
          surplusItem.name = '-';
          if (surplusItem._rowIndex) {
            await updateRow('ReturnItems', surplusItem._rowIndex, surplusItem, RETURN_ITEM_HEADERS);
          }
        }
      }

      try { clearCache(); } catch (e) {}

      return res.status(200).json({
        ok: true,
        data: {
          ...ret,
          items: data.items
        },
        message: 'Pengajuan retur berhasil dikoreksi'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode PUT yang diizinkan' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
