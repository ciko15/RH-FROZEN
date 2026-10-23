import { authenticate } from '../../../_lib/auth.js';
import { requireRole } from '../../../_lib/rbac.js';
import { callGas } from '../../../_lib/gas.js';
import { handleApiError, ApiError } from '../../../_lib/errors.js';

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
      const { getTabRows, updateRow } = await import('../../../_lib/sheets.js');
      const orders = await getTabRows('Orders');
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        throw new ApiError(404, 'NOT_FOUND', 'Order tidak ditemukan');
      }
      order.status = 'Dikirim';
      const headers = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
      await updateRow('Orders', order._rowIndex, order, headers);
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
