const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const LICENSE_API_URL = (process.env.LICENSE_API_URL || '').trim().replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'openrouter/auto';
const MAX_BODY = 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('Permintaan terlalu besar (maksimum 1 MB).')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('Format permintaan tidak valid.')); }
    });
    req.on('error', reject);
  });
}
async function proxyApi(route, payload, headers = {}) {
  if (!LICENSE_API_URL) return { status: 503, data: { error: 'Layanan lisensi belum dikonfigurasi. Atur LICENSE_API_URL di Termux.' } };
  let base;
  try { base = new URL(LICENSE_API_URL); }
  catch { return { status: 503, data: { error: 'LICENSE_API_URL tidak valid.' } }; }
  if (!['http:', 'https:'].includes(base.protocol)) return { status: 503, data: { error: 'LICENSE_API_URL harus menggunakan HTTP atau HTTPS.' } };
  try {
    const upstream = await fetch(`${LICENSE_API_URL}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000)
    });
    const data = await upstream.json().catch(() => ({}));
    return { status: upstream.status, data };
  } catch (error) {
    return { status: 502, data: { error: `Tidak dapat menghubungi server lisensi: ${error.message || 'jaringan tidak tersedia'}` } };
  }
}
function serveFile(req, res, pathname) {
  let requested;
  if (pathname === '/' || pathname === '/login' || pathname === '/login/') requested = 'index.html';
  else if (pathname === '/admin' || pathname === '/admin/') requested = 'admin.html';
  else requested = decodeURIComponent(pathname.replace(/^\/+/, ''));
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Akses ditolak.' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Halaman tidak ditemukan.' });
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' };
    if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html' || pathname === '/admin.js') headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { error: 'URL permintaan tidak valid.' }); }

  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, { ready: Boolean(LICENSE_API_URL), provider: 'OpenRouter via RuangAI', model: AI_MODEL, licensing: true });
  }

  if (req.method === 'POST' && ['/api/license/verify', '/api/chat', '/api/admin/issue'].includes(url.pathname)) {
    try {
      const body = await readBody(req);
      const route = url.pathname;
      const headers = route === '/api/admin/issue' && req.headers.authorization ? { Authorization: req.headers.authorization } : {};
      const result = await proxyApi(route, body, headers);
      return send(res, result.status, result.data);
    } catch (error) { return send(res, 400, { error: error.message || 'Permintaan tidak valid.' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') return send(res, 200, { ok: true });

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metode tidak didukung.' });
  try { return serveFile(req, res, decodeURIComponent(url.pathname)); }
  catch { return send(res, 400, { error: 'Path tidak valid.' }); }
});
server.listen(PORT, HOST, () => console.log(`RuangAI Termux aktif di http://${HOST}:${PORT} (${LICENSE_API_URL ? 'server lisensi terhubung' : 'atur LICENSE_API_URL untuk mengaktifkan lisensi'})`));
