/**
 * cliento Extension <-> Dashboard Bridge
 * Automatically relays captured Google Maps JSON payloads from the extension
 * directly into any open cliento tab (localhost or GitHub Pages) via window.postMessage.
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
        version: '1.6.0'
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
    }
  });

  announceReady();
})();
