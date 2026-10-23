import { z } from 'zod';
import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { getTabsBatch, updateRow } from '../../_lib/sheets.js';
import { validateBody } from '../../_lib/validate.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';
import { logAudit } from '../../_lib/audit.js';

const activeSchema = z.object({
  active: z.boolean()
});

const USER_HEADERS = ['id', 'username', 'full_name', 'role', 'branch_id', 'password_hash', 'active', 'must_change_password', 'token_version', 'failed_count', 'locked_until', 'created_at', 'last_login_at'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin']);

    const targetUserId = req.query.id;
    if (!targetUserId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID User wajib disertakan');
    }

    const data = validateBody(activeSchema, req.body);
    const tabs = await getTabsBatch(['Users']);
    const users = tabs.Users || [];

    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) {
      throw new ApiError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan');
    }

    // Aturan 1: Admin tidak boleh menonaktifkan diri sendiri
    if (targetUser.id === authUser.id && !data.active) {
      throw new ApiError(400, 'CANNOT_DEACTIVATE_SELF', 'Anda tidak dapat menonaktifkan akun Anda sendiri');
    }

    // Aturan 2: Harus selalu ada minimal 1 admin aktif
    if (targetUser.role === 'admin' && !data.active) {
      const activeAdmins = users.filter(u => u.role === 'admin' && String(u.active).toUpperCase() === 'TRUE');
      if (activeAdmins.length <= 1) {
        throw new ApiError(400, 'MIN_ONE_ADMIN', 'Tidak dapat menonaktifkan admin terakhir di sistem');
      }
    }

    // Naikkan token_version untuk langsung mencabut sesi user target
    const newTv = (parseInt(targetUser.token_version, 10) || 1) + 1;
    targetUser.active = data.active ? 'TRUE' : 'FALSE';
    targetUser.token_version = newTv;

    await updateRow('Users', targetUser._rowIndex, targetUser, USER_HEADERS);
    await logAudit(authUser.id, data.active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', { target_user: targetUser.username });

    return res.status(200).json({
      ok: true,
      message: `User ${targetUser.username} berhasil ${data.active ? 'diaktifkan' : 'dinonaktifkan'}`
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
