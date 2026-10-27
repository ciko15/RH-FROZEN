import { z } from 'zod';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
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
      const result = await callGas('createReturn', {
        invoice_id: data.invoice_id,
        items: data.items,
        reason: data.reason,
        user_id: authUser.id,
        branch_id: authUser.branch_id || ''
      });

      // Ambil data terkait untuk perhitungan finansial dan nota retur
      const tabs = await getTabsBatch(['Products', 'Invoices', 'InvoiceItems', 'Customers']);
      const products = tabs.Products || [];
      const invoice = (tabs.Invoices || []).find(inv => inv.id === data.invoice_id);
      const invoiceItems = (tabs.InvoiceItems || []).filter(ii => ii.invoice_id === data.invoice_id);
      const customer = invoice ? (tabs.Customers || []).find(c => c.id === invoice.customer_id) : null;

      const enrichedItems = data.items.map(it => {
        const invItem = invoiceItems.find(ii => ii.product_id === it.product_id);
        const prod = products.find(p => p.id === it.product_id);
        // Prioritaskan harga dari invoice pembelian asli
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

      // Hitung Pemotongan Bon vs Pengembalian Uang Tunai
      // Sisa piutang pada invoice
      const invoiceRemaining = parseFloat(invoice?.remaining || 0);
      const debtDeduction = Math.min(Math.max(0, invoiceRemaining), totalAmount);
      const cashRefund = Math.max(0, totalAmount - debtDeduction);

      const now = new Date();
      const todayStr = now.toISOString().substring(0, 10);
      const timeStr = now.toTimeString().substring(0, 8);
      const retNo = result?.return_no || result?.data?.return_no || 'RET';

      // 1. Jika ada sisa bon/piutang yang dipotong:
      if (debtDeduction > 0) {
        if (invoice) {
          const newRemaining = Math.max(0, invoiceRemaining - debtDeduction);
          invoice.remaining = newRemaining;
          if (invoice._rowIndex) {
            const INVOICE_HEADERS = ['id', 'invoice_no', 'tx_date', 'tx_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by'];
            try {
              await updateRow('Invoices', invoice._rowIndex, invoice, INVOICE_HEADERS);
            } catch (err) {
              console.warn('[Returns] Gagal update sisa invoice:', err.message);
            }
          }
        }

        if (customer) {
          const currentBal = parseFloat(customer.balance || 0);
          customer.balance = Math.max(0, currentBal - debtDeduction);
          if (customer._rowIndex) {
            const CUSTOMER_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
            try {
              await updateRow('Customers', customer._rowIndex, customer, CUSTOMER_HEADERS);
            } catch (err) {
              console.warn('[Returns] Gagal update saldo pelanggan:', err.message);
            }
          }
        }
      }

      // 2. Jika ada uang kas yang harus dikembalikan (uang keluar / pengeluaran):
      if (cashRefund > 0) {
        const paymentRow = {
          id: crypto.randomUUID(),
          payment_date: todayStr,
          payment_time: timeStr,
          customer_id: invoice ? invoice.customer_id : '',
          invoice_id: invoice ? invoice.id : '',
          type: 'Pengeluaran',
          amount: cashRefund,
          method: 'Tunai',
          note: `Retur #${retNo} (${invoice ? invoice.invoice_no : 'Ref'})`,
          created_by: authUser.id
        };
        const PAYMENT_HEADERS = ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by'];
        try {
          await appendRow('Payments', paymentRow, PAYMENT_HEADERS);
        } catch (err) {
          console.warn('[Returns] Gagal mencatat kas keluar pengembalian retur:', err.message);
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
