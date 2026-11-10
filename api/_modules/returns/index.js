import crypto from 'crypto';
import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
import { callGas } from '../_lib/gas.js';
import { validateBody } from '../_lib/validate.js';
import { checkIdempotency, saveIdempotency } from '../_lib/idempotency.js';
import { handleApiError, ApiError } from '../_lib/errors.js';

const returnItemSchema = z.object({
  product_id: z.string().min(1, 'ID barang wajib diisi'),
  qty: z.number().int().positive('Qty harus bilangan bulat positif')
});

const createReturnSchema = z.object({
  invoice_id: z.string().optional().default(''),
  return_action: z.enum(['RETURN_STOCK', 'DAMAGED_STOCK', 'CUSTOMER_RETURN']).optional().default('RETURN_STOCK'),
  reason: z.string().min(1, 'Alasan wajib diisi').trim(),
  items: z.array(returnItemSchema).min(1, 'Minimal pilih 1 barang')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'kasir', 'sales']);

    // GET: Daftar Retur (sales hanya miliknya)
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Returns', 'ReturnItems', 'Users', 'Invoices', 'Payments']);
      let returns = tabs.Returns || [];
      const returnItems = tabs.ReturnItems || [];
      const users = tabs.Users || [];
      const invoices = tabs.Invoices || [];
      const payments = tabs.Payments || [];

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
        const totalAmount = items.reduce((s, it) => s + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);

        // Ambil pencatatan pengeluaran kas jika ada
        const refundPayment = payments.find(p =>
          p.type === 'Pengeluaran' && (
            (r.return_no && p.note && p.note.includes(r.return_no)) ||
            (inv && p.invoice_id === inv.id)
          )
        );
        const cashRefund = refundPayment ? parseFloat(refundPayment.amount || 0) : 0;
        const debtDeduction = Math.max(0, totalAmount - cashRefund);

        return {
          ...r,
          status: r.status || 'Menunggu',
          sales_name: sales ? sales.name : '-',
          approved_by_name: approver ? approver.name : '',
          invoice_no: inv ? inv.invoice_no : '',
          customer_name: inv ? inv.customer_name : '-',
          total_qty: parseInt(r.total_qty || items.reduce((s, it) => s + (parseInt(it.qty, 10) || 0), 0), 10),
          total_amount: totalAmount,
          cash_refund: cashRefund,
          debt_deduction: debtDeduction,
          items: items.map(it => ({ ...it, qty: parseInt(it.qty, 10), price: parseFloat(it.price || 0) }))
        };
      });

      enriched.sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ ok: true, data: enriched });
    }

    // POST: Ajukan Retur (status Menunggu, stok belum berubah, pengembalian dana/potong bon dicatat)
    if (req.method === 'POST') {
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await checkIdempotency(idempotencyKey);
        if (cached) return res.status(200).json(cached);
      }

      const data = validateBody(createReturnSchema, req.body);

      // Muat tabs yang diperlukan untuk validasi dan pemrosesan POST
      const tabs = await getTabsBatch(['Products', 'SalesStock', 'Invoices', 'InvoiceItems', 'Returns', 'ReturnItems', 'Customers']);
      const products = tabs.Products || [];

      // =========================================================================
      // CABANG 1: PENGEMBALIAN BARANG SALES KE ADMIN (STOK KEMBALI / BARANG RUSAK)
      // =========================================================================
      if (data.return_action === 'RETURN_STOCK' || data.return_action === 'DAMAGED_STOCK' || !data.invoice_id) {
        const returnAction = data.return_action || 'RETURN_STOCK';
        const salesId = authUser.id;
        const salesStocks = tabs.SalesStock || [];

        // Validasi: Qty yang dikembalikan tidak boleh melebihi stok yang saat ini dipegang sales
        for (const item of data.items) {
          const prod = products.find(p => p.id === item.product_id);
          if (!prod) throw new ApiError(400, 'BAD_REQUEST', `Produk ID ${item.product_id} tidak ditemukan`);
          const ss = salesStocks.find(s => s.sales_id === salesId && s.product_id === item.product_id);
          const currentSalesStock = parseInt(ss?.stock || 0, 10);
          if (item.qty > currentSalesStock) {
            throw new ApiError(400, 'INSUFFICIENT_STOCK', `Stok ${prod.name} di sales (${currentSalesStock} pcs) tidak cukup untuk mengembalikan ${item.qty} pcs`);
          }
        }

        const enrichedItems = data.items.map(it => {
          const prod = products.find(p => p.id === it.product_id);
          return {
            product_id: it.product_id,
            name: prod ? prod.name : 'Produk',
            qty: it.qty,
            price: parseFloat(prod?.cost_price || prod?.price || 0),
            line_total: it.qty * parseFloat(prod?.cost_price || prod?.price || 0)
          };
        });

        // Panggil GAS untuk simpan record Returns (type: RETURN_STOCK atau DAMAGED_STOCK)
        let result;
        try {
          result = await callGas('createReturn', {
            invoice_id: '',
            return_action: returnAction,
            items: data.items,
            reason: data.reason,
            user_id: salesId,
            branch_id: authUser.branch_id || ''
          });
        } catch (gasErr) {
          console.warn('[GAS RETURN FALLBACK] Simpan langsung ke sheet:', gasErr.message);
          const returnId = crypto.randomUUID();
          const today = new Date();
          const dateStr = today.toISOString().substring(0, 10);
          const ymd = dateStr.replace(/-/g, '');
          const returnNo = `RET-${authUser.branch_id || 'BR'}-${ymd}-${String(Math.floor(Math.random() * 900) + 100)}`;
          const totalQty = data.items.reduce((s, it) => s + it.qty, 0);

          const returnRow = {
            id: returnId,
            return_no: returnNo,
            type: returnAction,
            ref_id: '',
            sales_id: salesId,
            branch_id: authUser.branch_id || '',
            date: dateStr,
            reason: data.reason,
            status: 'Menunggu',
            approved_by: '',
            approved_at: '',
            total_qty: totalQty,
            user_id: salesId
          };
          await appendRow('Returns', returnRow, ['id', 'return_no', 'type', 'ref_id', 'sales_id', 'branch_id', 'date', 'reason', 'status', 'approved_by', 'approved_at', 'total_qty', 'user_id']);

          for (const it of enrichedItems) {
            await appendRow('ReturnItems', {
              id: crypto.randomUUID(),
              return_id: returnId,
              product_id: it.product_id,
              name: it.name,
              qty: it.qty,
              price: it.price
            }, ['id', 'return_id', 'product_id', 'name', 'qty', 'price']);
          }
          result = returnRow;
        }

        try { clearCache(); } catch (e) {}

        const resPayload = {
          ok: true,
          data: {
            ...(result || {}),
            return_action: returnAction,
            reason: data.reason,
            items: enrichedItems,
            total_qty: data.items.reduce((s, it) => s + it.qty, 0)
          },
          message: returnAction === 'DAMAGED_STOCK'
            ? 'Pengajuan barang rusak berhasil dikirim, menunggu persetujuan admin'
            : 'Pengajuan pengembalian stok ke admin berhasil dikirim, menunggu persetujuan admin'
        };
        if (idempotencyKey) await saveIdempotency(idempotencyKey, resPayload);
        return res.status(201).json(resPayload);
      }

      // =========================================================================
      // CABANG 2: RETUR DARI PELANGGAN ATAS FAKTUR TERTENTU (CUSTOMER RETURN)
      // =========================================================================
      const invoice = (tabs.Invoices || []).find(inv => inv.id === data.invoice_id);
      if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');

      const invoiceItems = (tabs.InvoiceItems || []).filter(ii => ii.invoice_id === data.invoice_id);
      const prevReturns = (tabs.Returns || []).filter(r => (r.invoice_id === invoice.id || r.ref_id === invoice.id) && r.status !== 'Ditolak');
      const allReturnItems = tabs.ReturnItems || [];

      // Validasi item: Pastikan barang ada di invoice atau produk master
      for (const item of data.items) {
        const invItem = invoiceItems.find(ii => ii.product_id === item.product_id);
        const prod = products.find(p => p.id === item.product_id);
        if (!invItem && !prod) throw new ApiError(400, 'BAD_REQUEST', `Barang tidak ditemukan`);
      }

      // Panggil GAS untuk simpan record Returns dan ReturnItems
      const result = await callGas('createReturn', {
        invoice_id: data.invoice_id,
        return_action: 'CUSTOMER_RETURN',
        items: data.items,
        reason: data.reason,
        user_id: authUser.id,
        branch_id: authUser.branch_id || ''
      });

      const customer = (tabs.Customers || []).find(c => c.id === invoice.customer_id);

      const enrichedItems = data.items.map(it => {
        const invItem = invoiceItems.find(ii => ii.product_id === it.product_id);
        const prod = products.find(p => p.id === it.product_id);
        const price = invItem ? parseFloat(invItem.price || 0) : (prod ? parseFloat(prod.price || 0) : 0);
        const name = invItem ? invItem.name : (prod ? prod.name : 'Produk');
        return {
          product_id: it.product_id,
          name: name,
          qty: it.qty,
          price: price,
          line_total: it.qty * price
        };
      });
      const totalAmount = enrichedItems.reduce((s, it) => s + it.line_total, 0);

      // Rumus Finansial:
      // Hitung akumulasi nilai retur invoice ini termasuk retur yang baru diajukan
      const prevReturnVal = prevReturns.reduce((sum, pr) => {
        const prItems = allReturnItems.filter(ri => ri.return_id === pr.id);
        return sum + prItems.reduce((s, it) => s + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);
      }, 0);
      const totalInvReturnAmount = prevReturnVal + totalAmount;

      const invSubtotal = parseFloat(invoice.subtotal || invoice.total_due || 0);
      const invPaid = parseFloat(invoice.paid_amount || 0);
      // Sisa tagihan baru: bisa bernilai minus jika total retur melebihi tagihan/pembayaran
      const newNetDue = invSubtotal - totalInvReturnAmount;
      const newRemaining = newNetDue - invPaid;
      const newTotalRefund = totalAmount;

      // Update remaining pada invoice (bisa negatif)
      if (invoice._rowIndex) {
        invoice.remaining = newRemaining;
        const INVOICE_HEADERS = ['id', 'invoice_no', 'tx_date', 'tx_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by'];
        try {
          await updateRow('Invoices', invoice._rowIndex, invoice, INVOICE_HEADERS);
        } catch (err) {
          console.warn('[Returns] Gagal update sisa invoice:', err.message);
        }
      }

      // Update saldo piutang customer jika ada pemotongan piutang
      const oldRemaining = parseFloat(invoice.remaining || 0);
      const debtDeduction = oldRemaining > 0 ? Math.min(oldRemaining, totalAmount) : 0;
      const cashRefund = Math.max(0, totalAmount - debtDeduction);

      if (debtDeduction > 0 && customer && customer._rowIndex) {
        const curBal = parseFloat(customer.balance || 0);
        customer.balance = Math.max(0, curBal - debtDeduction);
        const CUSTOMER_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
        try {
          await updateRow('Customers', customer._rowIndex, customer, CUSTOMER_HEADERS);
        } catch (err) {
          console.warn('[Returns] Gagal update saldo pelanggan:', err.message);
        }
      }

      // ATURAN STOK SALES:
      // Barang yang diretur pelanggan KEMBALI MENJADI STOK SALES pemilik invoice
      const targetSalesId = invoice.sales_id || authUser.id;
      const salesStocks = tabs.SalesStock || [];
      const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
      const nowStr = new Date().toISOString();

      for (const it of data.items) {
        const ssRow = salesStocks.find(s => s.sales_id === targetSalesId && s.product_id === it.product_id);
        if (ssRow && ssRow._rowIndex) {
          const currentStock = parseInt(ssRow.stock || 0, 10);
          const newStock = currentStock + it.qty; // Menambah stok sales
          ssRow.stock = newStock;
          ssRow.updated_at = nowStr;
          try {
            await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
          } catch (e) {
            console.warn('[Returns] Gagal update SalesStock:', e.message);
          }
        } else {
          try {
            await appendRow('SalesStock', {
              sales_id: targetSalesId,
              product_id: it.product_id,
              stock: it.qty,
              updated_at: nowStr
            }, salesStockHeaders);
          } catch (e) {
            console.warn('[Returns] Gagal append SalesStock:', e.message);
          }
        }
      }

      // Invalidate cache agar arus kas, piutang, dan invoice langsung sinkron
      try { clearCache(); } catch (e) {}

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
        debt_deduction: debtDeduction,
        cash_refund: cashRefund
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
