import { z } from 'zod';
import { authenticate } from '../../_lib/auth.js';
import { requireRole } from '../../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../../_lib/sheets.js';
import { clearCache } from '../../_lib/cache.js';
import { validateBody } from '../../_lib/validate.js';
import { handleApiError, ApiError } from '../../_lib/errors.js';

const setPriceSchema = z.object({
  product_id: z.string().min(1, 'ID Barang wajib disertakan'),
  price: z.number().positive('Harga harus lebih dari 0')
});

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    // Sales dan kasir boleh melihat harga khusus untuk transaksi kasir
    requireRole(authUser, ['admin', 'manajer', 'sales', 'kasir']);

    const customerId = req.query.id;
    if (!customerId) {
      throw new ApiError(400, 'BAD_REQUEST', 'ID Pelanggan wajib disertakan');
    }

    // ==========================================
    // GET: Harga Khusus Pelanggan Ini
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['CustomerPrices', 'Products']);
      const custPrices = (tabs.CustomerPrices || []).filter(cp => cp.customer_id === customerId);
      const products = tabs.Products || [];

      const mapped = products.map(p => {
        const cp = custPrices.find(c => c.product_id === p.id);
        return {
          product_id: p.id,
          name: p.name,
          default_price: parseFloat(p.price || 0),
          custom_price: cp && cp.price ? parseFloat(cp.price) : null
        };
      });

      return res.status(200).json({ ok: true, data: mapped });
    }

    // ==========================================
    // POST: Simpan / Perbarui Harga Khusus
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer']);
      const data = validateBody(setPriceSchema, req.body);
      const tabs = await getTabsBatch(['CustomerPrices']);
      const custPrices = tabs.CustomerPrices || [];

      const existing = custPrices.find(cp => cp.customer_id === customerId && cp.product_id === data.product_id);
      const headers = ['customer_id', 'product_id', 'price'];

      if (existing) {
        existing.price = data.price;
        await updateRow('CustomerPrices', existing._rowIndex, existing, headers);
      } else {
        await appendRow('CustomerPrices', {
          customer_id: customerId,
          product_id: data.product_id,
          price: data.price
        }, headers);
      }

      clearCache('CustomerPrices');

      return res.status(200).json({ ok: true, message: 'Harga khusus berhasil disimpan' });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
