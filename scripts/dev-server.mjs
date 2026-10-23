import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = 9001;

// Helper to adapt req & res for serverless handler
function adaptRequestResponse(req, res) {
  const parsedUrl = url.parse(req.url, true);
  req.query = parsedUrl.query;
  req.path = parsedUrl.pathname;

  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };

  res.send = function (data) {
    res.end(data);
    return res;
  };
}

async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch (e) {
          req.body = body;
        }
      } else {
        req.body = {};
      }
      resolve();
    });
  });
}

const server = http.createServer(async (req, res) => {
  adaptRequestResponse(req, res);
  await parseBody(req);

  const pathname = req.path;
  console.log(`[API DEV] ${req.method} ${pathname}`);

  try {
    if (pathname === '/api/auth/login') {
      const { default: handler } = await import('../api/auth/login.js');
      return await handler(req, res);
    }
    if (pathname === '/api/auth/logout') {
      const { default: handler } = await import('../api/auth/logout.js');
      return await handler(req, res);
    }
    if (pathname === '/api/auth/me') {
      const { default: handler } = await import('../api/auth/me.js');
      return await handler(req, res);
    }
    if (pathname === '/api/auth/change-password') {
      const { default: handler } = await import('../api/auth/change-password.js');
      return await handler(req, res);
    }
    if (pathname === '/api/dashboard') {
      const { default: handler } = await import('../api/dashboard.js');
      return await handler(req, res);
    }
    if (pathname === '/api/orders/options') {
      const { default: handler } = await import('../api/orders/options.js');
      return await handler(req, res);
    }
    if (pathname === '/api/orders') {
      const { default: handler } = await import('../api/orders/index.js');
      return await handler(req, res);
    }
    const orderShipMatch = pathname.match(/^\/api\/orders\/([^/]+)\/ship$/);
    if (orderShipMatch) {
      req.query.id = orderShipMatch[1];
      const { default: handler } = await import('../api/orders/[id]/ship.js');
      return await handler(req, res);
    }
    const orderCancelMatch = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
    if (orderCancelMatch) {
      req.query.id = orderCancelMatch[1];
      const { default: handler } = await import('../api/orders/[id]/cancel.js');
      return await handler(req, res);
    }
    const orderDetailMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderDetailMatch) {
      req.query.id = orderDetailMatch[1];
      const { default: handler } = await import('../api/orders/[id].js');
      return await handler(req, res);
    }
    const invoicePdfMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/pdf$/);
    if (invoicePdfMatch) {
      req.query.id = invoicePdfMatch[1];
      const { default: handler } = await import('../api/invoices/[id]/pdf.js');
      return await handler(req, res);
    }
    const invoiceDetailMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (invoiceDetailMatch) {
      req.query.id = invoiceDetailMatch[1];
      const { default: handler } = await import('../api/invoices/[id].js');
      return await handler(req, res);
    }
    if (pathname === '/api/invoices') {
      const { default: handler } = await import('../api/invoices/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/receivables') {
      const { default: handler } = await import('../api/receivables/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/products/stock') {
      const { default: handler } = await import('../api/products/stock.js');
      return await handler(req, res);
    }
    if (pathname === '/api/products') {
      const { default: handler } = await import('../api/products/index.js');
      return await handler(req, res);
    }
    const custPricesMatch = pathname.match(/^\/api\/customers\/([^/]+)\/prices$/);
    if (custPricesMatch) {
      req.query.id = custPricesMatch[1];
      const { default: handler } = await import('../api/customers/[id]/prices.js');
      return await handler(req, res);
    }
    if (pathname === '/api/customers') {
      const { default: handler } = await import('../api/customers/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/branches') {
      const { default: handler } = await import('../api/branches/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/reports') {
      const { default: handler } = await import('../api/reports.js');
      return await handler(req, res);
    }
    if (pathname === '/api/history') {
      const { default: handler } = await import('../api/history.js');
      return await handler(req, res);
    }
    const userResetMatch = pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
    if (userResetMatch) {
      req.query.id = userResetMatch[1];
      const { default: handler } = await import('../api/users/[id]/reset-password.js');
      return await handler(req, res);
    }
    const userActiveMatch = pathname.match(/^\/api\/users\/([^/]+)\/active$/);
    if (userActiveMatch) {
      req.query.id = userActiveMatch[1];
      const { default: handler } = await import('../api/users/[id]/active.js');
      return await handler(req, res);
    }
    if (pathname === '/api/users') {
      const { default: handler } = await import('../api/users/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/auth/approve-override') {
      const { default: handler } = await import('../api/auth/approve-override.js');
      return await handler(req, res);
    }
    if (pathname === '/api/suppliers') {
      const { default: handler } = await import('../api/suppliers/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/purchases') {
      const { default: handler } = await import('../api/purchases/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/products/opname') {
      const { default: handler } = await import('../api/products/opname.js');
      return await handler(req, res);
    }
    if (pathname === '/api/returns') {
      const { default: handler } = await import('../api/returns/index.js');
      return await handler(req, res);
    }
    if (pathname === '/api/targets') {
      const { default: handler } = await import('../api/targets.js');
      return await handler(req, res);
    }
    if (pathname === '/api/audit') {
      const { default: handler } = await import('../api/audit.js');
      return await handler(req, res);
    }

    res.status(404).json({ error: 'NOT_FOUND', message: 'API route not found: ' + pathname });
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`[API DEV] Port ${PORT} already in use, reusing running server.`);
  } else {
    console.error('[API DEV SERVER ERROR]', e);
  }
});

server.listen(PORT, () => {
  console.log(`Backend API dev server running on http://localhost:${PORT}`);
});
