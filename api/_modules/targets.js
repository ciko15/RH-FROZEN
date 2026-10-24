import { z } from 'zod';
import { authenticate } from './_lib/auth.js';
import { requireRole } from './_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from './_lib/sheets.js';
import { validateBody } from './_lib/validate.js';
import { handleApiError, ApiError } from './_lib/errors.js';

const setTargetSchema = z.object({
  sales_id: z.string().min(1, 'ID Sales wajib disertakan'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan harus yyyy-mm'),
  target: z.number().min(0, 'Target penjualan tidak boleh negatif')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Target Sales
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['SalesTargets', 'Users', 'Invoices', 'Config', 'Branches']);
      const targets = tabs.SalesTargets || [];
      let users = (tabs.Users || []).filter(u => u.role === 'sales');
      const branches = tabs.Branches || [];
      const invoices = tabs.Invoices || [];
      const configs = tabs.Config || [];
      const commissionPercent = parseFloat(configs.find(c => c.key === 'commission_percent')?.value || '0');

      // Filter berdasarkan hak akses dan lokasi cabang / toko:
      // Jika role adalah 'sales', hanya tampilkan data sales miliknya sendiri (atau cabang tokonya)
      // Jika user memiliki branch_id dan bukan admin, batasi hanya sales di cabang toko yang sama
      if (authUser.role === 'sales') {
        users = users.filter(u => u.id === authUser.id);
      } else if (authUser.role !== 'admin' && authUser.branch_id) {
        users = users.filter(u => u.branch_id === authUser.branch_id);
      } else if (req.query.branch_id) {
        // Admin / Manajer memfilter berdasarkan cabang tertentu jika dikirimkan query
        users = users.filter(u => u.branch_id === req.query.branch_id);
      }

      const month = req.query.month || new Date().toISOString().substring(0, 7);

      const mapped = users.map(u => {
        const t = targets.find(item => item.sales_id === u.id && item.month === month);
        const targetAmount = t ? parseFloat(t.target || 0) : 0;
        const branchObj = branches.find(b => b.id === u.branch_id);

        // Hitung realisasi penjualan faktur lunas bulan ini
        const salesInvoices = invoices.filter(inv => {
          const invoiceDate = inv.invoice_date || inv.tx_date || '';
          return inv.sales_id === u.id && invoiceDate.startsWith(month);
        });
        const totalSales = salesInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
        const paidSales = salesInvoices
          .filter(inv => parseFloat(inv.remaining || 0) <= 0)
          .reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);

        const percent = targetAmount > 0 ? Math.min(Math.round((totalSales / targetAmount) * 100), 100) : 0;
        const commission = (paidSales * commissionPercent) / 100;

        return {
          sales_id: u.id,
          sales_name: u.full_name,
          username: u.username,
          branch_id: u.branch_id || '',
          branch_name: branchObj ? branchObj.name : (u.branch_id || ''),
          month: month,
          target: targetAmount,
          total_sales: totalSales,
          paid_sales: paidSales,
          percent: percent,
          commission: commission
        };
      });

      return res.status(200).json({
        ok: true,
        data: mapped,
        commission_percent: commissionPercent
      });
    }

    // ==========================================
    // POST: Atur Target Bulanan Sales (Admin / Manajer)
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer']);
      const data = validateBody(setTargetSchema, req.body);

      const tabs = await getTabsBatch(['SalesTargets']);
      const targets = tabs.SalesTargets || [];
      const existing = targets.find(t => t.sales_id === data.sales_id && t.month === data.month);
      const headers = ['sales_id', 'month', 'target'];

      if (existing) {
        existing.target = data.target;
        await updateRow('SalesTargets', existing._rowIndex, existing, headers);
      } else {
        await appendRow('SalesTargets', {
          sales_id: data.sales_id,
          month: data.month,
          target: data.target
        }, headers);
      }

      return res.status(200).json({
        ok: true,
        message: 'Target penjualan sales berhasil disimpan'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
