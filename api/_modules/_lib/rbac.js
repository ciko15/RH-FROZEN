import { ApiError } from './errors.js';

/**
 * Menegakkan Hak Akses Berdasarkan Peran (admin, manajer, sales, kasir)
 */
export function requireRole(user, allowedRoles = []) {
  if (!user || !user.role) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki hak akses untuk tindakan ini');
  }
}

/**
 * Menegakkan Hak Akses Cabang
 */
export function requireBranchAccess(user, targetBranchId) {
  if (user.role === 'admin') return; // Admin memiliki akses ke seluruh cabang
  if (user.branch_id !== targetBranchId) {
    throw new ApiError(403, 'FORBIDDEN_BRANCH', 'Anda hanya memiliki akses ke cabang Anda sendiri');
  }
}

/**
 * Filter data sensitif (cost_price dan laba) sebelum dikirim ke sales dan kasir
 */
export function sanitizeOutputForRole(role, data) {
  if (role === 'admin' || role === 'manajer') {
    return data;
  }

  // Jika sales atau kasir: hilangkan cost_price, hpp, margin, profit, laba
  if (Array.isArray(data)) {
    return data.map(item => cleanSensitiveFields(item));
  } else if (typeof data === 'object' && data !== null) {
    return cleanSensitiveFields(data);
  }
  return data;
}

function cleanSensitiveFields(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const clone = { ...obj };
  delete clone.cost_price;
  delete clone.hpp;
  delete clone.gross_profit;
  delete clone.profit;
  delete clone.laba;
  delete clone.laba_kotor;

  if (Array.isArray(clone.items)) {
    clone.items = clone.items.map(it => cleanSensitiveFields(it));
  }
  return clone;
}
