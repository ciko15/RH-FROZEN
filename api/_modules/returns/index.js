import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError } from '../_lib/errors.js';

const returnItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.number().int().positive('Qty retur harus bilangan bulat positif')
});

const createReturnSchema = z.object({
  invoice_id: z.string().min(1, 'ID transaksi wajib disertakan'),
  reason: z.string().min(1, 'Alasan retur wajib diisi').trim(),
  items: z.array(returnItemSchema).min(1, 'Minimal retur 1 barang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

    // GET: Daftar Retur (sales hanya miliknya)
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'Users', 'Invoices']);
      let returns = tabs.Returns || [];
      const returnItems = tabs.ReturnItems || [];
      const users = tabs.Users || [];
      const invoices = tabs.Invoices || [];

      if (authUser.role === 'sales') {
        returns = returns.filter(r => r.sales_id === authUser.id || r.user_id === authUser.id);
      }
      if (req.query.status) {
        returns = returns.filter(r => (r.status || 'Menunggu') === req.query.status);
      }

      const enriched = returns.map(r => {
        const sales = users.find(u => u.id === r.sales_id);
        const approver = users.find(u => u.id === r.approved_by);
        const inv = invoices.find(i => i.id === (r.ref_id || r.invoice_id));
        const items = returnItems.filter(ri => ri.return_id === r.id);
        return {
          ...r,
          status: r.status || 'Menunggu',
          sales_name: sales ? sales.name : '-',
          approved_by_name: approver ? approver.name : '',
          invoice_no: inv ? inv.invoice_no : '',
          customer_name: inv ? inv.customer_name : '-',
          total_qty: parseInt(r.total_qty || items.reduce((s, it) => s + (parseInt(it.qty, 10) || 0), 0), 10),
          items: items.map(it => ({ ...it, qty: parseInt(it.qty, 10), price: parseFloat(it.price || 0) }))
        };
      });

      enriched.sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ ok: true, data: enriched });
    }

    // POST: Ajukan Retur (status Menunggu, stok belum berubah)
    if (req.method === 'POST') {
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await checkIdempotency(idempotencyKey);
        if (cached) return res.status(200).json(cached);
      }

      const data = validateBody(createReturnSchema, req.body);
      const result = await callGas('createReturn', {
        invoice_id: data.invoice_id,
        items: data.items,
        reason: data.reason,
        user_id: authUser.id,
        branch_id: authUser.branch_id || ''
      });

      // Ambil rincian produk untuk melengkapi payload nota retur
      const tabs = await getTabsBatch(['Products', 'Invoices']);
      const products = tabs.Products || [];
      const invoice = (tabs.Invoices || []).find(inv => inv.id === data.invoice_id);

      const enrichedItems = data.items.map(it => {
        const prod = products.find(p => p.id === it.product_id);
        const price = prod ? parseFloat(prod.price || 0) : 0;
        return {
          product_id: it.product_id,
          name: prod ? prod.name : 'Produk',
          qty: it.qty,
          price: price,
          line_total: it.qty * price
        };
      });
      const totalAmount = enrichedItems.reduce((s, it) => s + it.line_total, 0);

      const returnData = {
        ...(result || {}),
        invoice_id: data.invoice_id,
        invoice_no: invoice ? invoice.invoice_no : '',
        customer_name: invoice ? invoice.customer_name : '-',
        customer_phone: invoice ? invoice.customer_phone : '',
        reason: data.reason,
        items: enrichedItems,
        total: totalAmount,
        total_qty: data.items.reduce((s, it) => s + it.qty, 0),
        cash_refund: totalAmount
      };

      const responsePayload = {
        ok: true,
        data: returnData,
        message: 'Permintaan retur berhasil diproses'
      };
      if (idempotencyKey) await saveIdempotency(idempotencyKey, responsePayload);
      return res.status(201).json(responsePayload);
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
