const $ = id => document.getElementById(id);
const form = $('chat-form'), input = $('prompt'), messagesEl = $('messages');
const history = [];
let busy = false;

async function checkStatus() {
  try {
    const r = await fetch('/api/status'); const data = await r.json();
    $('status-dot').className = data.ready ? 'ready' : 'offline';
    $('status-text').textContent = data.ready ? 'Server terhubung' : 'API key belum diatur';
    $('model-tag').textContent = data.model || 'AI assistant';
  } catch {
    $('status-dot').className = 'offline'; $('status-text').textContent = 'Server tidak terjangkau';
  }
}
function addMessage(role, text, extra = '') {
  const node = document.createElement('article'); node.className = `message ${role} ${extra}`;
  if (role === 'assistant') {
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'RUANGAI'; node.append(label);
  }
  const body = document.createElement('div'); body.textContent = text; node.append(body); messagesEl.append(node);
  $('welcome').hidden = true; node.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return node;
}
async function submit(text) {
  text = text.trim(); if (!text || busy) return;
  busy = true; $('send-button').disabled = true; input.value = ''; input.style.height = 'auto';
  history.push({ role: 'user', content: text }); addMessage('user', text);
  const loader = document.createElement('div'); loader.className = 'typing'; loader.innerHTML = '<span></span><span></span><span></span>'; messagesEl.append(loader);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    const data = await response.json(); loader.remove();
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    history.push({ role: 'assistant', content: data.reply }); addMessage('assistant', data.reply);
  } catch (error) {
    loader.remove(); addMessage('assistant', error.message, 'error'); history.pop();
  } finally { busy = false; $('send-button').disabled = false; input.focus(); }
}
form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => submit(button.dataset.prompt)));
checkStatus();
