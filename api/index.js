import url from 'url';
import { handleApiError } from './_modules/_lib/errors.js';

export default async function handler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  req.query = { ...parsedUrl.query, ...(req.query || {}) };

  // Parse body jika belum diparsing oleh Vercel
  if (!req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const raw = Buffer.concat(buffers).toString();
      if (raw) {
        try {
          req.body = JSON.parse(raw);
        } catch (e) {
          req.body = raw;
        }
      } else {
        req.body = {};
      }
    } catch (e) {
      req.body = {};
    }
  } else if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {}
  }

  try {
    // 1. Auth routes
    if (pathname === '/api/auth/login') {
      const { default: h } = await import('./_modules/auth/login.js');
      return await h(req, res);
    }
    if (pathname === '/api/auth/logout') {
      const { default: h } = await import('./_modules/auth/logout.js');
      return await h(req, res);
    }
    if (pathname === '/api/auth/me') {
      const { default: h } = await import('./_modules/auth/me.js');
      return await h(req, res);
    }
    if (pathname === '/api/auth/change-password') {
      const { default: h } = await import('./_modules/auth/change-password.js');
      return await h(req, res);
    }
    if (pathname === '/api/auth/approve-override') {
      const { default: h } = await import('./_modules/auth/approve-override.js');
      return await h(req, res);
    }

    // 2. Dashboard, History, Reports, Targets, Audit
    if (pathname === '/api/dashboard') {
      const { default: h } = await import('./_modules/dashboard.js');
      return await h(req, res);
    }
    if (pathname === '/api/history') {
      const { default: h } = await import('./_modules/history.js');
      return await h(req, res);
    }
    if (pathname === '/api/reports') {
      const { default: h } = await import('./_modules/reports.js');
      return await h(req, res);
    }
    if (pathname === '/api/targets') {
      const { default: h } = await import('./_modules/targets.js');
      return await h(req, res);
    }
    if (pathname === '/api/audit') {
      const { default: h } = await import('./_modules/audit.js');
      return await h(req, res);
    }

    // 3. Orders
    if (pathname === '/api/orders/options') {
      const { default: h } = await import('./_modules/orders/options.js');
      return await h(req, res);
    }
    const orderShipMatch = pathname.match(/^\/api\/orders\/([^/]+)\/ship$/);
    if (orderShipMatch) {
      req.query.id = orderShipMatch[1];
      const { default: h } = await import('./_modules/orders/[id]/ship.js');
      return await h(req, res);
    }
    const orderCancelMatch = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
    if (orderCancelMatch) {
      req.query.id = orderCancelMatch[1];
      const { default: h } = await import('./_modules/orders/[id]/cancel.js');
      return await h(req, res);
    }
    const orderDetailMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderDetailMatch) {
      req.query.id = orderDetailMatch[1];
      const { default: h } = await import('./_modules/orders/[id].js');
      return await h(req, res);
    }
    if (pathname === '/api/orders') {
      const { default: h } = await import('./_modules/orders/index.js');
      return await h(req, res);
    }

    // 4. Invoices
    const invoicePdfMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/pdf$/);
    if (invoicePdfMatch) {
      req.query.id = invoicePdfMatch[1];
      const { default: h } = await import('./_modules/invoices/[id]/pdf.js');
      return await h(req, res);
    }
    const invoiceDetailMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (invoiceDetailMatch) {
      req.query.id = invoiceDetailMatch[1];
      const { default: h } = await import('./_modules/invoices/[id].js');
      return await h(req, res);
    }
    if (pathname === '/api/invoices') {
      const { default: h } = await import('./_modules/invoices/index.js');
      return await h(req, res);
    }

    // 5. Receivables
    if (pathname === '/api/receivables') {
      const { default: h } = await import('./_modules/receivables/index.js');
      return await h(req, res);
    }

    // 6. Products & Stock
    if (pathname === '/api/products/stock') {
      const { default: h } = await import('./_modules/products/stock.js');
      return await h(req, res);
    }
    if (pathname === '/api/products/opname') {
      const { default: h } = await import('./_modules/products/opname.js');
      return await h(req, res);
    }
    if (pathname === '/api/products') {
      const { default: h } = await import('./_modules/products/index.js');
      return await h(req, res);
    }

    // 7. Customers
    const custPricesMatch = pathname.match(/^\/api\/customers\/([^/]+)\/prices$/);
    if (custPricesMatch) {
      req.query.id = custPricesMatch[1];
      const { default: h } = await import('./_modules/customers/[id]/prices.js');
      return await h(req, res);
    }
    if (pathname === '/api/customers') {
      const { default: h } = await import('./_modules/customers/index.js');
      return await h(req, res);
    }

    // 8. Branches
    if (pathname === '/api/branches') {
      const { default: h } = await import('./_modules/branches/index.js');
      return await h(req, res);
    }

    // 9. Users
    const userResetMatch = pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
    if (userResetMatch) {
      req.query.id = userResetMatch[1];
      const { default: h } = await import('./_modules/users/[id]/reset-password.js');
      return await h(req, res);
    }
    const userActiveMatch = pathname.match(/^\/api\/users\/([^/]+)\/active$/);
    if (userActiveMatch) {
      req.query.id = userActiveMatch[1];
      const { default: h } = await import('./_modules/users/[id]/active.js');
      return await h(req, res);
    }
    if (pathname === '/api/users') {
      const { default: h } = await import('./_modules/users/index.js');
      return await h(req, res);
    }

    // 10. Suppliers & Purchases
    if (pathname === '/api/suppliers') {
      const { default: h } = await import('./_modules/suppliers/index.js');
      return await h(req, res);
    }
    if (pathname === '/api/purchases') {
      const { default: h } = await import('./_modules/purchases/index.js');
      return await h(req, res);
    }

    // 11. Returns
    if (pathname === '/api/returns') {
      const { default: h } = await import('./_modules/returns/index.js');
      return await h(req, res);
    }

    return res.status(404).json({ error: 'NOT_FOUND', message: 'API route not found: ' + pathname });
  } catch (err) {
    return handleApiError(res, err);
  }
}
