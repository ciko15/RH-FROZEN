import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const supplierSchema = z.object({
  name: z.string().min(1, 'Nama pemasok wajib diisi'),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  active: z.boolean().optional().default(true)
});

const SUPP_HEADERS = ['id', 'name', 'phone', 'address', 'active'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    // ==========================================
    // GET: Daftar Pemasok (Suppliers)
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Suppliers']);
      const suppliers = (tabs.Suppliers || []).map(s => ({
        ...s,
        active: String(s.active).toUpperCase() === 'TRUE'
      }));
      return res.status(200).json({ ok: true, data: suppliers });
    }

    // ==========================================
    // POST: Tambah Pemasok Baru
    // ==========================================
    if (req.method === 'POST') {
      const data = validateBody(supplierSchema, req.body);
      const newId = crypto.randomUUID();

      const newSupplier = {
        id: newId,
        name: data.name,
        phone: data.phone,
        address: data.address,
        active: data.active ? 'TRUE' : 'FALSE'
      };

      await appendRow('Suppliers', newSupplier, SUPP_HEADERS);
      await logAudit(authUser.id, 'CREATE_SUPPLIER', { id: newId, name: data.name });

      return res.status(201).json({
        ok: true,
        data: newSupplier,
        message: 'Pemasok berhasil ditambahkan'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
