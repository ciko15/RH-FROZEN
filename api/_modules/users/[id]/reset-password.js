import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { getTabsBatch, updateRow } from '../../_lib/sheets.js';
import { validateBody } from '../../_lib/validate.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';
import { logAudit } from '../../_lib/audit.js';

const resetSchema = z.object({
  new_password: z.string().min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
    .regex(/[0-9]/, 'Password harus mengandung angka')
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

    const data = validateBody(resetSchema, req.body);
    const tabs = await getTabsBatch(['Users']);
    const users = tabs.Users || [];

    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) {
      throw new ApiError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan');
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(data.new_password, salt);

    // Naikkan token_version & set must_change_password = true
    const newTv = (parseInt(targetUser.token_version, 10) || 1) + 1;
    targetUser.password_hash = newHash;
    targetUser.must_change_password = 'TRUE';
    targetUser.token_version = newTv;
    targetUser.failed_count = 0;
    targetUser.locked_until = '';

    await updateRow('Users', targetUser._rowIndex, targetUser, USER_HEADERS);
    await logAudit(authUser.id, 'RESET_PASSWORD', { target_user: targetUser.username });

    return res.status(200).json({
      ok: true,
      message: `Password pengguna ${targetUser.username} berhasil direset`
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
