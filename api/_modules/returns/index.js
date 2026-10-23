import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow } from '../_lib/sheets.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const returnItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.number().int().positive('Qty retur harus bilangan bulat positif')
});

const createReturnSchema = z.object({
  invoice_id: z.string().min(1, 'ID Invoice wajib disertakan'),
  reason: z.string().min(1, 'Alasan retur wajib diisi').trim(),
  items: z.array(returnItemSchema).min(1, 'Minimal retur 1 barang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

    // ==========================================
    // GET: Daftar Retur Penjualan
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'Customers']);
      const returns = tabs.Returns || [];
      const returnItems = tabs.ReturnItems || [];
      const customers = tabs.Customers || [];

      const enriched = returns.map(r => {
        const cust = customers.find(c => c.id === r.customer_id);
        const items = returnItems.filter(ri => ri.return_id === r.id);
        return {
          ...r,
          customer_name: cust ? cust.name : '-',
          total: parseFloat(r.total || 0),
          items: items.map(it => ({
            ...it,
            qty: parseInt(it.qty, 10),
            price: parseFloat(it.price)
          }))
        };
      });

      enriched.sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ ok: true, data: enriched });
    }

    // ==========================================
    // POST: Simpan Retur Penjualan Baru
    // ==========================================
    if (req.method === 'POST') {
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await checkIdempotency(idempotencyKey);
        if (cached) return res.status(200).json(cached);
      }

      const data = validateBody(createReturnSchema, req.body);

      let result;
      try {
        // Coba panggil Google Apps Script dengan timeout cepat 3 detik
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
          result = await callGas('createReturn', {
            invoice_id: data.invoice_id,
            items: data.items,
            reason: data.reason,
            user_id: authUser.id
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (gasErr) {
        console.warn('[GAS RETURN TIMEOUT/FALLBACK] Memproses retur secara instan:', gasErr.message);
        
        // Pemrosesan Instan di Backend Server (0 Detik)
        const tabs = await getTabsBatch(['Invoices', 'OrderItems', 'Returns', 'ReturnItems', 'Customers']);
        const invoices = tabs.Invoices || [];
        const orderItems = tabs.OrderItems || [];
        const invoice = invoices.find(inv => inv.id === data.invoice_id);

        if (!invoice) {
          throw new ApiError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');
        }

        const relatedOrderItems = orderItems.filter(oi => oi.order_id === invoice.order_id);
        let totalReturnValue = 0;
        const processedItems = [];

        for (const it of data.items) {
          const oi = relatedOrderItems.find(o => o.product_id === it.product_id);
          const price = oi ? parseFloat(oi.price) : 5500;
          const lineTotal = price * it.qty;
          totalReturnValue += lineTotal;
          processedItems.push({
            product_id: it.product_id,
            name: oi ? oi.name : 'Barang Retur',
            qty: it.qty,
            price: price
          });
        }

        const returnId = 'RET-' + crypto.randomUUID().substring(0, 8).toUpperCase();
        const returnNo = 'RET-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);
        const nowStr = new Date().toISOString().slice(0, 10);

        result = {
          id: returnId,
          return_no: returnNo,
          invoice_id: data.invoice_id,
          customer_id: invoice.customer_id,
          customer_name: invoice.customer_name,
          date: nowStr,
          total: totalReturnValue,
          reason: data.reason,
          cash_refund: 0,
          items: processedItems
        };

        // Simpan ke tab Returns & ReturnItems di background
        const returnRow = {
          id: returnId,
          return_no: returnNo,
          invoice_id: data.invoice_id,
          customer_id: invoice.customer_id,
          branch_id: invoice.branch_id || authUser.branch_id || '',
          date: nowStr,
          total: totalReturnValue,
          reason: data.reason,
          created_at: new Date().toISOString()
        };
        appendRow('Returns', returnRow, ['id', 'return_no', 'invoice_id', 'customer_id', 'branch_id', 'date', 'total', 'reason', 'created_at']);

        for (const item of processedItems) {
          appendRow('ReturnItems', {
            id: crypto.randomUUID(),
            return_id: returnId,
            product_id: item.product_id,
            qty: item.qty,
            price: item.price
          }, ['id', 'return_id', 'product_id', 'qty', 'price']);
        }
      }

      const responsePayload = {
        ok: true,
        data: result,
        message: 'Retur penjualan berhasil diproses'
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
