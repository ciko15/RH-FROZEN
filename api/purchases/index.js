import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const purchaseItemSchema = z.object({
  product_id: z.string().min(1, 'ID Barang wajib disertakan'),
  qty: z.number().int().positive('Qty harus bilangan bulat positif'),
  cost_price: z.number().positive('Harga beli harus lebih dari 0')
});

const createPurchaseSchema = z.object({
  supplier_id: z.string().min(1, 'Pemasok wajib dipilih'),
  branch_id: z.string().min(1, 'Cabang wajib dipilih'),
  date: z.string().optional(),
  note: z.string().optional().default(''),
  items: z.array(purchaseItemSchema).min(1, 'Minimal beli 1 barang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer']);

    // ==========================================
    // GET: Daftar Pembelian (Purchases)
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Purchases', 'Suppliers', 'Branches']);
      let purchases = tabs.Purchases || [];
      const suppliers = tabs.Suppliers || [];
      const branches = tabs.Branches || [];

      if (authUser.role !== 'admin' && authUser.branch_id) {
        purchases = purchases.filter(p => p.branch_id === authUser.branch_id);
      }

      const mapped = purchases.map(p => {
        const supp = suppliers.find(s => s.id === p.supplier_id);
        const br = branches.find(b => b.id === p.branch_id);
        return {
          ...p,
          supplier_name: supp ? supp.name : '-',
          branch_name: br ? br.name : '-',
          total: parseFloat(p.total || 0)
        };
      });

      mapped.sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ ok: true, data: mapped });
    }

    // ==========================================
    // POST: Catat Pembelian Baru
    // ==========================================
    if (req.method === 'POST') {
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await checkIdempotency(idempotencyKey);
        if (cached) return res.status(200).json(cached);
      }

      const data = validateBody(createPurchaseSchema, req.body);
      const branchId = authUser.role === 'admin' ? data.branch_id : authUser.branch_id;

      const result = await callGas('createPurchase', {
        supplier_id: data.supplier_id,
        branch_id: branchId,
        date: data.date,
        items: data.items,
        note: data.note,
        user_id: authUser.id
      });

      const responsePayload = {
        ok: true,
        data: result,
        message: 'Pembelian berhasil dicatat dan stok bertambah'
      };

      if (idempotencyKey) {
        await saveIdempotency(idempotencyKey, responsePayload);
      }

      return res.status(201).json(responsePayload);
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
