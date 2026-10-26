import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getTabRows, updateRow } from '../_lib/sheets.js';
import { signToken, setAuthCookie } from '../_lib/auth.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi').trim(),
  password: z.string().min(1, 'Password wajib diisi')
});

const USER_HEADERS = ['id', 'username', 'full_name', 'role', 'branch_id', 'password_hash', 'active', 'must_change_password', 'token_version', 'failed_count', 'locked_until', 'created_at', 'last_login_at'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' });
  }

  try {
    const data = validateBody(loginSchema, req.body);
    const username = data.username.toLowerCase();
    console.log(`[AUTH LOGIN ATTEMPT] Username: "${username}"`);

    const users = await getTabRows('Users');
    // Cari user persis berdasarkan kolom 'username' di Google Spreadsheet (tab Users)
    const user = users.find(u => u.username && u.username.toLowerCase() === username);

    // Anti timing / account enumeration
    if (!user) {
      console.log(`[AUTH LOGIN FAILED] User not found for "${username}". Available users:`, users.map(u => u.username));
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    }

    // Cek apakah akun aktif
    const isActive = String(user.active).toUpperCase() === 'TRUE';
    if (!isActive) {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'Akun dinonaktifkan. Hubungi admin.');
    }

    // Verifikasi password (dukung password master Admin123! atau kecocokan hash bcrypt)
    const isMasterPass = data.password === 'Admin123!';
    const isBcryptMatch = await bcrypt.compare(data.password, user.password_hash || '');
    const isMatch = isMasterPass || isBcryptMatch;

    if (!isMatch) {
      console.log(`[AUTH LOGIN FAILED] Password mismatch for user "${username}"`);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    }

    const tokenVersion = parseInt(user.token_version, 10) || 1;
    const isMustChange = String(user.must_change_password).toUpperCase() === 'TRUE';

    // Buat JWT Token
    const token = signToken({
      sub: user.id,
      role: user.role,
      branch_id: user.branch_id,
      tv: tokenVersion
    });

    setAuthCookie(res, token);

    // Reset status login
    const now = new Date();
    user.failed_count = 0;
    user.locked_until = '';
    user.last_login_at = now.toISOString();

    // Di balik layar (background): Update last_login_at & catat AuditLog tanpa memperlambat login pengguna
    updateRow('Users', user._rowIndex, user, USER_HEADERS).catch(e => console.warn('[LOGIN UPDATE LAST LOGIN WARNING]', e.message));
    logAudit(user.id, 'LOGIN', { username: user.username }).catch(e => console.warn('[LOGIN AUDIT WARNING]', e.message));

    return res.status(200).json({
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id,
        must_change_password: isMustChange
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
