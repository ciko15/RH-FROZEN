import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError } from '../_lib/errors.js';

const cashEntrySchema = z.object({
  type: z.enum(['Pemasukan', 'Pengeluaran']),
  category: z.string().min(1, 'Kategori kas wajib dipilih/diisi'),
  amount: z.number().positive('Jumlah uang harus lebih dari 0'),
  method: z.enum(['Tunai', 'Transfer']).default('Tunai'),
  date: z.string().optional(),
  note: z.string().optional().default('')
});

const CASH_HEADERS = ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Arus Kas (Pemasukan & Pengeluaran)
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Payments', 'Invoices', 'Customers']);
      let payments = tabs.Payments || [];
      const invoices = tabs.Invoices || [];
      const customers = tabs.Customers || [];

      // RBAC
      if (authUser.role !== 'admin' && authUser.branch_id) {
        const branchInvoiceIds = new Set(invoices.filter(i => i.branch_id === authUser.branch_id).map(i => i.id));
        payments = payments.filter(p => branchInvoiceIds.has(p.invoice_id) || p.created_by === authUser.id);
      }
      if (authUser.role === 'sales') {
        const myInvoiceIds = new Set(invoices.filter(i => i.sales_id === authUser.id).map(i => i.id));
        payments = payments.filter(p => myInvoiceIds.has(p.invoice_id) || p.created_by === authUser.id);
      }

      // Sort tanggal terbaru
      const list = payments.map(p => {
        let title = p.type || 'Kas';
        let detail = p.note || '-';
        if (p.type === 'Invoice') {
          title = 'Penjualan Kasir';
        } else if (p.type === 'Piutang') {
          const cust = customers.find(c => c.id === p.customer_id);
          title = `Pelunasan Piutang (${cust?.name || 'Pelanggan'})`;
        } else if (p.type === 'Pengeluaran') {
          title = `Pengeluaran: ${p.note || 'Operasional'}`;
        } else if (p.type === 'Pemasukan') {
          title = `Kas Masuk: ${p.note || 'Lain-lain'}`;
        }

        const isExpense = p.type === 'Pengeluaran';

        return {
          id: p.id,
          date: p.payment_date,
          time: p.payment_time,
          type: isExpense ? 'Pengeluaran' : 'Pemasukan',
          raw_type: p.type,
          title,
          amount: parseFloat(p.amount) || 0,
          method: p.method || 'Tunai',
          note: p.note || '',
          created_by: p.created_by || ''
        };
      }).sort((a, b) => {
        const dtA = `${a.date || ''} ${a.time || ''}`;
        const dtB = `${b.date || ''} ${b.time || ''}`;
        return dtB.localeCompare(dtA);
      });

      // Hitung ringkasan
      const totalMasuk = list.filter(item => item.type === 'Pemasukan').reduce((s, it) => s + it.amount, 0);
      const totalKeluar = list.filter(item => item.type === 'Pengeluaran').reduce((s, it) => s + it.amount, 0);
      const saldo = totalMasuk - totalKeluar;

      return res.status(200).json({
        ok: true,
        data: {
          summary: {
            total_masuk: totalMasuk,
            total_keluar: totalKeluar,
            saldo: saldo
          },
          items: list
        }
      });
    }

    // ==========================================
    // POST: Catat Uang Masuk / Uang Keluar Bebas
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer', 'kasir']);

      const data = validateBody(cashEntrySchema, req.body);
      const now = new Date();
      const dateStr = data.date || now.toISOString().substring(0, 10);
      const timeStr = now.toTimeString().substring(0, 8);
      const newId = `CASH-${Date.now()}`;

      const noteText = data.note ? `[${data.category}] ${data.note}` : `[${data.category}]`;

      const newRow = {
        id: newId,
        payment_date: dateStr,
        payment_time: timeStr,
        customer_id: '',
        invoice_id: '',
        type: data.type, // 'Pemasukan' atau 'Pengeluaran'
        amount: data.amount,
        method: data.method,
        note: noteText,
        created_by: authUser.id
      };

      await appendRow('Payments', newRow, CASH_HEADERS);

      return res.status(201).json({
        ok: true,
        data: newRow,
        message: `${data.type} sebesar Rp ${data.amount.toLocaleString('id-ID')} berhasil dicatat`
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
