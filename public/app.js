const $ = id => document.getElementById(id);
const form = $('chat-form'), input = $('prompt'), messagesEl = $('messages');
const loginForm = $('login-form'), loginInput = $('login-password');
const history = [];
let busy = false, authenticated = false;

function setAuthenticated(value) {
  authenticated = value;
  $('app-shell').classList.toggle('locked', !value);
  $('auth-gate').hidden = value;
  $('logout-button').hidden = !value;
  if (!value) setTimeout(() => loginInput.focus(), 30);
}
async function checkStatus() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' }); const data = await r.json();
    setAuthenticated(Boolean(data.authenticated));
    $('status-dot').className = data.ready ? 'ready' : 'offline';
    $('status-text').textContent = data.ready ? 'Server terhubung' : 'API key belum diatur';
    $('model-tag').textContent = data.model || 'AI assistant';
  } catch {
    setAuthenticated(false); $('status-dot').className = 'offline'; $('status-text').textContent = 'Server tidak terjangkau';
  }
}
loginForm.addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  busy = true; $('login-button').disabled = true; $('auth-error').textContent = '';
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginInput.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login gagal.');
    loginInput.value = ''; await checkStatus(); input.focus();
  } catch (error) { $('auth-error').textContent = error.message || 'Login gagal. Coba kembali.'; loginInput.select(); }
  finally { busy = false; $('login-button').disabled = false; }
});
$('logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  history.length = 0; messagesEl.replaceChildren(); $('welcome').hidden = false; setAuthenticated(false);
});
function addMessage(role, text, extra = '') {
  const node = document.createElement('article'); node.className = `message ${role} ${extra}`;
  if (role === 'assistant') {
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'RUANGAI'; node.append(label);
  }
  const body = document.createElement('div'); body.textContent = text; node.append(body); messagesEl.append(node);
  $('welcome').hidden = true; node.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return node;
}
async function submit(text) {
  text = text.trim(); if (!text || busy || !authenticated) return;
  busy = true; $('send-button').disabled = true; input.value = ''; input.style.height = 'auto';
  history.push({ role: 'user', content: text }); addMessage('user', text);
  const loader = document.createElement('div'); loader.className = 'typing'; loader.innerHTML = '<span></span><span></span><span></span>'; messagesEl.append(loader);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    const data = await response.json(); loader.remove();
    if (response.status === 401) { await checkStatus(); throw new Error('Sesi berakhir. Silakan login kembali.'); }
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    history.push({ role: 'assistant', content: data.reply }); addMessage('assistant', data.reply);
  } catch (error) { loader.remove(); addMessage('assistant', error.message, 'error'); history.pop(); }
  finally { busy = false; $('send-button').disabled = false; if (authenticated) input.focus(); }
}
form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => submit(button.dataset.prompt)));
checkStatus();
