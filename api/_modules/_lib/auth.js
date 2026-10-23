import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { ApiError } from './errors.js';
import { getTabRows } from './sheets.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_jwt_fallback_key';
const COOKIE_NAME = 'st_token';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieStr = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 // 12 jam
  });
  res.setHeader('Set-Cookie', cookieStr);
}

export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieStr = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Autentikasi JWT & validasi status user terkini
 */
export async function authenticate(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];

  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Sesi login telah berakhir. Silakan login kembali');
  }

  // Verifikasi ke tab Users
  const users = await getTabRows('Users');
  const user = users.find(u => u.id === decoded.sub);

  if (!user) {
    throw new ApiError(401, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
  }

  const isActive = String(user.active).toUpperCase() === 'TRUE';
  if (!isActive) {
    throw new ApiError(401, 'ACCOUNT_DISABLED', 'Akun dinonaktifkan. Hubungi admin.');
  }

  // Token version check (cabut sesi jika ada reset atau revoke)
  const currentTv = parseInt(user.token_version, 10) || 1;
  if (decoded.tv !== currentTv) {
    throw new ApiError(401, 'SESSION_EXPIRED', 'Sesi telah diperbarui atau dicabut. Silakan login kembali.');
  }

  // Jika must_change_password true dan bukan memanggil endpoint /auth/
  const isMustChange = String(user.must_change_password).toUpperCase() === 'TRUE';
  const url = req.url || '';
  if (isMustChange && !url.includes('/api/auth/')) {
    throw new ApiError(403, 'MUST_CHANGE_PASSWORD', 'Anda wajib mengganti password sebelum melanjutkan.');
  }

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    branch_id: user.branch_id,
    must_change_password: isMustChange,
    token_version: currentTv,
    _rowIndex: user._rowIndex
  };
}
