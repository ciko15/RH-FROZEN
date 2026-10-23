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
    const { default: handler } = await import('../api/index.js');
    return await handler(req, res);
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
