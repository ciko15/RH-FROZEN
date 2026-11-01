import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch, updateRow, appendRow } from '../_lib/sheets.js';
import { clearCache } from '../_lib/cache.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const invoiceId = req.query.id;

    if (!invoiceId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Invoice wajib disertakan');
    }

    const tabs = await getTabsBatch(['Invoices', 'InvoiceItems', 'OrderItems', 'Config', 'Branches', 'Users', 'Customers', 'Returns', 'ReturnItems']);
    const invoices = tabs.Invoices || [];
    const invoice = invoices.find(inv => inv.id === invoiceId);

    if (!invoice) {
      throw new ApiError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');
    }

    // RBAC
    if (authUser.role !== 'admin' && authUser.branch_id && invoice.branch_id !== authUser.branch_id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki hak akses untuk invoice cabang ini');
    }
    if (authUser.role === 'sales' && invoice.sales_id !== authUser.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat melihat invoice milik Anda sendiri');
    }

    const invoiceItems = (tabs.InvoiceItems || []).filter(item => item.invoice_id === invoice.id);
    const items = invoiceItems.length
      ? invoiceItems
      : (tabs.OrderItems || []).filter(item => item.order_id === invoice.order_id);
    const configs = tabs.Config || [];
    const getCfg = k => (configs.find(c => c.key === k)?.value) || '';

    const branch = (tabs.Branches || []).find(b => b.id === invoice.branch_id);
    const sales = (tabs.Users || []).find(u => u.id === invoice.sales_id);
    const customer = (tabs.Customers || []).find(c => c.id === invoice.customer_id);

    // Ambil riwayat retur untuk invoice ini jika ada (baik via invoice_id maupun ref_id)
    const invoiceReturns = (tabs.Returns || []).filter(r => (r.invoice_id === invoice.id || r.ref_id === invoice.id) && r.status !== 'Ditolak');
    const allReturnItems = tabs.ReturnItems || [];
    const enrichedReturns = invoiceReturns.map(r => {
      const items = allReturnItems.filter(ri => ri.return_id === r.id);
      const computedTotal = items.reduce((sum, it) => sum + ((parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0)), 0);
      const directTotal = parseFloat(r.total || 0);
      const finalReturnTotal = directTotal > 0 ? directTotal : computedTotal;
      return {
        ...r,
        total: finalReturnTotal,
        items: items.map(it => ({
          ...it,
          qty: parseInt(it.qty, 10),
          price: parseFloat(it.price)
        }))
      };
    });
    const totalReturnedAmount = enrichedReturns.reduce((sum, r) => sum + r.total, 0);

    // Kumpulkan semua daftar produk reject / retur dari invoice ini
    const rejectItemsSummary = [];
    enrichedReturns.forEach(ret => {
      (ret.items || []).forEach(it => {
        const existing = rejectItemsSummary.find(x => x.product_id === it.product_id);
        if (existing) {
          existing.qty += it.qty;
          existing.total += (it.qty * it.price);
        } else {
          rejectItemsSummary.push({
            product_id: it.product_id,
            name: it.name,
            qty: it.qty,
            price: it.price,
            total: (it.qty * it.price),
            reason: ret.reason || 'Barang Rusak / Reject'
          });
        }
      });
    });

    const rawTotalDue = parseFloat(invoice.total_due || 0);
    const rawPaid = parseFloat(invoice.paid_amount || 0);
    const adjustedTotalDue = Math.max(0, rawTotalDue - totalReturnedAmount);
    const adjustedRemaining = Math.max(0, adjustedTotalDue - rawPaid);
    const cashRefund = Math.max(0, rawPaid - adjustedTotalDue);

    const fullInvoice = {
      ...invoice,
      invoice_date: invoice.invoice_date || invoice.tx_date || '',
      invoice_time: invoice.invoice_time || invoice.tx_time || '',
      customer_phone: customer ? customer.phone : '',
      customer_address: customer ? customer.address : (invoice.customer_address || ''),
      has_return: enrichedReturns.length > 0,
      returns: enrichedReturns,
      reject_items: rejectItemsSummary,
      reject_total_qty: rejectItemsSummary.reduce((s, it) => s + it.qty, 0),
      total_returned_amount: totalReturnedAmount,
      adjusted_total_due: adjustedTotalDue,
      remaining: adjustedRemaining,
      cash_refund: cashRefund,
      config: {
        business_name: getCfg('business_name') || 'RH FROZEN FOOD',
        business_address: getCfg('business_address') || '',
        business_phone: getCfg('business_phone') || '',
        invoice_footer: getCfg('invoice_footer') || ''
      },
      branch_paper_width: branch ? branch.paper_width : 58,
      sales_name: sales ? sales.full_name : '-',
      items: items.map(it => ({
        ...it,
        line_total: (parseInt(it.qty, 10) * parseFloat(it.price)) - parseFloat(it.discount || 0)
      }))
    };

    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, fullInvoice)
      });
    }

    // ==========================================
    // PUT: Edit Data Transaksi Kasir (Invoice)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);

      // Jika sales, hanya boleh mengedit invoice miliknya sendiri
      if (authUser.role === 'sales' && invoice.sales_id !== authUser.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Anda hanya dapat mengedit invoice milik Anda sendiri');
      }

      // Cegah edit jika invoice sudah memiliki retur yang disetujui (agar tidak merusak integritas nota retur)
      if (enrichedReturns.length > 0) {
        throw new ApiError(400, 'HAS_RETURN', 'Transaksi ini memiliki data retur barang. Edit transaksi tidak diizinkan demi menjaga keakuratan retur.');
      }

      const editInvoiceSchema = z.object({
        customer_id: z.string().optional(),
        pay_method: z.enum(['Tunai', 'Transfer', 'Tempo']).optional(),
        paid_amount: z.coerce.number().min(0).optional(),
        note: z.string().optional(),
        items: z.array(z.object({
          product_id: z.string().min(1),
          qty: z.coerce.number().positive('Qty harus positif'),
          price: z.coerce.number().min(0).optional(),
          discount: z.coerce.number().min(0).optional().default(0)
        })).min(1, 'Minimal 1 barang harus dibeli').optional()
      });

      const data = validateBody(editInvoiceSchema, req.body);
      const targetSalesId = invoice.sales_id;

      // Ambil tab-tab yang diperlukan secara segar
      const freshTabs = await getTabsBatch(['Products', 'SalesStock', 'Customers', 'InvoiceItems', 'Payments', 'CustomerPrices'], true);
      const allProducts = freshTabs.Products || [];
      const allSalesStock = freshTabs.SalesStock || [];
      const allCustomers = freshTabs.Customers || [];
      const allPayments = freshTabs.Payments || [];
      const currentInvoiceItems = (freshTabs.InvoiceItems || []).filter(it => it.invoice_id === invoice.id);

      // Customer
      const targetCustomerId = data.customer_id || invoice.customer_id;
      const targetCust = allCustomers.find(c => c.id === targetCustomerId);
      if (!targetCust) {
        throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan');
      }

      // Hitung delta stok dan validasi barang baru jika items diubah
      const salesStockHeaders = ['sales_id', 'product_id', 'stock', 'updated_at'];
      const nowIso = new Date().toISOString();

      let newItems = currentInvoiceItems;
      let newSubtotal = parseFloat(invoice.subtotal || 0);
      let newTotalQty = parseInt(invoice.total_qty || 0, 10);
      let newDiscountTotal = parseFloat(invoice.discount_total || 0);

      if (data.items) {
        // Buat map qty lama: product_id -> oldQty
        const oldQtyMap = {};
        currentInvoiceItems.forEach(it => {
          oldQtyMap[it.product_id] = (oldQtyMap[it.product_id] || 0) + (parseInt(it.qty, 10) || 0);
        });

        // Buat map qty baru: product_id -> newQty
        const newQtyMap = {};
        data.items.forEach(it => {
          newQtyMap[it.product_id] = (newQtyMap[it.product_id] || 0) + parseFloat(it.qty || 0);
        });

        // Cek kecukupan stok sales untuk selisih penambahan barang (deltaQty > 0)
        const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
        for (const pId of allProductIds) {
          const oldQ = oldQtyMap[pId] || 0;
          const newQ = newQtyMap[pId] || 0;
          const delta = newQ - oldQ; // jika positif: perlu stok tambahan dari sales
          if (delta > 0) {
            const ss = allSalesStock.find(s => s.sales_id === targetSalesId && s.product_id === pId);
            const avail = parseFloat(ss?.stock || 0);
            if (avail < delta) {
              const pName = allProducts.find(p => p.id === pId)?.name || pId;
              throw new ApiError(400, 'INSUFFICIENT_STOCK', `Stok ${pName} sales tidak mencukupi untuk penambahan (tersedia: ${avail}, dibutuhkan tambahan: ${delta})`);
            }
          }
        }

        // Terapkan penyesuaian stok sales (SalesStock)
        for (const pId of allProductIds) {
          const oldQ = oldQtyMap[pId] || 0;
          const newQ = newQtyMap[pId] || 0;
          const delta = newQ - oldQ; // positif = barang keluar dari sales, negatif = barang kembali ke sales
          if (delta !== 0) {
            const ssRow = allSalesStock.find(s => s.sales_id === targetSalesId && s.product_id === pId);
            if (ssRow && ssRow._rowIndex) {
              const curStock = parseFloat(ssRow.stock || 0);
              const updatedStock = Math.max(0, curStock - delta);
              ssRow.stock = updatedStock;
              ssRow.updated_at = nowIso;
              await updateRow('SalesStock', ssRow._rowIndex, ssRow, salesStockHeaders);
            } else if (delta < 0) {
              // Jika row belum ada dan delta negatif (stok kembali)
              await appendRow('SalesStock', {
                sales_id: targetSalesId,
                product_id: pId,
                stock: Math.abs(delta),
                updated_at: nowIso
              }, salesStockHeaders);
            }
          }
        }

        // Hitung ulang rincian items baru
        newSubtotal = 0;
        newTotalQty = 0;
        newDiscountTotal = 0;
        const custPrices = freshTabs.CustomerPrices || [];

        newItems = data.items.map(it => {
          const prod = allProducts.find(p => p.id === it.product_id);
          let price = it.price !== undefined ? parseFloat(it.price) : 0;
          if (it.price === undefined) {
            const cp = custPrices.find(c => c.customer_id === targetCustomerId && c.product_id === it.product_id);
            if (cp && cp.price !== '') price = parseFloat(cp.price);
            else price = parseFloat(prod?.price || 0);
          }
          const discount = parseFloat(it.discount || 0);
          const qty = parseFloat(it.qty || 0);
          const lineTotal = (price * qty) - discount;

          newSubtotal += lineTotal;
          newTotalQty += qty;
          newDiscountTotal += discount;

          return {
            id: it.id || crypto.randomUUID(),
            invoice_id: invoice.id,
            product_id: it.product_id,
            name: prod?.name || it.name || 'Produk',
            qty: qty,
            price: price,
            discount: discount,
            cost_price: parseFloat(prod?.cost_price || 0)
          };
        });

        // Update / Timpa InvoiceItems di spreadsheet
        const INVOICE_ITEM_HEADERS = ['id', 'invoice_id', 'product_id', 'name', 'qty', 'price', 'discount', 'cost_price'];
        for (let i = 0; i < Math.max(currentInvoiceItems.length, newItems.length); i++) {
          if (i < currentInvoiceItems.length && i < newItems.length) {
            // Update baris yang sudah ada
            const oldRow = currentInvoiceItems[i];
            const updatedItem = { ...newItems[i], id: oldRow.id };
            newItems[i].id = oldRow.id;
            if (oldRow._rowIndex) {
              await updateRow('InvoiceItems', oldRow._rowIndex, updatedItem, INVOICE_ITEM_HEADERS);
            }
          } else if (i < currentInvoiceItems.length && i >= newItems.length) {
            // Baris item lama dihapus (dikosongkan / dinolkan qty)
            const oldRow = currentInvoiceItems[i];
            if (oldRow._rowIndex) {
              await updateRow('InvoiceItems', oldRow._rowIndex, {
                id: oldRow.id,
                invoice_id: invoice.id,
                product_id: oldRow.product_id,
                name: oldRow.name + ' (Dihapus)',
                qty: 0,
                price: 0,
                discount: 0,
                cost_price: 0
              }, INVOICE_ITEM_HEADERS);
            }
          } else if (i >= currentInvoiceItems.length && i < newItems.length) {
            // Tambahkan baris baru
            await appendRow('InvoiceItems', newItems[i], INVOICE_ITEM_HEADERS);
          }
        }
      }

      // Hitung Total Tagihan & Sisa Hutang
      const prevBal = parseFloat(invoice.previous_balance || 0);
      const newTotalDue = newSubtotal + prevBal;

      const newPayMethod = data.pay_method !== undefined ? data.pay_method : (invoice.pay_method || 'Tunai');
      let newPaid = data.paid_amount !== undefined ? parseFloat(data.paid_amount) : parseFloat(invoice.paid_amount || 0);
      if (newPayMethod === 'Tempo') {
        newPaid = 0;
      }
      const newRemaining = Math.max(0, newTotalDue - newPaid);

      // Hitung selisih sisa hutang pada pelanggan
      const oldRemaining = parseFloat(invoice.remaining || 0);
      const remainingDelta = newRemaining - oldRemaining; // jika bertambah, hutang customer naik

      // Update data Customer jika berubah
      const oldCustId = invoice.customer_id;
      if (oldCustId !== targetCustomerId) {
        // Customer diganti: kurangi balance customer lama, tambahkan ke customer baru
        const oldCust = allCustomers.find(c => c.id === oldCustId);
        if (oldCust && oldCust._rowIndex) {
          oldCust.balance = Math.max(0, parseFloat(oldCust.balance || 0) - oldRemaining);
          await updateRow('Customers', oldCust._rowIndex, oldCust, ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active']);
        }
        if (targetCust && targetCust._rowIndex) {
          targetCust.balance = Math.max(0, parseFloat(targetCust.balance || 0) + newRemaining);
          await updateRow('Customers', targetCust._rowIndex, targetCust, ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active']);
        }
      } else {
        // Customer tetap sama: sesuaikan selisih balance
        if (remainingDelta !== 0 && targetCust && targetCust._rowIndex) {
          targetCust.balance = Math.max(0, parseFloat(targetCust.balance || 0) + remainingDelta);
          await updateRow('Customers', targetCust._rowIndex, targetCust, ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active']);
        }
      }

      // Update / Sync data record Payments terkait invoice ini jika ada
      const invPayment = allPayments.find(p => p.invoice_id === invoice.id);
      const PAYMENT_HEADERS = ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by'];
      if (invPayment && invPayment._rowIndex) {
        invPayment.amount = newPaid;
        invPayment.method = newPayMethod;
        invPayment.customer_id = targetCustomerId;
        invPayment.note = `Bayar ${invoice.invoice_no}`;
        await updateRow('Payments', invPayment._rowIndex, invPayment, PAYMENT_HEADERS);
      } else if (newPaid > 0) {
        await appendRow('Payments', {
          id: crypto.randomUUID(),
          payment_date: invoice.invoice_date || invoice.tx_date || new Date().toISOString().split('T')[0],
          payment_time: invoice.invoice_time || invoice.tx_time || new Date().toTimeString().split(' ')[0],
          customer_id: targetCustomerId,
          invoice_id: invoice.id,
          type: 'Invoice',
          amount: newPaid,
          method: newPayMethod,
          note: `Bayar ${invoice.invoice_no}`,
          created_by: authUser.id
        }, PAYMENT_HEADERS);
      }

      // Update Invoice baris utama
      const updatedInvoice = {
        ...invoice,
        customer_id: targetCustomerId,
        customer_name: targetCust.name,
        customer_address: targetCust.address || '',
        subtotal: newSubtotal,
        total_qty: newTotalQty,
        discount_total: newDiscountTotal,
        total_due: newTotalDue,
        paid_amount: newPaid,
        remaining: newRemaining,
        pay_method: newPayMethod,
        note: data.note !== undefined ? data.note : (invoice.note || '')
      };

      const INVOICE_HEADERS = ['id', 'invoice_no', 'tx_date', 'tx_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by'];
      await updateRow('Invoices', invoice._rowIndex, updatedInvoice, INVOICE_HEADERS);

      clearCache();
      await logAudit(authUser.id, 'UPDATE_INVOICE', {
        invoice_id: invoice.id,
        invoice_no: invoice.invoice_no,
        customer_id: targetCustomerId,
        total_due: newTotalDue,
        remaining: newRemaining
      });

      return res.status(200).json({
        ok: true,
        data: updatedInvoice,
        message: 'Transaksi invoice berhasil diperbarui'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}

