import { authenticate } from '../_lib/auth.js';
import { getTabsBatch } from '../_lib/sheets.js';
import { sanitizeOutputForRole } from '../_lib/rbac.js';
import { handleApiError } from '../_lib/errors.js';

export default async function handler(req, res) {
  try {
    const authUser = await authenticate(req);
    const tabs = await getTabsBatch(['Customers', 'Products', 'CustomerPrices', 'Branches', 'Orders']);

    let customers = tabs.Customers || [];
    const orders = tabs.Orders || [];

    if (authUser.role !== 'admin' && authUser.branch_id) {
      customers = customers.filter(c => c.branch_id === authUser.branch_id);
    }
    customers = customers.filter(c => String(c.active).toUpperCase() === 'TRUE');

    // ISOLASI SALES: Sales hanya dapat memilih pelanggannya sendiri
    if (authUser.role === 'sales') {
      customers = customers.filter(c => {
        if (c.sales_id) return c.sales_id === authUser.id;
        const hasOrder = orders.some(o => o.customer_id === c.id && o.sales_id === authUser.id);
        return hasOrder;
      });
    }

    let products = tabs.Products || [];
    products = products.filter(p => String(p.active).toUpperCase() === 'TRUE');

    const sanitizedProducts = sanitizeOutputForRole(authUser.role, products);

    return res.status(200).json({
      ok: true,
      data: {
        customers,
        products: sanitizedProducts,
        customerPrices: tabs.CustomerPrices || [],
        branches: tabs.Branches || []
      }
    });
  } catch (err) {
    return handleApiError(res, err);
  }
}
