import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const opnameItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  counted: z.number().int().min(0, 'Hasil hitung fisik tidak boleh negatif')
});

const stockOpnameSchema = z.object({
  items: z.array(opnameItemSchema).min(1, 'Minimal 1 barang dihitung'),
  note: z.string().optional().default('Stock Opname Bulanan')
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    const data = validateBody(stockOpnameSchema, req.body);

    const result = await callGas('stockOpname', {
      items: data.items,
      note: data.note,
      user_id: authUser.id
    });

    return res.status(200).json({
      ok: true,
      data: result,
      message: 'Stock opname berhasil disimpan dan stok telah disesuaikan'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
