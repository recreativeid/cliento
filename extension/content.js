/** Google Maps collection starts only after an explicit user click. */
(() => {
  'use strict';

  const helpers = {
    mapsUrl(value) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || !/^(www\.)?google\.(com|co\.id)$/.test(url.hostname) ||
            !url.pathname.startsWith('/maps/place/')) return '';
        url.hash = '';
        return url.href;
      } catch (_) { return ''; }
    },
    identity(value) {
      const url = helpers.mapsUrl(value);
      if (!url) return '';
      const placeId = url.match(/!1s([^!/?]+)/);
      if (placeId) {
        try { return decodeURIComponent(placeId[1]); } catch (_) { return placeId[1]; }
      }
      return new URL(url).pathname.replace(/\/@.*$/, '').replace(/\/$/, '');
    },
    hasPlaceId(value) {
      const url = helpers.mapsUrl(value);
      return !!url && /!1s([^!/?]+)/.test(url);
    },
    coords(value) {
      const url = helpers.mapsUrl(value);
      if (!url) return {lat: null, lng: null};
      const matches = [...url.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
      const last = matches.at(-1);
      if (!last) return {lat: null, lng: null};
      const lat = Number(last[1]);
      const lng = Number(last[2]);
      return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? {lat, lng}
        : {lat: null, lng: null};
    },
    normalizeName(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    },
    parseQueryContext(query) {
      const clean = String(query || '').replace(/\s+/g, ' ').trim();
      const context = {query_name: clean || 'Scraping Google Maps'};
      const match = clean.match(/^(.+?)\s+(?:di|in)\s+(.+)$/i);
      if (match) {
        const category = match[1].trim();
        const location = match[2].trim();
        if (category) context.target_category = category;
        if (location) context.location_name = location;
      }
      return context;
    },
    rating(value) {
      const match = String(value || '').trim().match(/^([1-5](?:[.,]\d)?)(?:\s|$)/);
      if (!match) return null;
      const rating = Number(match[1].replace(',', '.'));
      return rating >= 1 && rating <= 5 ? rating : null;
    },
    reviews(value) {
      const text = String(value || '').trim().replace(/^\(/, '').replace(/\)$/, '');
      // Only full integer counts are accepted. Abbreviations such as 1.2K
      // remain unavailable rather than becoming an estimated review count.
      const match = text.match(/^(\d+(?:[.,\s]\d{3})*)(?:\s+(?:ulasan|reviews?|ratings?|penilaian))?$/i);
      if (!match) return null;
      const count = Number(match[1].replace(/[.,\s]/g, ''));
      return Number.isSafeInteger(count) ? count : null;
    },
    webUrl(value) {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
      } catch (_) { return ''; }
    },
    merge(current, incoming) {
      const merged = {...current};
      for (const [key, value] of Object.entries(incoming)) {
        if (value !== '' && value !== null && value !== undefined) merged[key] = value;
      }
      return merged;
    }
  };
  // Pure parsing helpers are also exercised by the local regression tests.
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (typeof document === 'undefined') return;
  if (document.getElementById('clientreach-maps-collector')) return;

  const panel = document.createElement('section');
  panel.id = 'clientreach-maps-collector';
  panel.setAttribute('aria-label', 'cliento Google Maps Scraper');
  panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:white;color:#172033;padding:16px;border:1px solid #cbd5e1;border-radius:12px;width:310px;max-height:82vh;overflow:auto;font:13px/1.5 system-ui;box-shadow:0 8px 32px #0003';
  panel.innerHTML = `
    <strong>cliento · Google Maps Scraper</strong>
    <p>Buka hasil pencarian Google Maps, lalu mulai pengambilan data.</p>
    <label>Batas per proses (1–5000)
      <input id="cr-limit" type="number" min="1" max="5000" value="100" style="width:72px;margin-left:6px">
    </label>
    <label style="display:block;margin:8px 0"><input id="cr-details" type="checkbox" checked> Buka detail untuk kontak dan website</label>
    <label style="display:block;margin:8px 0"><input id="cr-scroll" type="checkbox" checked> Gulir daftar untuk memuat hasil berikutnya</label>
    <label style="display:block;margin:8px 0"><input id="cr-autosend" type="checkbox" checked> Kirim otomatis ke tab cliento setelah selesai</label>
    <div style="display:flex;gap:6px;margin:10px 0">
      <button type="button" id="cr-start">Mulai scraping</button>
      <button type="button" id="cr-stop" disabled>Hentikan</button>
    </div>
    <button type="button" id="cr-single">Ambil profil yang terbuka</button>
    <p id="cr-message" role="status">Belum ada data diambil. Proses dimulai hanya setelah klik Anda.</p>
    <p id="cr-summary">0 bisnis terkumpul.</p>
    <ol id="cr-preview" style="padding-left:20px"></ol>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
      <button type="button" id="cr-send" disabled style="background:#2563eb;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-weight:600">Kirim ke Tab cliento</button>
      <button type="button" id="cr-download" disabled>Unduh rekap JSON</button>
      <button type="button" id="cr-clear" disabled>Hapus rekap</button>
    </div>
    <p style="font-size:11px;color:#64748b">Setelah selesai, hasil otomatis masuk ke tab cliento (atau klik Kirim ke Tab cliento / Unduh JSON). CAPTCHA menghentikan proses.</p>`;
  document.body.appendChild(panel);
  const control = id => panel.querySelector(`#cr-${id}`);
  const message = control('message');
  const records = new Map();
  let running = false;
  let stopRequested = false;
  let queryName = '';

  const visible = el => !!el && el.getClientRects().length > 0;
  const firstVisible = (selector, root = document) => Array.from(root.querySelectorAll(selector)).find(visible);
  const text = el => (el?.innerText || el?.getAttribute('aria-label') || '').trim();
  const blocked = () => /\/sorry\//.test(window.location.pathname) ||
    !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], form[action*="/sorry/"]');

  function update() {
    control('start').disabled = running;
    control('single').disabled = running;
    control('stop').disabled = !running || stopRequested;
    control('limit').disabled = running;
    control('details').disabled = running;
    control('scroll').disabled = running;
    control('download').disabled = running || records.size === 0;
    control('clear').disabled = running || records.size === 0;
    const sendBtn = control('send');
    if (sendBtn) sendBtn.disabled = running || records.size === 0;
    const rows = Array.from(records.values());
    control('summary').textContent = `${rows.length} bisnis · ${rows.filter(row => row.phone).length} telepon · ${rows.filter(row => row.website).length} website`;
    control('preview').replaceChildren();
    for (const record of rows.slice(-5)) {
      const li = document.createElement('li');
      li.textContent = record.name;
      control('preview').appendChild(li);
    }
  }

  async function pause(ms) {
    const until = Date.now() + ms;
    while (!stopRequested && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, Math.min(200, until - Date.now())));
      if (blocked()) {
        stopRequested = true;
        message.textContent = 'Google Maps menampilkan pembatasan/CAPTCHA. Proses dihentikan; data yang sudah terkumpul dapat diunduh.';
      }
    }
    return !stopRequested;
  }

  function metadata(sourceUrl) {
    return {
      source_type: 'google_maps_extension', source_name: 'Google Maps (Chrome)',
      source_url: sourceUrl, usage_basis: 'Pengambilan data publik Google Maps dimulai pengguna',
      observed_at: new Date().toISOString()
    };
  }

  function metrics(root, profileOnly = false) {
    if (!root) return {};
    let rating = null;
    let reviews = null;
    const ratingNode = firstVisible(profileOnly ? '.F7nice span[aria-hidden="true"]' : '.MW4etd', root);
    if (ratingNode) rating = helpers.rating(text(ratingNode));
    const countNode = profileOnly ? null : firstVisible('.UY7F9', root);
    if (countNode) reviews = helpers.reviews(text(countNode));
    for (const el of root.querySelectorAll(profileOnly ? '.F7nice [aria-label]' : 'span[role="img"][aria-label]')) {
      if (!visible(el)) continue;
      const label = el.getAttribute('aria-label') || '';
      if (rating === null && /bintang|stars?/i.test(label)) rating = helpers.rating(label);
      if (reviews === null && /ulasan|reviews?|penilaian/i.test(label)) reviews = helpers.reviews(label);
    }
    return {...(rating === null ? {} : {rating}), ...(reviews === null ? {} : {reviews_count: reviews})};
  }

  function currentProfile() {
    const heading = firstVisible('h1.DUwDvf, h1.fontHeadlineLarge');
    const sourceUrl = helpers.mapsUrl(window.location.href);
    if (!heading || !sourceUrl) return null;
    // Search cards can remain visible beside the profile. Read metrics and
    // contact controls only inside this profile's main pane.
    const root = heading.closest('[role="main"]') || heading.parentElement?.parentElement;
    if (!root) return null;
    const phone = firstVisible('button[data-item-id^="phone:tel:"], a[href^="tel:"]', root);
    const address = firstVisible('button[data-item-id="address"]', root);
    const website = firstVisible('a[data-item-id="authority"]', root);
    const category = firstVisible('button.DkEaL', root);
    const hours = firstVisible('[data-item-id="oh"], button[jsaction*="pane.openhours"], div[aria-label][jsaction*="openhours"]', root);
    const {lat, lng} = helpers.coords(sourceUrl);
    const rawPhone = phone?.getAttribute('data-item-id')?.replace(/^phone:tel:/, '') ||
      phone?.getAttribute('href')?.replace(/^tel:/i, '') ||
      text(phone).replace(/^(Telepon|Phone):\s*/i, '');
    return {
      name: text(heading), address: text(address).replace(/^(Alamat|Address):\s*/i, ''),
      category: text(category), phone: rawPhone.trim(),
      website: helpers.webUrl(website?.href || ''), whatsapp: '',
      opening_hours: text(hours).replace(/\s+/g, ' ').trim(),
      lat, lng,
      ...metrics(root, true), ...metadata(sourceUrl)
    };
  }

  function store(record) {
    const key = helpers.identity(record.source_url);
    if (!key || !record.name) return;
    if (!records.has(key) && records.size >= 5000) {
      stopRequested = true;
      message.textContent = 'Rekap mencapai 5000 bisnis. Kirim/Unduh JSON, lalu hapus rekap sebelum melanjutkan.';
      return;
    }
    records.set(key, helpers.merge(records.get(key) || {}, record));
    update();
  }

  function cards() {
    const feed = firstVisible('[role="feed"]');
    if (!feed) return [];
    const found = new Map();
    for (const anchor of feed.querySelectorAll('a[href*="/maps/place/"]')) {
      const sourceUrl = helpers.mapsUrl(anchor.href);
      const key = helpers.identity(sourceUrl);
      const row = anchor.closest('[role="article"], .Nv2PK') || anchor.parentElement;
      const name = (anchor.getAttribute('aria-label') || text(row?.querySelector('.qBF1Pd'))).trim();
      if (!visible(anchor) || !key || !name || found.has(key)) continue;
      found.set(key, {key, anchor, record: {name, ...helpers.coords(sourceUrl), ...metrics(row), ...metadata(sourceUrl)}});
    }
    return Array.from(found.values());
  }

  async function ensureFeedVisible() {
    if (firstVisible('[role="feed"]')) return true;
    const closeBtn = firstVisible('button[aria-label="Tutup"], button[aria-label="Close"], button[aria-label="Kembali"], button[aria-label="Back"]');
    if (!closeBtn) return false;
    closeBtn.click();
    if (!await pause(600)) return false;
    return !!firstVisible('[role="feed"]');
  }

  async function openProfile(card) {
    if (typeof card.anchor.scrollIntoView === 'function') {
      try { card.anchor.scrollIntoView({block: 'nearest'}); } catch (_) {}
    }
    card.anchor.click();
    if (!await pause(1400)) return null;
    let previous = '';
    const deadline = Date.now() + 8000;
    const cardHasPlaceId = helpers.hasPlaceId(card.record.source_url);
    const expectedName = helpers.normalizeName(card.record.name);
    while (!stopRequested && Date.now() < deadline) {
      const profile = currentProfile();
      // URL identity must match the selected card. When no explicit place ID is
      // present in the URL, the normalized heading must also match to prevent
      // assigning the previously open business's contacts to the next result.
      const idMatches = !!profile && helpers.identity(profile.source_url) === card.key;
      const nameMatches = !!profile && helpers.normalizeName(profile.name) === expectedName;
      if (profile && idMatches && (cardHasPlaceId || nameMatches)) {
        const signature = JSON.stringify(profile, (key, value) => key === 'observed_at' ? undefined : value);
        if (signature === previous) return profile;
        previous = signature;
      } else previous = '';
      if (!await pause(400)) break;
    }
    return null;
  }

  async function runCollection({ limit, detailEnabled, scrollEnabled }) {
    queryName = document.querySelector('#searchboxinput')?.value?.trim() || queryName;
    running = true;
    stopRequested = false;
    update();
    let processed = 0;
    let stalls = 0;
    const visited = new Set();
    try {
      // Scroll attempts and per-run records are both bounded; no new query,
      // category rotation, background request or CAPTCHA bypass is performed.
      for (let attempt = 0; attempt <= 200 && processed < limit && !stopRequested; attempt++) {
        const pending = cards().filter(card => !visited.has(card.key));
        if (!pending.length) stalls++; else stalls = 0;
        for (const card of pending) {
          if (stopRequested || processed >= limit) break;
          visited.add(card.key);
          message.textContent = `Mengambil ${processed + 1}/${limit}: ${card.record.name}`;
          const detail = detailEnabled ? await openProfile(card) : null;
          if (stopRequested) break;
          store(helpers.merge(card.record, detail || {}));
          processed++;
          if (detailEnabled && processed < limit && !stopRequested) {
            await ensureFeedVisible();
          }
          if (!await pause(300)) break;
        }
        if (!scrollEnabled || stalls >= 3 || processed >= limit || stopRequested || attempt >= 20) break;
        if (!await ensureFeedVisible()) break;
        const feed = firstVisible('[role="feed"]');
        if (!feed) break;
        const feedText = String(feed.innerText || '');
        if (/akhir daftar|end of the list/i.test(feedText)) break;
        const step = Math.max((feed.clientHeight || 600) * 0.85, 500);
        if (typeof feed.scrollBy === 'function') {
          feed.scrollBy({top: step, behavior: 'instant'});
        } else if (typeof feed.scrollTop === 'number') {
          feed.scrollTop += step;
        }
        if (!await pause(1400)) break;
      }
      if (!stopRequested) {
        const autoSent = processed > 0 && control('autosend')?.checked && relayToClientoTab(false);
        message.textContent = processed
          ? (autoSent
              ? `Selesai: ${processed} data diambil dan dikirim otomatis ke tab cliento! (Cadangan: Unduh JSON).`
              : `Selesai: ${processed} hasil diproses. Unduh rekap JSON, lalu impor di cliento. Kontak yang tidak tampil tetap kosong.`)
          : 'Tidak menemukan daftar bisnis. Buka hasil pencarian Maps atau gunakan Ambil profil yang terbuka.';
      }
    } catch (_) {
      message.textContent = 'Halaman Maps berubah atau tidak dapat dibaca. Data yang sudah terkumpul tetap dapat diunduh.';
    } finally {
      running = false;
      update();
    }
    return processed;
  }

  control('start').addEventListener('click', async event => {
    if (!event.isTrusted || running) return;
    if (blocked()) { message.textContent = 'Halaman dibatasi. Selesaikan pembatasan di browser sebelum memulai.'; return; }
    const limit = Number(control('limit').value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      message.textContent = 'Isi batas berupa bilangan bulat 1–5000.';
      return;
    }
    await runCollection({
      limit,
      detailEnabled: control('details').checked,
      scrollEnabled: control('scroll').checked
    });
  });

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'CLIENTO_EXT_RUN_AUTO') return false;
      if (running) {
        sendResponse({ started: false, reason: 'already_running' });
        return false;
      }
      if (blocked()) {
        sendResponse({ started: true, blocked: true });
        chrome.runtime.sendMessage({
          type: 'CLIENTO_EXT_AUTO_DONE',
          originTabId: msg.originTabId || null,
          count: 0,
          blocked: true,
          payload: null
        }).catch(() => {});
        return false;
      }
      const limit = Math.max(1, Math.min(5000, parseInt(msg.limit || '25', 10) || 25));
      if (msg.clearFirst !== false) {
        records.clear();
        update();
      }
      if (control('limit')) control('limit').value = String(limit);
      sendResponse({ started: true });
      runCollection({ limit, detailEnabled: true, scrollEnabled: true }).then((processed) => {
        const payload = buildPayload();
        relayToClientoTab(false);
        chrome.runtime.sendMessage({
          type: 'CLIENTO_EXT_AUTO_DONE',
          originTabId: msg.originTabId || null,
          count: processed,
          blocked: blocked(),
          payload
        }).catch(() => {});
      });
      return false;
    });
  }

  control('stop').addEventListener('click', event => {
    if (!event.isTrusted || !running) return;
    stopRequested = true;
    message.textContent = 'Proses dihentikan. Unduh data yang sudah terkumpul.';
    update();
  });

  control('single').addEventListener('click', event => {
    if (!event.isTrusted || running) return;
    if (blocked()) { message.textContent = 'Halaman dibatasi; pengambilan data dihentikan.'; return; }
    const record = currentProfile();
    if (!record) { message.textContent = 'Buka satu profil bisnis di Google Maps terlebih dahulu.'; return; }
    store(record);
    message.textContent = 'Profil ditambahkan ke rekap. Anda bisa mengambil profil lain atau mengunduh JSON.';
  });

  function buildPayload() {
    return {
      context: helpers.parseQueryContext(queryName || document.querySelector('#searchboxinput')?.value?.trim() || ''),
      records: Array.from(records.values()),
      sent_at: new Date().toISOString()
    };
  }

  function relayToClientoTab(manual = false) {
    if (!records.size) return false;
    const payload = buildPayload();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ cliento_latest_capture: payload }, () => {
        if (manual) {
          message.textContent = `${payload.records.length} data dikirim ke tab cliento yang terbuka (juga tersedia via Unduh JSON).`;
        }
      });
      return true;
    }
    if (manual) {
      message.textContent = 'Gunakan Unduh rekap JSON lalu impor di tab cliento.';
    }
    return false;
  }

  control('download').addEventListener('click', event => {
    if (!event.isTrusted || running || !records.size) return;
    const payload = buildPayload();
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `cliento-google-maps-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    message.textContent = 'Rekap JSON diunduh. Pilih file tersebut di menu Impor Google Maps pada cliento.';
  });

  const sendBtn = control('send');
  if (sendBtn) {
    sendBtn.addEventListener('click', event => {
      if (!event.isTrusted || running || !records.size) return;
      relayToClientoTab(true);
    });
  }

  control('clear').addEventListener('click', event => {
    if (!event.isTrusted || running) return;
    records.clear();
    update();
    message.textContent = 'Rekap dikosongkan.';
  });
})();
