import { z } from 'zod';
import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { callGas } from '../../_lib/gas.js';
import { validateBody } from '../../_lib/validate.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

const cancelSchema = z.object({
  reason: z.string().min(1, 'Alasan pembatalan wajib diisi').trim()
});

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

    const data = validateBody(cancelSchema, req.body);

    const updated = await callGas('cancelOrder', {
      order_id: orderId,
      reason: data.reason,
      user_id: authUser.id
    });

    return res.status(200).json({
      ok: true,
      data: updated,
      message: 'Order berhasil dibatalkan dan stok dikembalikan'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
