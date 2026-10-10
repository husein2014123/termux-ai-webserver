const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const API_BASE = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const MAX_BODY = 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) { reject(new Error('Pesan terlalu besar (maksimum 1 MB).')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Format permintaan tidak valid.')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, { ready: Boolean(process.env.OPENAI_API_KEY), model: MODEL, provider: process.env.AI_PROVIDER_NAME || 'OpenAI-compatible API' });
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'API key belum diatur. Buka README untuk cara konfigurasi.' });
    try {
      const { messages } = await readBody(req);
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) return send(res, 400, { error: 'Riwayat chat tidak valid.' });
      const safeMessages = messages.map(m => ({ role: ['user', 'assistant', 'system'].includes(m?.role) ? m.role : 'user', content: String(m?.content ?? '').slice(0, 12000) }));
      const upstream = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: safeMessages, temperature: 0.7 })
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return send(res, upstream.status, { error: data?.error?.message || `API model mengembalikan HTTP ${upstream.status}.` });
      return send(res, 200, { reply: data?.choices?.[0]?.message?.content || 'Model tidak mengirim jawaban.' });
    } catch (error) {
      return send(res, 500, { error: error.message || 'Terjadi kesalahan pada server.' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metode tidak didukung.' });
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Akses ditolak.' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Halaman tidak ditemukan.' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});
server.listen(PORT, HOST, () => console.log(`Termux AI Webserver aktif di http://${HOST}:${PORT}`));
