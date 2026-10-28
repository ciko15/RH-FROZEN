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
    requireRole(authUser, ['admin', 'manajer']);

    const { id, action } = req.query;
    if (!id) throw new ApiError(400, 'BAD_REQUEST', 'ID retur wajib disertakan');

    const gasAction = action === 'approve' ? 'approveReturn' : 'rejectReturn';
    const result = await callGas(gasAction, {
      return_id: id,
      admin_id: authUser.id,
      note: (req.body && req.body.note) || ''
    });

    // Jika retur ditolak/dibatalkan, kurangi kembali stok sales yang sebelumnya bertambah saat retur diajukan
    if (action === 'reject') {
      try {
        const { getTabsBatch, updateRow } = await import('../_lib/sheets.js');
        const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'SalesStock']);
        const ret = (tabs.Returns || []).find(r => r.id === id);
        if (ret) {
          const retItems = (tabs.ReturnItems || []).filter(ri => ri.return_id === id);
          const salesStocks = tabs.SalesStock || [];
          const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
          const nowStr = new Date().toISOString();
          const targetSalesId = ret.sales_id || ret.user_id;

          for (const ri of retItems) {
            const qty = parseInt(ri.qty, 10) || 0;
            const ssRow = salesStocks.find(s => s.sales_id === targetSalesId && s.product_id === ri.product_id);
            if (ssRow && ssRow._rowIndex) {
              const cur = parseInt(ssRow.stock || 0, 10);
              ssRow.stock = Math.max(0, cur - qty);
              ssRow.updated_at = nowStr;
              await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
            }
          }
        }
      } catch (err) {
        console.warn('[Returns/Action] Gagal revert stok sales saat tolak:', err.message);
      }
    }

    try { clearCache(); } catch (e) {}

    return res.status(200).json({
      ok: true,
      data: result,
      message: action === 'approve' ? 'Retur disetujui, stok tetap dipegang sales' : 'Retur ditolak, stok sales dikembalikan'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
