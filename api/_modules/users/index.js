import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const createUserSchema = z.object({
  username: z.string()
    .min(8, 'Username minimal 8 karakter')
    .max(20, 'Username maksimal 20 karakter')
    .regex(/^[a-z0-9._]+$/, 'Username hanya boleh huruf kecil, angka, titik, dan underscore')
    .trim(),
  full_name: z.string().min(1, 'Nama lengkap wajib diisi').trim(),
  role: z.enum(['admin', 'manajer', 'sales', 'kasir']),
  branch_id: z.string().optional().default(''),
  password: z.string().min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
    .regex(/[0-9]/, 'Password harus mengandung angka')
});

const USER_HEADERS = ['id', 'username', 'full_name', 'role', 'branch_id', 'password_hash', 'active', 'must_change_password', 'token_version', 'failed_count', 'locked_until', 'created_at', 'last_login_at'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Seluruh User
    // ==========================================
    if (req.method === 'GET') {
      requireRole(authUser, ['admin', 'manajer']);
      const tabs = await getTabsBatch(['Users', 'Branches']);
      const users = tabs.Users || [];
      const branches = tabs.Branches || [];

      const search = (req.query.search || '').toLowerCase().trim();
      const roleFilter = req.query.role;
      const branchFilter = req.query.branch_id;

      let filtered = users.map(u => {
        const br = branches.find(b => b.id === u.branch_id);
        return {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          role: u.role,
          branch_id: u.branch_id,
          branch_name: br ? br.name : (u.role === 'admin' ? 'Semua Cabang' : '-'),
          active: String(u.active).toUpperCase() === 'TRUE',
          created_at: u.created_at,
          last_login_at: u.last_login_at
        };
      });

      if (search) {
        filtered = filtered.filter(u =>
          (u.username && u.username.toLowerCase().includes(search)) ||
          (u.full_name && u.full_name.toLowerCase().includes(search))
        );
      }
      if (roleFilter && roleFilter !== 'Semua') {
        filtered = filtered.filter(u => u.role === roleFilter);
      }
      if (branchFilter && branchFilter !== 'Semua') {
        filtered = filtered.filter(u => u.branch_id === branchFilter);
      }

      return res.status(200).json({ ok: true, data: filtered });
    }

    // ==========================================
    // POST: Tambah User Baru
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin']);
      const data = validateBody(createUserSchema, req.body);

      // Non-admin wajib memilih cabang
      if (data.role !== 'admin' && !data.branch_id) {
        throw new ApiError(400, 'BRANCH_REQUIRED', 'Cabang wajib dipilih untuk peran selain admin');
      }

      const tabs = await getTabsBatch(['Users']);
      const users = tabs.Users || [];

      // Cek keunikan username
      const existing = users.find(u => u.username && u.username.toLowerCase() === data.username.toLowerCase());
      if (existing) {
        throw new ApiError(409, 'USERNAME_EXISTS', `Username '${data.username}' sudah digunakan`);
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(data.password, salt);

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newUser = {
        id: newId,
        username: data.username.toLowerCase(),
        full_name: data.full_name,
        role: data.role,
        branch_id: data.role === 'admin' ? '' : data.branch_id,
        password_hash: passwordHash,
        active: 'TRUE',
        must_change_password: 'TRUE', // User baru wajib ganti password
        token_version: 1,
        failed_count: 0,
        locked_until: '',
        created_at: now,
        last_login_at: ''
      };

      await appendRow('Users', newUser, USER_HEADERS);
      await logAudit(authUser.id, 'CREATE_USER', { id: newId, username: data.username, role: data.role });

      return res.status(201).json({
        ok: true,
        data: {
          id: newId,
          username: data.username,
          full_name: data.full_name,
          role: data.role,
          branch_id: newUser.branch_id
        },
        message: 'Pengguna baru berhasil dibuat'
      });
    }

    // ==========================================
    // PUT: Edit Data User (Admin Only)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin']);

      const editUserSchema = z.object({
        id: z.string().min(1, 'ID Pengguna wajib disertakan'),
        full_name: z.string().min(1, 'Nama lengkap wajib diisi').trim(),
        username: z.string()
          .min(4, 'Username minimal 4 karakter')
          .max(30, 'Username maksimal 30 karakter')
          .regex(/^[a-z0-9._]+$/, 'Username hanya boleh huruf kecil, angka, titik, dan underscore')
          .trim()
          .optional(),
        role: z.enum(['admin', 'manajer', 'sales', 'kasir']).optional(),
        branch_id: z.string().optional().default(''),
        password: z.string().min(8, 'Password minimal 8 karakter')
          .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
          .regex(/[0-9]/, 'Password harus mengandung angka')
          .optional()
          .or(z.literal(''))
      });

      const data = validateBody(editUserSchema, req.body);
      const tabs = await getTabsBatch(['Users', 'Branches']);
      const users = tabs.Users || [];
      const branches = tabs.Branches || [];

      const targetUser = users.find(u => u.id === data.id);
      if (!targetUser) {
        throw new ApiError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan');
      }

      // Validasi keunikan username jika diubah
      const newUsername = (data.username || targetUser.username).toLowerCase().trim();
      if (newUsername !== targetUser.username.toLowerCase()) {
        const usernameConflict = users.find(u => u.id !== targetUser.id && u.username && u.username.toLowerCase() === newUsername);
        if (usernameConflict) {
          throw new ApiError(409, 'USERNAME_EXISTS', `Username '${newUsername}' sudah digunakan oleh akun lain`);
        }
      }

      const newRole = data.role || targetUser.role;

      // Aturan: Harus selalu ada minimal 1 admin aktif di sistem
      if (targetUser.role === 'admin' && newRole !== 'admin') {
        const activeAdmins = users.filter(u => u.role === 'admin' && String(u.active).toUpperCase() === 'TRUE');
        if (activeAdmins.length <= 1) {
          throw new ApiError(400, 'MIN_ONE_ADMIN', 'Tidak dapat mengubah peran admin terakhir di sistem');
        }
      }

      // Non-admin wajib memiliki cabang
      let newBranchId = newRole === 'admin' ? '' : (data.branch_id !== undefined ? data.branch_id : targetUser.branch_id);
      if (newRole !== 'admin' && !newBranchId) {
        throw new ApiError(400, 'BRANCH_REQUIRED', 'Cabang wajib dipilih untuk peran selain admin');
      }

      // Jika ada perubahan password baru
      let newPasswordHash = targetUser.password_hash;
      let newTv = parseInt(targetUser.token_version, 10) || 1;
      if (data.password && data.password.trim().length >= 8) {
        const salt = await bcrypt.genSalt(10);
        newPasswordHash = await bcrypt.hash(data.password.trim(), salt);
        newTv += 1; // Invalidate sesi lama jika password diganti
      }

      const updatedUser = {
        ...targetUser,
        username: newUsername,
        full_name: data.full_name,
        role: newRole,
        branch_id: newBranchId,
        password_hash: newPasswordHash,
        token_version: newTv
      };

      await updateRow('Users', targetUser._rowIndex, updatedUser, USER_HEADERS);
      clearCache('Users');

      await logAudit(authUser.id, 'UPDATE_USER', {
        id: targetUser.id,
        username: newUsername,
        role: newRole,
        branch_id: newBranchId
      });

      const br = branches.find(b => b.id === newBranchId);

      return res.status(200).json({
        ok: true,
        data: {
          id: targetUser.id,
          username: newUsername,
          full_name: data.full_name,
          role: newRole,
          branch_id: newBranchId,
          branch_name: br ? br.name : (newRole === 'admin' ? 'Semua Cabang' : '-'),
          active: String(targetUser.active).toUpperCase() === 'TRUE'
        },
        message: 'Data pengguna berhasil diperbarui'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
