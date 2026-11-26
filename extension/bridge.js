/**
 * cliento Extension <-> Dashboard Bridge v1.7.0
 * Automatically relays captured Google Maps JSON payloads, local agent / XAMPP calls,
 * and 1-click extension auto-scrape coordination into any open cliento tab.
 */
(() => {
  'use strict';

  const BRIDGE_SOURCE = 'cliento_ext_bridge';
  const STORAGE_KEY = 'cliento_latest_capture';

  function announceReady() {
    try {
      window.postMessage({
        source: BRIDGE_SOURCE,
        type: 'CLIENTO_EXTENSION_READY',
        version: '1.7.0',
        canRelayAgent: true,
        canRelayXampp: true,
        canAutoScrape: true
      }, window.location.origin);
    } catch (_) {}
  }

  function pushCapture(payload) {
    if (!payload || !Array.isArray(payload.records) || payload.records.length === 0) return;
    try {
      window.postMessage({
        source: BRIDGE_SOURCE,
        type: 'CLIENTO_EXTENSION_CAPTURE',
        payload
      }, window.location.origin);
    } catch (_) {}
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEY]?.newValue) {
        pushCapture(changes[STORAGE_KEY].newValue);
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'CLIENTO_EXT_AUTO_PROGRESS') {
        try {
          window.postMessage({
            source: BRIDGE_SOURCE,
            type: 'CLIENTO_EXT_AUTO_PROGRESS',
            phase: msg.phase,
            count: msg.count || 0,
            blocked: Boolean(msg.blocked),
            message: msg.message || '',
            payload: msg.payload || null
          }, window.location.origin);
        } catch (_) {}
      }
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'CLIENTO_PING_EXTENSION') {
      announceReady();
    } else if (data.type === 'CLIENTO_REQUEST_LATEST_CAPTURE') {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(STORAGE_KEY, res => {
          pushCapture(res?.[STORAGE_KEY]);
        });
      }
    } else if (data.type === 'CLIENTO_AGENT_FETCH' && data.reqId) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'CLIENTO_PROXY_LOCAL_AGENT',
          targetBase: data.targetBase === 'xampp' ? 'xampp' : 'agent',
          path: data.path || '/status',
          method: data.method || 'GET',
          body: data.body || null,
          timeoutMs: data.timeoutMs || 8000
        }, response => {
          const err = chrome.runtime.lastError?.message || null;
          window.postMessage({
            source: BRIDGE_SOURCE,
            type: 'CLIENTO_AGENT_FETCH_RESULT',
            reqId: data.reqId,
            response: response || { ok: false, status: 0, error: err || 'Extension relay gagal' }
          }, window.location.origin);
        });
      }
    } else if (data.type === 'CLIENTO_EXT_AUTO_SCRAPE_START' && data.reqId) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'CLIENTO_EXT_AUTO_SCRAPE_START',
          query: data.query || '',
          limit: data.limit || 25
        }, response => {
          const err = chrome.runtime.lastError?.message || null;
          window.postMessage({
            source: BRIDGE_SOURCE,
            type: 'CLIENTO_EXT_AUTO_SCRAPE_STARTED',
            reqId: data.reqId,
            response: response || { ok: false, error: err || 'Gagal memulai tab auto-scrape' }
          }, window.location.origin);
        });
      }
    }
  });

  announceReady();
})();
