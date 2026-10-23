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
    try { clearCache(); } catch (e) {}

    return res.status(200).json({
      ok: true,
      data: result,
      message: action === 'approve' ? 'Retur disetujui, stok dipindahkan ke admin' : 'Retur ditolak'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
