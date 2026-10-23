import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, signToken, setAuthCookie } from '../_lib/auth.js';
import { getTabRows, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const changePasswordSchema = z.object({
  old_password: z.string().min(1, 'Password lama wajib diisi'),
  new_password: z.string().min(8, 'Password baru minimal 8 karakter')
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
    const data = validateBody(changePasswordSchema, req.body);

    const users = await getTabRows('Users');
    const user = users.find(u => u.id === authUser.id);
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
    }

    // Cek password lama
    const isOldMatch = await bcrypt.compare(data.old_password, user.password_hash || '');
    if (!isOldMatch) {
      throw new ApiError(400, 'INVALID_OLD_PASSWORD', 'Password lama tidak sesuai');
    }

    // Hash password baru
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(data.new_password, salt);

    // Update user: must_change_password = false, token_version bertambah
    const newTv = (parseInt(user.token_version, 10) || 1) + 1;
    user.password_hash = newHash;
    user.must_change_password = 'FALSE';
    user.token_version = newTv;

    await updateRow('Users', user._rowIndex, user, USER_HEADERS);

    // Buat token baru dengan token_version baru
    const newToken = signToken({
      sub: user.id,
      role: user.role,
      branch_id: user.branch_id,
      tv: newTv
    });
    setAuthCookie(res, newToken);

    await logAudit(user.id, 'CHANGE_PASSWORD', {});

    return res.status(200).json({
      ok: true,
      message: 'Password berhasil diubah'
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
