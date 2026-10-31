import { authenticate } from './_lib/auth.js';
import { getTabsBatch } from './_lib/sheets.js';
import { handleApiError } from './_lib/errors.js';

/**
 * GET /api/tracking?mode=daily&date=YYYY-MM-DD
 * GET /api/tracking?mode=monthly&month=YYYY-MM
 *
 * Tracking permintaan stok (STOCK_REQUEST) & pengiriman per sales:
 * - Job permintaan yang masih gantung (status Proses) beserta umurnya
 * - Barang keluar (dikirim) per sales per hari / per bulan
 * - Matriks keaktifan sales (jumlah request, hari aktif, fulfillment rate)
 */

// Normalisasi berbagai format tanggal sheet ke 'YYYY-MM-DD'
function toYmd(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().substring(0, 10);
}

function toTimestamp(val) {
  if (!val) return 0;
  const s = String(val).trim().replace(' ', 'T');
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

function inPeriod(ymd, mode, key) {
  if (!ymd) return false;
  return mode === 'monthly' ? ymd.startsWith(key) : ymd === key;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode GET yang diizinkan' });
    }
    const authUser = await authenticate(req);

    const mode = req.query.mode === 'monthly' ? 'monthly' : 'daily';
    const todayYmd = new Date(Date.now() + 7 * 3600 * 1000).toISOString().substring(0, 10); // WIB
    const key = mode === 'monthly'
      ? (req.query.month || todayYmd.substring(0, 7))
      : (req.query.date || todayYmd);

    const tabs = await getTabsBatch(['Orders', 'OrderItems', 'Users', 'Branches']);
    const users = tabs.Users || [];
    const branches = tabs.Branches || [];
    const allItems = tabs.OrderItems || [];

    let orders = (tabs.Orders || []).filter(o => o.type === 'STOCK_REQUEST');
    if (authUser.role === 'sales') {
      orders = orders.filter(o => o.sales_id === authUser.id);
    } else if (authUser.role !== 'admin' && authUser.branch_id) {
      orders = orders.filter(o => o.branch_id === authUser.branch_id);
    }

    // Index item per order
    const itemsByOrder = new Map();
    for (const it of allItems) {
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id).push(it);
    }

    const now = Date.now();
    const enriched = orders.map(o => {
      const rawItems = itemsByOrder.get(o.id) || [];
      const items = rawItems.map(it => {
        const qty = parseInt(it.qty, 10) || 0;
        const hasShipped = it.qty_shipped !== undefined && it.qty_shipped !== '' && it.qty_shipped !== null;
        const qtyShipped = o.status === 'Dikirim' ? (hasShipped ? (parseInt(it.qty_shipped, 10) || 0) : qty) : 0;
        return { product_id: it.product_id, name: it.name || it.product_id, qty, qty_shipped: qtyShipped };
      });
      const requestYmd = toYmd(o.order_date) || toYmd(o.created_at);
      const shipYmd = o.status === 'Dikirim' ? (toYmd(o.updated_at) || requestYmd) : '';
      const isCancel = o.status === 'Dibatalkan';
      const cancelYmd = isCancel ? (toYmd(o.updated_at) || requestYmd) : '';
      const noteStr = String(o.note || '');
      const batalIdx = noteStr.lastIndexOf('Batal:');
      const cancelReason = isCancel ? (batalIdx >= 0 ? noteStr.substring(batalIdx + 6).trim() : '') || 'Tanpa alasan' : '';
      const canceller = isCancel ? users.find(u => u.id === o.cancelled_by) : null;
      const createdTs = toTimestamp(o.created_at) || toTimestamp(`${requestYmd} ${o.order_time || '00:00:00'}`);
      return {
        id: o.id,
        order_no: o.order_no,
        sales_id: o.sales_id,
        branch_id: o.branch_id,
        status: o.status,
        note: o.note || '',
        request_date: requestYmd,
        request_time: o.order_time || '',
        ship_date: shipYmd,
        cancel_date: cancelYmd,
        cancel_reason: cancelReason,
        cancelled_by: canceller ? canceller.full_name : (o.cancelled_by || ''),
        cancelled_by_role: canceller ? canceller.role : '',
        note_clean: batalIdx >= 0 ? noteStr.substring(0, batalIdx).replace(/\|\s*$/, '').trim() : noteStr,
        created_ts: createdTs,
        age_hours: o.status === 'Proses' && createdTs ? Math.max(0, Math.round((now - createdTs) / 3600000)) : null,
        total_qty: items.reduce((s, i) => s + i.qty, 0),
        total_shipped: items.reduce((s, i) => s + i.qty_shipped, 0),
        items
      };
    });

    // ---- Agregasi per sales ----
    const salesMap = new Map();
    const getSales = (sid, branchId) => {
      if (!salesMap.has(sid)) {
        const u = users.find(x => x.id === sid);
        const bId = u?.branch_id || branchId;
        const br = branches.find(b => b.id === bId);
        salesMap.set(sid, {
          sales_id: sid,
          sales_name: u ? u.full_name : (sid || '-'),
          branch_id: bId || '',
          branch_name: br ? br.name : (bId || ''),
          request_count: 0, request_qty: 0,
          shipped_count: 0, shipped_qty: 0,
          pending_count: 0, pending_qty: 0,
          cancelled_count: 0, cancelled_qty: 0,
          active_days: new Set(),
          last_request: '',
          products: new Map(),
          orders: []
        });
      }
      return salesMap.get(sid);
    };

    // Pastikan semua sales aktif tampil (meski 0 aktivitas) agar terlihat yang pasif
    if (authUser.role !== 'sales') {
      users
        .filter(u => u.role === 'sales' && String(u.active).toUpperCase() !== 'FALSE')
        .filter(u => authUser.role === 'admin' || !authUser.branch_id || u.branch_id === authUser.branch_id)
        .forEach(u => getSales(u.id, u.branch_id));
    }

    const dailyMap = new Map(); // tren harian (mode bulanan)
    
    // Jika mode bulanan, isi semua tanggal dari hari ke-1 sampai hari terakhir bulan agar grafik runtut
    if (mode === 'monthly') {
      const [yr, mo] = key.split('-').map(Number);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${key}-${String(d).padStart(2, '0')}`;
        dailyMap.set(dStr, {
          date: dStr,
          day: d,
          request_qty: 0,
          shipped_qty: 0,
          cancelled_qty: 0,
          request_count: 0,
          shipped_count: 0,
          cancelled_count: 0
        });
      }
    }

    const bumpDay = (d, field, val) => {
      if (!d) return;
      if (!dailyMap.has(d)) {
        const dayNum = parseInt(d.substring(8, 10), 10) || 0;
        dailyMap.set(d, {
          date: d,
          day: dayNum,
          request_qty: 0,
          shipped_qty: 0,
          cancelled_qty: 0,
          request_count: 0,
          shipped_count: 0,
          cancelled_count: 0
        });
      }
      dailyMap.get(d)[field] += val;
    };

    for (const o of enriched) {
      const s = getSales(o.sales_id, o.branch_id);
      const reqIn = inPeriod(o.request_date, mode, key);
      const shipIn = inPeriod(o.ship_date, mode, key);

      if (o.status === 'Proses') {
        s.pending_count++;
        s.pending_qty += o.total_qty;
      }
      if (o.request_date > s.last_request) s.last_request = o.request_date;

      const cancelIn = inPeriod(o.cancel_date, mode, key);
      if (cancelIn) {
        s.cancelled_count++;
        s.cancelled_qty += o.total_qty;
        bumpDay(o.cancel_date, 'cancelled_count', 1);
        bumpDay(o.cancel_date, 'cancelled_qty', o.total_qty);
      }
      if (reqIn) {
        if (o.status !== 'Dibatalkan') {
          s.request_count++;
          s.request_qty += o.total_qty;
          s.active_days.add(o.request_date);
          bumpDay(o.request_date, 'request_qty', o.total_qty);
          bumpDay(o.request_date, 'request_count', 1);
        }
      }
      if (shipIn) {
        s.shipped_count++;
        s.shipped_qty += o.total_shipped;
        bumpDay(o.ship_date, 'shipped_qty', o.total_shipped);
        bumpDay(o.ship_date, 'shipped_count', 1);
        for (const it of o.items) {
          if (!it.qty_shipped) continue;
          const p = s.products.get(it.product_id) || { product_id: it.product_id, name: it.name, qty: 0 };
          p.qty += it.qty_shipped;
          s.products.set(it.product_id, p);
        }
      }
      if (reqIn || shipIn || cancelIn || o.status === 'Proses') {
        s.orders.push(o);
      }
    }

    const sales = Array.from(salesMap.values()).map(s => {
      const fulfillment = s.request_qty > 0 ? Math.round((s.shipped_qty / s.request_qty) * 100) : 0;
      return {
        ...s,
        active_days: s.active_days.size,
        fulfillment_rate: fulfillment,
        cancel_rate: (s.request_count + s.cancelled_count) > 0 ? Math.round((s.cancelled_count / (s.request_count + s.cancelled_count)) * 100) : 0,
        products: Array.from(s.products.values()).sort((a, b) => b.qty - a.qty),
        orders: s.orders.sort((a, b) => b.created_ts - a.created_ts)
      };
    }).sort((a, b) => (b.shipped_qty - a.shipped_qty) || (b.request_count - a.request_count) || (b.pending_count - a.pending_count));

    const pending = enriched
      .filter(o => o.status === 'Proses')
      .map(o => ({ ...o, sales_name: salesMap.get(o.sales_id)?.sales_name || '-' }))
      .sort((a, b) => a.created_ts - b.created_ts);

    const cancelled = enriched
      .filter(o => inPeriod(o.cancel_date, mode, key))
      .map(o => ({ ...o, sales_name: salesMap.get(o.sales_id)?.sales_name || '-' }))
      .sort((a, b) => b.created_ts - a.created_ts);

    // Rekap alasan pembatalan
    const reasonMap = new Map();
    for (const o of cancelled) reasonMap.set(o.cancel_reason, (reasonMap.get(o.cancel_reason) || 0) + 1);
    const cancel_reasons = Array.from(reasonMap, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    const summary = {
      pending_count: pending.length,
      pending_qty: pending.reduce((s, o) => s + o.total_qty, 0),
      pending_over_24h: pending.filter(o => (o.age_hours || 0) >= 24).length,
      request_count: sales.reduce((s, x) => s + x.request_count, 0),
      request_qty: sales.reduce((s, x) => s + x.request_qty, 0),
      shipped_count: sales.reduce((s, x) => s + x.shipped_count, 0),
      shipped_qty: sales.reduce((s, x) => s + x.shipped_qty, 0),
      cancelled_count: cancelled.length,
      cancelled_qty: cancelled.reduce((s, o) => s + o.total_qty, 0),
      active_sales: sales.filter(x => x.request_count > 0).length,
      total_sales: sales.length
    };

    return res.status(200).json({
      ok: true,
      mode,
      period: key,
      summary,
      sales,
      pending,
      cancelled,
      cancel_reasons,
      daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
