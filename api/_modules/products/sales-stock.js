import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { handleApiError } from '../_lib/errors.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Hanya metode GET yang diizinkan' });
  }

  try {
    const authUser = await authenticate(req);
    requireRole(authUser, ['admin', 'manajer', 'sales', 'kasir']);

    const tabs = await getTabsBatch(['SalesStock', 'Products', 'Users']);
    const salesStocks = tabs.SalesStock || [];
    const products = (tabs.Products || []).filter(p => p.active !== false && String(p.active).toUpperCase() !== 'FALSE');
    const users = tabs.Users || [];

    // Tentukan sales yang dilihat
    let targetSalesId = req.query.sales_id;
    if (authUser.role === 'sales') {
      targetSalesId = authUser.id;
    }

    const targetUser = users.find(u => u.id === targetSalesId);
    const salesName = targetUser ? (targetUser.name || targetUser.full_name) : (targetSalesId || '-');

    // Ambil data stok sales spesifik
    const myStockMap = new Map();
    salesStocks
      .filter(s => !targetSalesId || s.sales_id === targetSalesId)
      .forEach(s => {
        myStockMap.set(s.product_id, {
          stock: parseInt(s.stock || 0, 10),
          updated_at: s.updated_at || ''
        });
      });

    // Setiap produk yang ada di master admin ditampilkan ke sales, jika belum ada di SalesStock maka stok = 0
    const result = products.map(prod => {
      const myData = myStockMap.get(prod.id);
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
        stock: myData ? myData.stock : 0,
        admin_stock: parseInt(prod.stock || 0, 10),
        updated_at: myData ? myData.updated_at : ''
      };
    });

    return res.status(200).json({
      ok: true,
      data: result
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
