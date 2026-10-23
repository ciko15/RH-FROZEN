import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const branchSchema = z.object({
  name: z.string().min(1, 'Nama cabang wajib diisi'),
  paper_width: z.enum(['58', '80']).default('58'),
  active: z.boolean().optional().default(true)
});

const BRANCH_HEADERS = ['id', 'name', 'active', 'paper_width'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Cabang
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Branches']);
      const branches = (tabs.Branches || []).map(b => ({
        ...b,
        paper_width: parseInt(b.paper_width || 58, 10),
        active: String(b.active).toUpperCase() === 'TRUE'
      }));
      return res.status(200).json({ ok: true, data: branches });
    }

    // ==========================================
    // POST: Tambah Cabang Baru (Admin Only)
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin']);
      const data = validateBody(branchSchema, req.body);

      const newId = `BR-${crypto.randomUUID().substring(0, 4).toUpperCase()}`;
      const newBranch = {
        id: newId,
        name: data.name,
        active: data.active ? 'TRUE' : 'FALSE',
        paper_width: data.paper_width
      };

      await appendRow('Branches', newBranch, BRANCH_HEADERS);
      await logAudit(authUser.id, 'CREATE_BRANCH', { id: newId, name: data.name });

      return res.status(201).json({
        ok: true,
        data: newBranch,
        message: 'Cabang berhasil ditambahkan'
      });
    }

    // ==========================================
    // PUT: Edit Cabang (Admin Only)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin']);
      const editBranchSchema = branchSchema.extend({
        id: z.string().min(1, 'ID Cabang wajib disertakan')
      });
      const data = validateBody(editBranchSchema, req.body);

      const tabs = await getTabsBatch(['Branches']);
      const branches = tabs.Branches || [];
      const branch = branches.find(b => b.id === data.id);

      if (!branch) {
        throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cabang tidak ditemukan');
      }

      const updatedBranch = {
        ...branch,
        name: data.name,
        paper_width: data.paper_width,
        active: data.active !== undefined ? (data.active ? 'TRUE' : 'FALSE') : branch.active
      };

      await updateRow('Branches', branch._rowIndex, updatedBranch, BRANCH_HEADERS);
      await logAudit(authUser.id, 'UPDATE_BRANCH', { id: data.id, name: data.name, active: updatedBranch.active });

      return res.status(200).json({
        ok: true,
        data: {
          ...updatedBranch,
          paper_width: parseInt(updatedBranch.paper_width || 58, 10),
          active: String(updatedBranch.active).toUpperCase() === 'TRUE'
        },
        message: 'Data cabang berhasil diperbarui'
      });
    }

    // ==========================================
    // DELETE: Hapus / Nonaktifkan Cabang (Admin Only)
    // ==========================================
    if (req.method === 'DELETE') {
      requireRole(authUser, ['admin']);
      const branchId = req.query.id || req.body?.id;

      if (!branchId) {
        throw new ApiError(400, 'BAD_REQUEST', 'ID Cabang wajib disertakan');
      }

      const tabs = await getTabsBatch(['Branches', 'Users', 'Customers']);
      const branches = tabs.Branches || [];
      const branch = branches.find(b => b.id === branchId);

      if (!branch) {
        throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cabang tidak ditemukan');
      }

      // Cek apakah cabang masih memiliki user aktif atau customer aktif
      const usersInBranch = (tabs.Users || []).filter(u => u.branch_id === branchId && String(u.active).toUpperCase() === 'TRUE');
      const custInBranch = (tabs.Customers || []).filter(c => c.branch_id === branchId && String(c.active).toUpperCase() === 'TRUE');

      if (usersInBranch.length > 0) {
        throw new ApiError(400, 'BRANCH_IN_USE_USER', `Cabang masih digunakan oleh ${usersInBranch.length} user aktif. Pindahkan user terlebih dahulu.`);
      }

      // Soft delete: set active = 'FALSE'
      const updatedBranch = {
        ...branch,
        active: 'FALSE'
      };

      await updateRow('Branches', branch._rowIndex, updatedBranch, BRANCH_HEADERS);
      await logAudit(authUser.id, 'DELETE_BRANCH', { id: branchId, name: branch.name });

      return res.status(200).json({
        ok: true,
        message: `Cabang ${branch.name} berhasil dihapus/dinonaktifkan`
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
