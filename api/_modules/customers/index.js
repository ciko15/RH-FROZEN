import { z } from 'zod';
import crypto from 'crypto';
import { authenticate } from '../_lib/auth.js';
import { requireRole } from '../_lib/rbac.js';
import { getTabsBatch, appendRow, updateRow } from '../_lib/sheets.js';
import { validateBody } from '../_lib/validate.js';
import { handleApiError, ApiError } from '../_lib/errors.js';
import { logAudit } from '../_lib/audit.js';

const customerSchema = z.object({
  name: z.string().min(1, 'Nama pelanggan wajib diisi'),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  branch_id: z.string().optional().default(''),
  sales_id: z.string().optional(),
  credit_limit: z.number().min(0, 'Batas kredit tidak boleh negatif').optional().default(0),
  term_days: z.number().int().min(1, 'Jatuh tempo minimal 1 hari').optional().default(14),
  active: z.boolean().optional().default(true)
});

const CUST_HEADERS = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);

    // ==========================================
    // GET: Daftar Pelanggan
    // ==========================================
    if (req.method === 'GET') {
      const tabs = await getTabsBatch(['Customers', 'Branches', 'Orders', 'Users']);
      let customers = tabs.Customers || [];
      const orders = tabs.Orders || [];
      const users = tabs.Users || [];

      // Filter Cabang untuk non-admin
      if (authUser.role !== 'admin' && authUser.branch_id) {
        customers = customers.filter(c => !c.branch_id || c.branch_id === authUser.branch_id);
      }

      // ISOLASI SALES: Sales melihat pelanggan miliknya (berdasarkan sales_id, kecocokan cabang, atau order)
      if (authUser.role === 'sales') {
        customers = customers.filter(c => {
          // 1. Jika sales_id cocok langsung dengan authUser.id atau username sales
          if (c.sales_id && (
            c.sales_id === authUser.id || 
            c.sales_id.toLowerCase().includes(authUser.username.toLowerCase()) ||
            (authUser.branch_id && c.sales_id.toUpperCase().includes(authUser.branch_id.replace('BR-', '')))
          )) {
            return true;
          }
          // 2. Jika sales_id kosong, tampilkan berdasarkan cabang yang sama
          if (!c.sales_id && c.branch_id && c.branch_id === authUser.branch_id) {
            return true;
          }
          // 3. Fallback jika pernah dipesan oleh sales ini
          const hasOrderFromThisSales = orders.some(o => o.customer_id === c.id && o.sales_id === authUser.id);
          return hasOrderFromThisSales;
        });
      }

      const search = (req.query.search || '').toLowerCase().trim();
      if (search) {
        customers = customers.filter(c =>
          (c.name && c.name.toLowerCase().includes(search)) ||
          (c.phone && c.phone.includes(search))
        );
      }

      const mapped = customers.map(c => {
        const salesUser = users.find(u => u.id === c.sales_id);
        return {
          ...c,
          sales_id: c.sales_id || '',
          sales_name: salesUser ? salesUser.full_name : '',
          balance: parseFloat(c.balance || 0),
          credit_limit: parseFloat(c.credit_limit || 0),
          term_days: parseInt(c.term_days || 14, 10),
          active: String(c.active).toUpperCase() === 'TRUE'
        };
      });

      return res.status(200).json({ ok: true, data: mapped });
    }

    // ==========================================
    // POST: Tambah Pelanggan Baru
    // ==========================================
    if (req.method === 'POST') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);
      const data = validateBody(customerSchema, req.body);

      const branchId = data.branch_id || authUser.branch_id || 'BR-KERTEK';
      const salesId = authUser.role === 'sales' ? authUser.id : (data.sales_id || authUser.id);
      const newId = crypto.randomUUID();

      // Pastikan format nomor hp berawalan '0' bila diketik tanpa '0' (misal: 812xxx)
      let phone = (data.phone || '').trim();
      if (phone && !phone.startsWith('0') && !phone.startsWith('+')) {
        phone = '0' + phone;
      }

      const newCust = {
        id: newId,
        name: data.name,
        address: data.address,
        phone: phone,
        branch_id: branchId,
        sales_id: salesId,
        balance: 0,
        credit_limit: data.credit_limit,
        term_days: data.term_days,
        active: data.active ? 'TRUE' : 'FALSE'
      };

      await appendRow('Customers', newCust, CUST_HEADERS);
      await logAudit(authUser.id, 'CREATE_CUSTOMER', { id: newId, name: data.name, sales_id: salesId });

      return res.status(201).json({
        ok: true,
        data: newCust,
        message: 'Pelanggan berhasil ditambahkan'
      });
    }

    // ==========================================
    // PUT: Edit Data Pelanggan (Admin, Manajer, atau Sales pemilik)
    // ==========================================
    if (req.method === 'PUT') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);

      const editCustomerSchema = customerSchema.partial().extend({
        id: z.string().min(1, 'ID Pelanggan wajib disertakan')
      });
      const data = validateBody(editCustomerSchema, req.body);

      const tabs = await getTabsBatch(['Customers', 'Orders']);
      const customers = tabs.Customers || [];
      const orders = tabs.Orders || [];
      const cust = customers.find(c => c.id === data.id);

      if (!cust) {
        throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan');
      }

      // Validasi hak akses Sales: Sales hanya boleh mengedit customernya sendiri
      if (authUser.role === 'sales') {
        const isOwner = cust.sales_id === authUser.id;
        const hasOrder = orders.some(o => o.customer_id === cust.id && o.sales_id === authUser.id);
        if (!isOwner && !hasOrder) {
          throw new ApiError(403, 'FORBIDDEN', 'Anda hanya diizinkan mengedit data pelanggan Anda sendiri');
        }
      }

      let phone = data.phone !== undefined ? data.phone.trim() : (cust.phone || '');
      if (phone && !phone.startsWith('0') && !phone.startsWith('+')) {
        phone = '0' + phone;
      }

      // Pastikan branch_id dan sales_id tidak sembarangan diubah oleh sales biasa
      const updatedCust = {
        ...cust,
        name: data.name !== undefined ? data.name : cust.name,
        address: data.address !== undefined ? data.address : (cust.address || ''),
        phone: phone,
        branch_id: (authUser.role === 'admin' && data.branch_id) ? data.branch_id : cust.branch_id,
        sales_id: (authUser.role === 'admin' || authUser.role === 'manajer') && data.sales_id !== undefined ? data.sales_id : (cust.sales_id || (authUser.role === 'sales' ? authUser.id : '')),
        credit_limit: (authUser.role === 'admin' || authUser.role === 'manajer') && data.credit_limit !== undefined ? data.credit_limit : cust.credit_limit,
        term_days: (authUser.role === 'admin' || authUser.role === 'manajer') && data.term_days !== undefined ? data.term_days : cust.term_days,
        active: data.active !== undefined ? (data.active ? 'TRUE' : 'FALSE') : (cust.active || 'TRUE')
      };

      await updateRow('Customers', cust._rowIndex, updatedCust, CUST_HEADERS);
      await logAudit(authUser.id, 'UPDATE_CUSTOMER', { id: data.id, name: updatedCust.name });

      return res.status(200).json({
        ok: true,
        data: updatedCust,
        message: 'Data pelanggan berhasil diperbarui'
      });
    }

    // ==========================================
    // DELETE: Hapus / Nonaktifkan Pelanggan
    // ==========================================
    if (req.method === 'DELETE') {
      requireRole(authUser, ['admin', 'manajer', 'sales']);
      const id = req.query.id;
      if (!id) {
        throw new ApiError(400, 'ID_REQUIRED', 'ID pelanggan wajib disertakan');
      }

      const tabs = await getTabsBatch(['Customers', 'Orders']);
      const customers = tabs.Customers || [];
      const orders = tabs.Orders || [];
      const cust = customers.find(c => c.id === id);

      if (!cust) {
        throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan');
      }

      // Validasi hak akses Sales
      if (authUser.role === 'sales') {
        const isOwner = cust.sales_id === authUser.id;
        const hasOrder = orders.some(o => o.customer_id === cust.id && o.sales_id === authUser.id);
        if (!isOwner && !hasOrder) {
          throw new ApiError(403, 'FORBIDDEN', 'Anda hanya diizinkan menghapus pelanggan Anda sendiri');
        }
      }

      // Tandai active FALSE
      const updatedCust = {
        ...cust,
        active: 'FALSE'
      };

      await updateRow('Customers', cust._rowIndex, updatedCust, CUST_HEADERS);
      await logAudit(authUser.id, 'DELETE_CUSTOMER', { id: cust.id, name: cust.name });

      return res.status(200).json({
        ok: true,
        message: 'Pelanggan berhasil dihapus'
      });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung' });
  } catch (err) {
    return handleApiError(res, err);
  }
}
