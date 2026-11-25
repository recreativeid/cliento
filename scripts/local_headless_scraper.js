/**
 * cliento - Local Chrome Scraper Engine (Zero-Dependency Node.js 24 + CDP)
 * 
 * Fitur Utama:
 * 1. Menjalankan Google Chrome lokal via Chrome DevTools Protocol (CDP) tanpa butuh npm install.
 * 2. Incremental Auto-Save: Setiap 1 data tempat terambil langsung disimpan ke file JSON (tidak ada data hilang).
 * 3. Deteksi CAPTCHA Interaktif:
 *    - Jika muncul CAPTCHA, browser otomatis dibuka ke layar (Pop-up).
 *    - Komputer membunyikan nada peringatan (beep).
 *    - Timer hitung mundur 45 detik: jika diselesaikan pengguna, browser kembali sembunyi dan lanjut.
 *    - Jika 45 detik lewat tanpa respons: script menyimpan semua data yang sudah didapat dan menulis sinyal failover ke Cloud API!
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
    const prefix = `--${name}=`;
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.substring(prefix.length) : defaultValue;
}

const query = getArg('query', 'kuliner di Magelang');
const limit = parseInt(getArg('limit', '25'), 10);
const startHeadless = getArg('headless', 'true') === 'true';
const storageDir = path.resolve(__dirname, '../storage');

if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

const progressFile = path.join(storageDir, 'local_scrape_progress.json');
const latestFile = path.join(storageDir, 'local_scrape_latest.json');
const failoverFile = path.join(storageDir, 'local_scrape_failover.json');

// Initialize State
let collectedPlaces = [];
let isCaptchaActive = false;
let isFinished = false;

// Remove old failover file if exists
try { if (fs.existsSync(failoverFile)) fs.unlinkSync(failoverFile); } catch (_) {}

function updateProgress(status, currentCount = collectedPlaces.length, captchaPrompt = false) {
    const payload = {
        query,
        target_limit: limit,
        collected_count: currentCount,
        status,
        captcha_prompt: captchaPrompt,
        updated_at: new Date().toISOString(),
        places: collectedPlaces
    };
    try {
        fs.writeFileSync(progressFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error writing progress file:', e.message);
    }
}

function cleanTextGlyphs(value) {
    return String(value || '')
        .replace(/[\uE000-\uF8FF]/g, ' ')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function savePlaceIncrementally(place) {
    if (!place || !place.name) return false;
    place.name = cleanTextGlyphs(place.name);
    place.address = cleanTextGlyphs(place.address);
    place.phone = cleanTextGlyphs(place.phone);
    place.opening_hours = cleanTextGlyphs(place.opening_hours);

    // Anti-duplicate across both place URL identity and normalized name+phone
    const normName = place.name.toLowerCase();
    const normPhone = (place.phone || '').replace(/[^\d]/g, '');
    const normAddr = (place.address || '').toLowerCase().slice(0, 35);
    const existingIdx = collectedPlaces.findIndex(p => {
        if (p.name.toLowerCase() !== normName) return false;
        const pPhone = (p.phone || '').replace(/[^\d]/g, '');
        if (normPhone && pPhone) return pPhone === normPhone;
        return (p.address || '').toLowerCase().slice(0, 35) === normAddr;
    });

    if (existingIdx !== -1) {
        // Enrich missing fields (like coordinates or permanent /maps/place/ URL) without duplicating
        const cur = collectedPlaces[existingIdx];
        if (!cur.lat && place.lat) cur.lat = place.lat;
        if (!cur.lng && place.lng) cur.lng = place.lng;
        if (place.google_maps_url && place.google_maps_url.includes('/maps/place/')) {
            cur.google_maps_url = place.google_maps_url;
        }
        return false;
    }

    collectedPlaces.push(place);
    console.log(`[Auto-Save] [${collectedPlaces.length}/${limit}] ${place.name} | Telp: ${place.phone || '-'} (Tersimpan ke database lokal)`);

    updateProgress('running', collectedPlaces.length, false);

    // Save full latest archive
    try {
        fs.writeFileSync(latestFile, JSON.stringify({
            query,
            total: collectedPlaces.length,
            saved_at: new Date().toISOString(),
            places: collectedPlaces
        }, null, 2), 'utf-8');
    } catch (_) {}
    return true;
}

function triggerAudioAlert() {
    process.stdout.write('\x07');
    try {
        if (process.platform === 'win32') {
            execSync('powershell.exe -NoProfile -Command "[System.Console]::Beep(1200, 300); [System.Console]::Beep(1600, 400)"', { stdio: 'ignore' });
        }
    } catch (_) {}
}

// Find Chrome Executable
function findChromeExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectCdp(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let idCounter = 1;
        const pending = new Map();

        ws.onopen = () => resolve({ ws, send });
        ws.onerror = err => reject(err);

        ws.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.id && pending.has(msg.id)) {
                    const { resolve: res, reject: rej } = pending.get(msg.id);
                    pending.delete(msg.id);
                    if (msg.error) rej(new Error(msg.error.message || 'CDP Error'));
                    else res(msg.result);
                }
            } catch (_) {}
        };

        function send(method, params = {}) {
            return new Promise((res, rej) => {
                const id = idCounter++;
                pending.set(id, { resolve: res, reject: rej });
                ws.send(JSON.stringify({ id, method, params }));
            });
        }
    });
}

async function main() {
    console.log('========================================================');
    console.log('cliento - Local Chrome Scraper Engine');
    console.log(`Target: "${query}" | Batas: ${limit} tempat`);
    console.log('Fitur: Incremental Auto-Save + Popup CAPTCHA 45s Fail-safe');
    console.log('========================================================\n');

    const chromePath = findChromeExecutable();
    if (!chromePath) {
        console.error('ERROR: Google Chrome atau Microsoft Edge tidak ditemukan di laptop.');
        process.exit(1);
    }

    const port = 9222 + Math.floor(Math.random() * 50);
    const userDataDir = path.join(storageDir, 'chrome_temp_profile');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const chromeArgs = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--lang=id-ID',
        '--window-size=1366,850',
        startHeadless ? '--window-position=-2000,-2000' : '--window-position=80,60',
        `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=id`
    ];

    console.log(`Memulai Chrome via port debugging: ${port}...`);
    const chromeProc = spawn(chromePath, chromeArgs, { detached: false, stdio: 'ignore' });

    updateProgress('starting_browser', 0);

    // Wait for Chrome debugging endpoint to become ready
    let target = null;
    for (let i = 0; i < 20; i++) {
        await sleep(600);
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/list`);
            const list = await res.json();
            target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (target) break;
        } catch (_) {}
    }

    if (!target) {
        console.error('Gagal menghubungkan ke Chrome DevTools.');
        chromeProc.kill();
        process.exit(1);
    }

    console.log('Terhubung ke Chrome DevTools Protocol!');
    const { send } = await connectCdp(target.webSocketDebuggerUrl);

    // Enable Page & Runtime domains
    await send('Page.enable');
    await send('Runtime.enable');

    console.log(`Membuka pencarian Google Maps untuk: "${query}"...`);
    updateProgress('loading_maps', 0);

    // Main Scraping Loop: Click real Google Maps cards to extract verified profile details
    const visitedKeys = new Set();
    let idleRounds = 0;
    const maxRounds = 45;

    async function checkAndHandleCaptcha() {
        const urlEval = await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
        const currentUrl = urlEval.result?.value || '';
        const domCaptcha = (await send('Runtime.evaluate', {
            expression: '!!(document.querySelector("#captcha-form, iframe[src*=\'recaptcha\'], iframe[src*=\'hcaptcha\'], .g-recaptcha"))',
            returnByValue: true
        })).result?.value;

        if (!(currentUrl.includes('google.com/sorry') || domCaptcha)) {
            return 'ok';
        }

        console.log('\n⚠️ PERHATIAN: Google menampilkan layar verifikasi CAPTCHA!');
        triggerAudioAlert();

        // Bring Chrome window to visible screen position and focus it
        try {
            const winInfo = await send('Browser.getWindowForTarget').catch(() => null);
            if (winInfo && winInfo.windowId) {
                await send('Browser.setWindowBounds', {
                    windowId: winInfo.windowId,
                    bounds: { left: 80, top: 60, width: 1100, height: 760, windowState: 'normal' }
                }).catch(() => {});
            }
            if (process.platform === 'win32') {
                execSync(`powershell.exe -NoProfile -Command "(Get-Process -Name chrome, msedge -ErrorAction SilentlyContinue) | ForEach-Object { (New-Object -ComObject WScript.Shell).AppActivate($_.Id) }"`, { stdio: 'ignore' });
            }
        } catch (_) {}

        updateProgress('captcha_required', collectedPlaces.length, true);
        console.log('Menunggu Anda menyelesaikan CAPTCHA di layar (Batas waktu: 45 detik)...');

        let solved = false;
        for (let sec = 45; sec > 0; sec--) {
            process.stdout.write(`\rSisa waktu CAPTCHA: ${sec} detik... `);
            await sleep(1000);
            const checkUrl = (await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true })).result?.value || '';
            const stillDom = (await send('Runtime.evaluate', {
                expression: '!!(document.querySelector("#captcha-form, iframe[src*=\'recaptcha\'], iframe[src*=\'hcaptcha\']"))',
                returnByValue: true
            })).result?.value;
            if (!checkUrl.includes('sorry') && !stillDom) {
                solved = true;
                break;
            }
        }

        if (solved) {
            console.log('\n✅ CAPTCHA Berhasil diselesaikan! Melanjutkan scraping...');
            if (startHeadless) {
                const winInfo = await send('Browser.getWindowForTarget').catch(() => null);
                if (winInfo && winInfo.windowId) {
                    await send('Browser.setWindowBounds', {
                        windowId: winInfo.windowId,
                        bounds: { left: -2000, top: -2000, width: 1100, height: 760 }
                    }).catch(() => {});
                }
            }
            updateProgress('running', collectedPlaces.length, false);
            await sleep(1500);
            return 'solved';
        }

        console.log('\n⏰ Batas 45 detik habis.');
        console.log(`[Fail-safe] ${collectedPlaces.length} data yang sudah didapat tetap aman tersimpan!`);
        console.log('Mengalihkan sisa target ke Cloud API (Failover Merge)...\n');

        fs.writeFileSync(failoverFile, JSON.stringify({
            query,
            collected: collectedPlaces.length,
            remaining: Math.max(1, limit - collectedPlaces.length),
            reason: 'captcha_timeout',
            created_at: new Date().toISOString()
        }, null, 2), 'utf-8');

        updateProgress('failover_to_api', collectedPlaces.length, false);
        return 'failover';
    }

    for (let round = 0; round < maxRounds; round++) {
        if (collectedPlaces.length >= limit) {
            console.log(`\n Target tercapai: ${collectedPlaces.length}/${limit} data real berhasil dikumpulkan!`);
            break;
        }

        const capState = await checkAndHandleCaptcha();
        if (capState === 'failover') break;

        // Gather unseen card links in Google Maps feed
        const candidatesRes = await send('Runtime.evaluate', {
            returnByValue: true,
            expression: `(() => {
                const feed = document.querySelector('[role="feed"]');
                if (!feed) return [];
                const list = [];
                const seen = new Set();
                feed.querySelectorAll('a[href*="/maps/place/"]').forEach((a, idx) => {
                    const href = a.href || '';
                    const m = href.match(/!1s([^!/?]+)/);
                    const key = m ? m[1] : href.split('?')[0];
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    const name = (a.getAttribute('aria-label') || a.textContent || '').trim();
                    if (!name) return;
                    list.push({ key, name, href });
                });
                return list;
            })()`
        });

        const candidates = (candidatesRes.result?.value || []).filter(c => !visitedKeys.has(c.key));
        let openedAny = false;

        for (const cand of candidates) {
            if (collectedPlaces.length >= limit) break;
            visitedKeys.add(cand.key);
            openedAny = true;

            const capInner = await checkAndHandleCaptcha();
            if (capInner === 'failover') {
                round = maxRounds;
                break;
            }

            // Capture current visible heading before clicking so we detect transition cleanly
            const prevStateRes = await send('Runtime.evaluate', {
                returnByValue: true,
                expression: `(() => {
                    const h1 = Array.from(document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge')).find(el => el.getClientRects().length > 0);
                    return { name: h1 ? (h1.innerText || '').trim() : '', href: window.location.href };
                })()`
            });
            const prevName = prevStateRes.result?.value?.name || '';
            const prevHref = prevStateRes.result?.value?.href || '';

            // Click matching card in DOM using canonical Place ID key or href
            const clickedRes = await send('Runtime.evaluate', {
                returnByValue: true,
                expression: `(() => {
                    const links = Array.from(document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]'));
                    const target = links.find(a => {
                        const h = a.href || '';
                        return h === ${JSON.stringify(cand.href)} || h.includes(${JSON.stringify(cand.key)});
                    });
                    if (target) {
                        target.scrollIntoView({ block: 'center' });
                        target.click();
                        return true;
                    }
                    return false;
                })()`
            });
            if (!clickedRes.result?.value) continue;

            // Poll up to 4.2s for detail pane AND URL to actually switch to the clicked card
            let transitioned = false;
            for (let t = 0; t < 17; t++) {
                await sleep(250);
                const chk = await send('Runtime.evaluate', {
                    returnByValue: true,
                    expression: `(() => {
                        const h1 = Array.from(document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge')).find(el => el.getClientRects().length > 0);
                        return { name: h1 ? (h1.innerText || '').trim() : '', href: window.location.href };
                    })()`
                });
                const curName = chk.result?.value?.name || '';
                const curHref = chk.result?.value?.href || '';
                if (curName && curName !== prevName && curHref !== prevHref && curHref.includes('/maps/place/')) {
                    transitioned = true;
                    break;
                }
            }
            if (!transitioned) {
                await sleep(400);
            }

            // Read ONLY observed fields from the active [role="main"] detail pane
            const profileRes = await send('Runtime.evaluate', {
                returnByValue: true,
                expression: `(() => {
                    const headings = Array.from(document.querySelectorAll('h1.DUwDvf, h1.fontHeadlineLarge'));
                    const h1 = headings.find(el => el.getClientRects().length > 0);
                    if (!h1) return null;
                    const root = h1.closest('[role="main"]') || document;
                    const txt = sel => {
                        const el = Array.from(root.querySelectorAll(sel)).find(n => n.getClientRects().length > 0);
                        return el ? (el.innerText || el.getAttribute('aria-label') || '').trim() : '';
                    };

                    const phoneEl = Array.from(root.querySelectorAll('button[data-item-id^="phone:tel:"], a[href^="tel:"]')).find(n => n.getClientRects().length > 0);
                    let rawPhone = '';
                    if (phoneEl) {
                        rawPhone = phoneEl.getAttribute('data-item-id')?.replace(/^phone:tel:/, '')
                            || phoneEl.getAttribute('href')?.replace(/^tel:/i, '')
                            || (phoneEl.innerText || phoneEl.getAttribute('aria-label') || '').replace(/^(Telepon|Phone):\\s*/i, '');
                    }
                    rawPhone = String(rawPhone || '').trim();
                    const digits = rawPhone.replace(/[^0-9+]/g, '');
                    let waPhone = '';
                    if (digits.startsWith('+628')) waPhone = digits.slice(1);
                    else if (digits.startsWith('628')) waPhone = digits;
                    else if (digits.startsWith('08')) waPhone = '62' + digits.slice(1);

                    const webEl = Array.from(root.querySelectorAll('a[data-item-id="authority"]')).find(n => n.getClientRects().length > 0);
                    const website = webEl && /^https?:\\/\\//i.test(webEl.href || '') ? webEl.href : '';

                    let rating = 0;
                    let reviews = 0;
                    const starText = txt('.F7nice span[aria-hidden="true"]');
                    if (starText) rating = parseFloat(starText.replace(',', '.')) || 0;
                    root.querySelectorAll('.F7nice [aria-label]').forEach(el => {
                        const lbl = el.getAttribute('aria-label') || '';
                        const rm = lbl.match(/(\\d+(?:[.,\\s]\\d{3})*)\\s*(?:ulasan|reviews?|penilaian)/i);
                        if (rm && !reviews) reviews = parseInt(rm[1].replace(/[.,\\s]/g, ''), 10) || 0;
                    });

                    const href = window.location.href;
                    const coordMatch = [...href.matchAll(/!3d(-?\\d+(?:\\.\\d+)?)!4d(-?\\d+(?:\\.\\d+)?)/g)].at(-1);
                    const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
                    const lng = coordMatch ? parseFloat(coordMatch[2]) : null;

                    return {
                        name: (h1.innerText || '').trim(),
                        category: txt('button.DkEaL') || 'Bisnis',
                        address: txt('button[data-item-id="address"]').replace(/^(Alamat|Address):\\s*/i, ''),
                        phone: rawPhone,
                        whatsapp: waPhone,
                        website: website,
                        opening_hours: txt('[data-item-id="oh"], button[jsaction*="pane.openhours"]').replace(/\\s+/g, ' ').trim(),
                        rating,
                        reviews_count: reviews,
                        lat,
                        lng,
                        google_maps_url: href,
                        source: 'local_headless',
                        source_type: 'google_maps',
                        source_name: 'Chrome Mesin Lokal'
                    };
                })()`
            });

            const place = profileRes.result?.value;
            if (place && place.name) {
                savePlaceIncrementally(place);
            }
        }

        if (collectedPlaces.length >= limit) break;

        // Scroll feed down to load more genuine places
        await send('Runtime.evaluate', {
            expression: `(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) feed.scrollBy(0, 1200);
                else window.scrollBy(0, 1000);
            })()`
        });
        await sleep(1600);

        if (!openedAny) idleRounds++;
        else idleRounds = 0;

        if (idleRounds >= 6) {
            console.log('Tidak ada hasil baru yang muncul di Google Maps setelah beberapa putaran scroll.');
            break;
        }
    }

    if (fs.existsSync(failoverFile)) {
        updateProgress('failover_to_api', collectedPlaces.length, false);
    } else {
        updateProgress('completed', collectedPlaces.length, false);
    }
    console.log(`\n Selesai! Total ${collectedPlaces.length} data asli tersimpan di ${latestFile}`);

    // Clean up Chrome process
    try { chromeProc.kill(); } catch (_) {}
}

main().catch(err => {
    console.error('Fatal Error:', err);
    updateProgress('error', collectedPlaces.length);
    process.exit(1);
});
