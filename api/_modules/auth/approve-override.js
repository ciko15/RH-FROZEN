import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const approveSchema = z.object({
  username: z.string().min(1, 'Username manajer wajib diisi').trim(),
  password: z.string().min(1, 'Password manajer wajib diisi'),
  reason: z.string().min(1, 'Alasan persetujuan wajib diisi')
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    const data = validateBody(approveSchema, req.body);

    const tabs = await getTabsBatch(['Users']);
    const users = tabs.Users || [];

    const manager = users.find(u => u.username && u.username.toLowerCase() === data.username.toLowerCase());
    if (!manager) {
      throw new ApiError(401, 'INVALID_MANAGER_CREDENTIALS', 'Akun manajer tidak ditemukan');
    }

    // Pastikan user memiliki role manajer atau admin
    if (manager.role !== 'admin' && manager.role !== 'manajer') {
      throw new ApiError(403, 'NOT_AUTHORIZED_ROLE', 'Pengguna bukan seorang Manajer atau Admin');
    }

    const isActive = String(manager.active).toUpperCase() === 'TRUE';
    if (!isActive) {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'Akun manajer dinonaktifkan');
    }

    const isMatch = await bcrypt.compare(data.password, manager.password_hash || '');
    if (!isMatch) {
      throw new ApiError(401, 'INVALID_MANAGER_CREDENTIALS', 'Password manajer salah');
    }

    // Catat persetujuan override di audit log
    await logAudit(manager.id, 'MANAGER_OVERRIDE_APPROVED', {
      requester: authUser.username,
      reason: data.reason
    });

    return res.status(200).json({
      ok: true,
      data: {
        approved_by: manager.username,
        manager_name: manager.full_name
      },
      message: `Persetujuan berhasil diberikan oleh ${manager.full_name}`
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
