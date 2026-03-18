import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8888);
const HOST = process.env.HOST || 'localhost';

const INDEX_PATH = path.join(__dirname, 'index.html');
const FUNCTIONS_DIR = path.join(__dirname, 'netlify', 'functions');

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function toNodeHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) out[k] = v;
  return out;
}

async function callFunction(modPath, req) {
  const modUrl = pathToFileURL(modPath).href;
  const mod = await import(modUrl);
  const fn = mod?.default;
  if (typeof fn !== 'function') {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid function export' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return await fn(req);
}

async function readBodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendResponse(res, r) {
  res.statusCode = r.status;
  for (const [k, v] of r.headers.entries()) res.setHeader(k, v);
  if (!r.headers.has('content-type')) res.setHeader('content-type', 'text/plain; charset=utf-8');
  r.arrayBuffer()
    .then((ab) => {
      res.end(Buffer.from(ab));
    })
    .catch((e) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(`Internal error: ${e?.message || e}`);
    });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    // API routing (compatible with the functions' `export const config = { path: ... }`)
    if (url.pathname === '/api/chain') {
      const fnPath = path.join(FUNCTIONS_DIR, 'chain.mjs');
      const r = await callFunction(fnPath, new Request(url, { method: req.method, headers: req.headers }));
      return sendResponse(res, r);
    }
    if (url.pathname === '/api/backtest') {
      const fnPath = path.join(FUNCTIONS_DIR, 'backtest.mjs');
      const body = await readBodyBuffer(req);
      const r = await callFunction(
        fnPath,
        new Request(url, {
          method: req.method,
          headers: req.headers,
          body: body.length ? body : undefined,
        }),
      );
      return sendResponse(res, r);
    }

    // Static serving
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = await fs.readFile(INDEX_PATH);
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    // Prevent directory traversal
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.join(__dirname, rel);
    if (!filePath.startsWith(__dirname)) {
      res.statusCode = 400;
      return res.end('Bad request');
    }

    const data = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentTypeFor(filePath));
    return res.end(data);
  } catch (e) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`AlgoTest dev server running at http://${HOST}:${PORT}`);
});

