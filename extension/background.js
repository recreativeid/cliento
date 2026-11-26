/**
 * cliento Extension Service Worker (Local PC Agent Relay v1.6.1)
 * Relays loopback requests to 127.0.0.1:43210 so https://cliento.my.id/
 * works cleanly without Chrome LocalNetworkAccessPermissionDenied blocks.
 */
const AGENT_BASE = 'http://127.0.0.1:43210';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'CLIENTO_PROXY_LOCAL_AGENT') return false;

  const reqPath = String(msg.path || '/status');
  if (!reqPath.startsWith('/')) {
    sendResponse({ ok: false, status: 400, error: 'Path agen tidak valid.' });
    return false;
  }

  const method = (msg.method || 'GET').toUpperCase();
  const timeoutMs = Math.max(800, Math.min(30000, Number(msg.timeoutMs) || 8000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const init = { method, signal: controller.signal };
  if (method !== 'GET' && msg.body !== undefined && msg.body !== null) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
  }

  fetch(AGENT_BASE + reqPath, init)
    .then(async (resp) => {
      clearTimeout(timer);
      let data = null;
      try { data = await resp.json(); } catch (_) {}
      sendResponse({ ok: resp.ok, status: resp.status, data });
    })
    .catch((err) => {
      clearTimeout(timer);
      sendResponse({ ok: false, status: 0, error: err?.message || 'Agen PC tidak merespons di 127.0.0.1:43210' });
    });

  return true;
});
