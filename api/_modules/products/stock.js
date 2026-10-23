import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const adjustStockSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  change: z.number().int('Perubahan harus bilangan bulat'),
  reason: z.enum(['Masuk', 'Koreksi', 'Opname']),
  note: z.string().optional().default('')
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    const data = validateBody(adjustStockSchema, req.body);

    const result = await callGas('adjustStock', {
      product_id: data.product_id,
      change: data.change,
      reason: data.reason,
      note: data.note,
      user_id: authUser.id
    });

    return res.status(200).json({
      ok: true,
      data: result,
      message: 'Penyesuaian stok berhasil disimpan'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
