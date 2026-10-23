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

    const updated = await callGas('setShipped', {
      order_id: orderId,
      user_id: authUser.id
    });

    return res.status(200).json({
      ok: true,
      data: updated,
      message: 'Status order berhasil diubah menjadi Dikirim'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
