import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { handleApiError } from '../_lib/errors.js';
import { CR_CONFIG } from '../_lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode GET yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'sales', 'kasir']);

    const tabs = await getTabsBatch(['SalesStock', 'Products', 'Users', 'Orders', 'OrderItems', 'Invoices', 'InvoiceItems', 'StockMovements']);
    const salesStocks = tabs.SalesStock || [];
    const products = (tabs.Products || []).filter(p => p.active !== false && String(p.active).toUpperCase() !== 'FALSE');
    const users = tabs.Users || [];
    const orders = tabs.Orders || [];
    const orderItems = tabs.OrderItems || [];
    const invoices = tabs.Invoices || [];
    const invoiceItems = tabs.InvoiceItems || [];
    const stockMovements = tabs.StockMovements || [];

    // Tentukan sales yang dilihat
    let targetSalesId = req.query.sales_id;
    if (authUser.role === 'sales') {
      targetSalesId = authUser.id;
    }

    const targetUser = users.find(u => u.id === targetSalesId);
    const salesName = targetUser ? (targetUser.name || targetUser.full_name) : (targetSalesId || '-');

    // Filter periode: hari_ini / minggu_ini / bulan_ini / semua
    const period = req.query.period || 'semua';
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    function isDateInPeriod(dateStr) {
      if (!dateStr || period === 'semua') return true;
      const d = String(dateStr).slice(0, 10);
      if (period === 'hari_ini') {
        return d === todayStr;
      }
      if (period === 'minggu_ini') {
        const itemDate = new Date(d);
        const day = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - day + 1);
        monday.setHours(0, 0, 0, 0);
        return itemDate >= monday;
      }
      if (period === 'bulan_ini') {
        const monthPrefix = todayStr.slice(0, 7);
        return d.startsWith(monthPrefix);
      }
      return true;
    }

    // 1. DIMINTA: Total qty dari pesanan sales (Orders ber-sales_id target, status bukan Dibatalkan)
    const salesOrderIds = new Set(
      orders
        .filter(o => (!targetSalesId || o.sales_id === targetSalesId) && o.status !== CR_CONFIG.STATUS_CANCELLED && isDateInPeriod(o.order_date || o.created_at))
        .map(o => o.id)
    );
    const requestedMap = new Map();
    orderItems
      .filter(oi => salesOrderIds.has(oi.order_id))
      .forEach(oi => {
        const qty = parseInt(oi.qty || 0, 10);
        requestedMap.set(oi.product_id, (requestedMap.get(oi.product_id) || 0) + qty);
      });

    // 2. DIKIRIM: Total qty yang dikirim admin ke sales ini
    // Dihitung dari StockMovements (stock_type === 'SALES' dan change > 0) ATAU dari OrderItems.qty_shipped
    const shippedMap = new Map();
    stockMovements
      .filter(m => (!targetSalesId || m.user_id === targetSalesId) && m.stock_type === 'SALES' && parseInt(m.change, 10) > 0 && isDateInPeriod(m.date_time))
      .forEach(m => {
        const change = parseInt(m.change, 10) || 0;
        shippedMap.set(m.product_id, (shippedMap.get(m.product_id) || 0) + change);
      });

    // Fallback bila StockMovements kosong di periode ini tapi ada OrderItems berstatus Dikirim
    if (shippedMap.size === 0) {
      const shippedOrderIds = new Set(
        orders
          .filter(o => (!targetSalesId || o.sales_id === targetSalesId) && o.status === 'Dikirim' && isDateInPeriod(o.order_date || o.created_at))
          .map(o => o.id)
      );
      orderItems
        .filter(oi => shippedOrderIds.has(oi.order_id))
        .forEach(oi => {
          const shippedQty = parseInt(oi.qty_shipped || oi.qty || 0, 10);
          shippedMap.set(oi.product_id, (shippedMap.get(oi.product_id) || 0) + shippedQty);
        });
    }

    // 3. LAKU / KELUAR: Total qty dari transaksi sales ini (Invoices)
    const salesInvoiceIds = new Set(
      invoices
        .filter(inv => (!targetSalesId || inv.sales_id === targetSalesId) && isDateInPeriod(inv.invoice_date || inv.tx_date))
        .map(inv => inv.id)
    );
    const soldMap = new Map();
    invoiceItems
      .filter(ii => salesInvoiceIds.has(ii.invoice_id))
      .forEach(ii => {
        const qty = parseInt(ii.qty || 0, 10);
        soldMap.set(ii.product_id, (soldMap.get(ii.product_id) || 0) + qty);
      });

    // Ambil data stok sales saat ini dari tab SalesStock
    const myStockMap = new Map();
    salesStocks
      .filter(s => !targetSalesId || s.sales_id === targetSalesId)
      .forEach(s => {
        myStockMap.set(s.product_id, {
          stock: parseInt(s.stock || 0, 10),
          updated_at: s.updated_at || ''
        });
      });

    // Setiap produk dirangkum: Diminta, Dikirim, Laku, Sisa Stok
    const result = products.map(prod => {
      const myData = myStockMap.get(prod.id);
      const currentSalesStock = myData ? myData.stock : 0;
      const totalDiminta = requestedMap.get(prod.id) || 0;
      const totalDikirim = shippedMap.get(prod.id) || 0;
      const totalLaku = soldMap.get(prod.id) || 0;

      // Sisa stok: jika filter semua, gunakan currentSalesStock atau (Dikirim - Laku)
      const sisaStok = period === 'semua' ? currentSalesStock : Math.max(0, totalDikirim - totalLaku);

      let imgVal = typeof prod.image === 'string' ? prod.image.trim() : '';
      if (!imgVal.startsWith('http') && !imgVal.startsWith('data:image/') && !imgVal.startsWith('/')) {
        imgVal = '';
      }

      return {
        sales_id: targetSalesId || authUser.id,
        sales_name: salesName,
        product_id: prod.id,
        product_name: prod.name,
        category: prod.category || 'Frozen Food',
        price: parseFloat(prod.price || 0),
        emoji: prod.emoji || '📦',
        image: imgVal,
        stock: currentSalesStock,
        diminta: totalDiminta,
        dikirim: totalDikirim,
        laku: totalLaku,
        sisa_stok: sisaStok,
        admin_stock: parseInt(prod.stock || 0, 10),
        updated_at: myData ? myData.updated_at : ''
      };
    });

    return res.status(200).json({
      ok: true,
      period,
      data: result
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
