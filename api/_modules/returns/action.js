import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { callGas } from '../_lib/gas.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { clearCache } from '../_lib/cache.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'sales']);

    const { id, action } = req.query;
    if (!id) throw new ApiError(400, 'BAD_REQUEST', 'ID retur wajib disertakan');

    const { getTabsBatch, updateRow } = await import('../_lib/sheets.js');
    const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'SalesStock', 'Products']);
    const ret = (tabs.Returns || []).find(r => r.id === id);
    if (!ret) throw new ApiError(404, 'NOT_FOUND', 'Data retur tidak ditemukan');

    // Sales hanya boleh membatalkan pengajuan miliknya yang berstatus Menunggu
    if (authUser.role === 'sales') {
      if (action !== 'cancel') {
        throw new ApiError(403, 'FORBIDDEN', 'Hanya admin atau manajer yang dapat menyetujui/menolak pengajuan');
      }
      if (ret.sales_id !== authUser.id && ret.user_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke pengajuan ini');
      }
    }

    if (ret.status !== 'Menunggu') {
      throw new ApiError(400, 'INVALID_STATUS', `Pengajuan tidak bisa diproses karena sudah berstatus ${ret.status}`);
    }

    const nowStr = new Date().toISOString();
    const RETURN_HEADERS = ['id', 'return_no', 'type', 'ref_id', 'sales_id', 'branch_id', 'date', 'reason', 'status', 'approved_by', 'approved_at', 'total_qty', 'user_id'];

    let result;

    if (action === 'cancel') {
      // Pembatalan pengajuan oleh sales atau admin (status Menunggu -> Dibatalkan)
      ret.status = 'Dibatalkan';
      ret.approved_by = authUser.id;
      ret.approved_at = nowStr;
      ret.reason = ret.reason ? `${ret.reason} (Dibatalkan oleh ${authUser.full_name || authUser.username})` : 'Dibatalkan';
      if (ret._rowIndex) {
        await updateRow('Returns', ret._rowIndex, ret, RETURN_HEADERS);
      }
      result = ret;
    } else {
      const gasAction = action === 'approve' ? 'approveReturn' : 'rejectReturn';
      try {
        result = await callGas(gasAction, {
          return_id: id,
          admin_id: authUser.id,
          note: (req.body && req.body.note) || ''
        });
      } catch (gasErr) {
        console.warn('[GAS ACTION FALLBACK] Memproses approve/reject di Sheets langsung:', gasErr.message);
        const returnItems = (tabs.ReturnItems || []).filter(ri => ri.return_id === id);
        const salesStocks = tabs.SalesStock || [];
        const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
        const products = tabs.Products || [];
        const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];
        const targetSalesId = ret.sales_id || ret.user_id;

        if (action === 'approve') {
          const isDamaged = ret.type === 'DAMAGED_STOCK' || (ret.reason && ret.reason.toLowerCase().includes('rusak'));
          const isReturnStock = ret.type === 'RETURN_STOCK' || ret.type === 'SALES_TO_ADMIN' || !ret.ref_id;

          for (const ri of returnItems) {
            const qty = parseInt(ri.qty, 10) || 0;

            // 1. Kurangi SalesStock
            const ssRow = salesStocks.find(s => s.sales_id === targetSalesId && s.product_id === ri.product_id);
            if (ssRow && ssRow._rowIndex) {
              const cur = parseInt(ssRow.stock || 0, 10);
              ssRow.stock = Math.max(0, cur - qty);
              ssRow.updated_at = nowStr;
              await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
            }

            // 2. Jika bukan barang rusak (kembalikan stok layak jual), tambahkan ke stok admin
            if (!isDamaged && (isReturnStock || ret.type === 'RETURN_STOCK')) {
              const prod = products.find(p => p.id === ri.product_id);
              if (prod && prod._rowIndex) {
                const curAdmin = parseInt(prod.stock || 0, 10);
                prod.stock = curAdmin + qty;
                await updateRow('Products', prod._rowIndex, prod, prodHeaders);
              }
            }
          }

          ret.status = 'Disetujui';
          ret.approved_by = authUser.id;
          ret.approved_at = nowStr;
          await updateRow('Returns', ret._rowIndex, ret, RETURN_HEADERS);
          result = ret;
        } else {
          // Reject
          ret.status = 'Ditolak';
          ret.approved_by = authUser.id;
          ret.approved_at = nowStr;
          await updateRow('Returns', ret._rowIndex, ret, RETURN_HEADERS);
          result = ret;
        }
      }
    }

    try { clearCache(); } catch (e) {}

    let successMsg = 'Pengajuan berhasil diproses';
    if (action === 'cancel') successMsg = 'Pengajuan retur berhasil dibatalkan';
    else if (action === 'approve') successMsg = 'Pengajuan retur berhasil disetujui, stok telah disesuaikan';
    else if (action === 'reject') successMsg = 'Pengajuan retur telah ditolak';

    return res.status(200).json({
      ok: true,
      data: result,
      message: successMsg
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
