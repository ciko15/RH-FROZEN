import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole, sanitizeOutputForRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const productSchema = z.object({
  name: z.string().min(1, 'Nama barang wajib diisi'),
  category: z.string().min(1, 'Kategori wajib diisi'),
  price: z.number().positive('Harga jual harus lebih dari 0'),
  cost_price: z.number().min(0, 'Harga beli tidak boleh negatif').optional().default(0),
  stock: z.number().int().min(0, 'Stok awal tidak boleh negatif').optional().default(0),
  emoji: z.string().optional().default('📦'),
  image: z.string().optional().default(''),
  active: z.boolean().optional().default(true)
});

const PROD_HEADERS = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Produk / Stok
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Products', 'Config']);
      let products = tabs.Products || [];
      const configs = tabs.Config || [];
      const lowThreshold = parseInt(configs.find(c => c.key === 'low_stock_threshold')?.value || '100', 10);

      const category = req.query.category;
      const search = (req.query.search || '').toLowerCase().trim();

      if (category && category !== 'Semua') {
        products = products.filter(p => p.category === category);
      }

      if (search) {
        products = products.filter(p => p.name && p.name.toLowerCase().includes(search));
      }

      const mapped = products.map(p => {
        let imgVal = typeof p.image === 'string' ? p.image.trim() : '';
        // Abaikan jika bukan string URL / Data URI base64 yang valid (misal 'TRUE', 'null', dll)
        if (!imgVal.startsWith('http') && !imgVal.startsWith('data:image/') && !imgVal.startsWith('/')) {
          imgVal = '';
        }
        return {
          ...p,
          image: imgVal,
          price: parseFloat(p.price || 0),
          cost_price: parseFloat(p.cost_price || 0),
          stock: parseInt(p.stock || 0, 10),
          active: String(p.active).toUpperCase() === 'TRUE',
          is_low_stock: parseInt(p.stock || 0, 10) <= lowThreshold
        };
      });

      return res.status(200).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, mapped),
        meta: { low_stock_threshold: lowThreshold }
      });
    }

    // ==========================================
    // POST: Tambah Produk Baru
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer']);
      const data = validateBody(productSchema, req.body);

      const newId = crypto.randomUUID();
      const newProd = {
        id: newId,
        name: data.name,
        category: data.category,
        price: data.price,
        cost_price: data.cost_price,
        stock: data.stock,
        emoji: data.emoji || '📦',
        image: data.image || '',
        active: data.active ? 'TRUE' : 'FALSE'
      };

      await appendRow('Products', newProd, PROD_HEADERS);
      await logAudit(authUser.id, 'CREATE_PRODUCT', { id: newId, name: data.name });

      return res.status(201).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, newProd),
        message: 'Barang berhasil ditambahkan'
      });
    }

    // ==========================================
    // PUT: Edit Data Barang (Nama, Harga, Gambar, dll)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin', 'manajer']);
      const editSchema = productSchema.extend({
        id: z.string().min(1, 'ID barang wajib disertakan')
      });
      const data = validateBody(editSchema, req.body);

      const tabs = await getTabsBatch(['Products']);
      const products = tabs.Products || [];
      const prod = products.find(p => p.id === data.id);

      if (!prod) {
        throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Barang tidak ditemukan');
      }

      const updatedProd = {
        ...prod,
        name: data.name,
        category: data.category,
        price: data.price,
        cost_price: data.cost_price !== undefined ? data.cost_price : prod.cost_price,
        stock: data.stock !== undefined ? data.stock : prod.stock,
        emoji: data.emoji || prod.emoji || '📦',
        image: data.image !== undefined ? data.image : (prod.image || ''),
        active: data.active !== undefined ? (data.active ? 'TRUE' : 'FALSE') : prod.active
      };

      await updateRow('Products', prod._rowIndex, updatedProd, PROD_HEADERS);
      await logAudit(authUser.id, 'UPDATE_PRODUCT', { id: data.id, name: data.name });

      return res.status(200).json({
        ok: true,
        data: sanitizeOutputForRole(authUser.role, updatedProd),
        message: 'Data barang berhasil diperbarui'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
