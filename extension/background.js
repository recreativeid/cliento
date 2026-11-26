/**
 * cliento Extension Service Worker (Local PC + XAMPP Bridge Relay & 1-Click Auto-Scrape v1.7.0)
 * Relays requests to 127.0.0.1:43210 or http://localhost/Client_Reach_ai so
 * https://cliento.my.id/ works automatically without Chrome LocalNetworkAccessPermissionDenied.
 */
const ALLOWED_LOCAL_BASES = {
  agent: 'http://127.0.0.1:43210',
  xampp: 'http://localhost/Client_Reach_ai'
};

function resolveLocalUrl(msg) {
  const baseKey = msg.targetBase === 'xampp' ? 'xampp' : 'agent';
  const reqPath = String(msg.path || (baseKey === 'xampp' ? '/api/scraper.php?action=engine_diagnostics' : '/status'));
  if (!reqPath.startsWith('/')) {
    return null;
  }
  return ALLOWED_LOCAL_BASES[baseKey] + reqPath;
}

async function handleAutoScrapeRequest(msg, sender) {
  const query = String(msg.query || '').trim();
  if (!query) return { ok: false, error: 'Query kosong' };

  const limit = Math.max(1, Math.min(5000, parseInt(msg.limit || '25', 10) || 25));
  const originTabId = sender?.tab?.id || null;
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);

  const mapsTab = await chrome.tabs.create({ url: mapsUrl, active: true });
  const tabId = mapsTab.id;

  const notifyOrigin = (payload) => {
    if (!originTabId) return;
    chrome.tabs.sendMessage(originTabId, { type: 'CLIENTO_EXT_AUTO_PROGRESS', ...payload }).catch(() => {});
  };

  notifyOrigin({ phase: 'opening_maps', message: 'Membuka tab Google Maps & menyiapkan Ekstensi Chrome...' });

  // Wait up to 20s until the Maps page finishes loading
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 20000);
    const onUpd = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(onUpd);
  });

  // Give content script time to mount feed & search box
  await new Promise(r => setTimeout(r, 2200));

  for (let retry = 0; retry < 4; retry++) {
    try {
      const startAck = await chrome.tabs.sendMessage(tabId, {
        type: 'CLIENTO_EXT_RUN_AUTO',
        limit,
        clearFirst: true,
        originTabId
      });
      if (startAck && startAck.started) {
        return { ok: true, mapsTabId: tabId, limit };
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 900));
  }

  return { ok: false, error: 'Ekstensi gagal berkomunikasi dengan tab Google Maps yang terbuka.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'CLIENTO_PROXY_LOCAL_AGENT') {
    const targetUrl = resolveLocalUrl(msg);
    if (!targetUrl) {
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

    fetch(targetUrl, init)
      .then(async (resp) => {
        clearTimeout(timer);
        let data = null;
        const txt = await resp.text();
        try { data = JSON.parse(txt); } catch (_) {}
        sendResponse({ ok: resp.ok, status: resp.status, data });
      })
      .catch((err) => {
        clearTimeout(timer);
        sendResponse({ ok: false, status: 0, error: err?.message || 'Lokal server tidak merespons' });
      });
    return true;
  }

  if (msg.type === 'CLIENTO_EXT_AUTO_SCRAPE_START') {
    handleAutoScrapeRequest(msg, sender)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err?.message || 'Gagal memulai auto-scrape tab Maps' }));
    return true;
  }

  if (msg.type === 'CLIENTO_EXT_AUTO_DONE') {
    if (msg.originTabId) {
      chrome.tabs.sendMessage(msg.originTabId, {
        type: 'CLIENTO_EXT_AUTO_PROGRESS',
        phase: msg.blocked ? 'captcha' : 'completed',
        count: msg.count || 0,
        blocked: Boolean(msg.blocked),
        payload: msg.payload || null
      }).catch(() => {});

      if (!msg.blocked) {
        chrome.tabs.update(msg.originTabId, { active: true }).catch(() => {});
        if (sender?.tab?.id) {
          setTimeout(() => { chrome.tabs.remove(sender.tab.id).catch(() => {}); }, 800);
        }
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
