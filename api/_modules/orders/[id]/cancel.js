import { z } from 'zod';
import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { callGas } from '../../_lib/gas.js';
import { validateBody } from '../../_lib/validate.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

const cancelSchema = z.object({
  reason: z.string().optional().default('Dibatalkan oleh pengguna')
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'sales']);

    const orderId = req.query.id;
    if (!orderId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Order wajib disertakan');
    }

    const data = validateBody(cancelSchema, req.body || {});
    const cancelReason = (data.reason || '').trim() || 'Dibatalkan oleh pengguna';

    let updated;
    try {
      updated = await callGas('cancelOrder', {
        order_id: orderId,
        reason: cancelReason,
        user_id: authUser.id
      });
    } catch (gasErr) {
      console.warn('[GAS CANCEL FALLBACK] Memproses pembatalan order via Sheets langsung:', gasErr.message);

      const { getTabRows, updateRow } = await import('../../_lib/sheets.js');
      const { clearCache } = await import('../../_lib/cache.js');

      const orders = await getTabRows('Orders', true);
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        throw new ApiError(404, 'NOT_FOUND', 'Order tidak ditemukan');
      }
      if (order.status !== 'Proses') {
        throw new ApiError(400, 'INVALID_STATUS', 'Hanya permintaan berstatus Proses yang bisa dibatalkan');
      }

      order.status = 'Dibatalkan';
      order.note = (order.note ? order.note + ' | ' : '') + 'Batal: ' + cancelReason;

      const ORDER_HEADERS = ['id', 'order_no', 'order_date', 'order_time', 'sales_id', 'branch_id', 'status', 'note', 'type', 'client_key', 'created_at'];
      if (order._rowIndex) {
        await updateRow('Orders', order._rowIndex, order, ORDER_HEADERS);
      }

      try { clearCache(); } catch (e) {}
      updated = order;
    }

    return res.status(200).json({
      ok: true,
      data: updated,
      message: 'Order berhasil dibatalkan'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
