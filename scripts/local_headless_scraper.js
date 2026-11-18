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

function savePlaceIncrementally(place) {
    if (!place || !place.name) return;
    // Anti duplicate in memory
    const key = (place.google_maps_url || place.name).toLowerCase();
    if (collectedPlaces.some(p => (p.google_maps_url || p.name).toLowerCase() === key)) return;

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
        startHeadless ? '--window-position=-2000,-2000' : '--window-size=1200,800',
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

    // Main Scraping Loop
    let idleRounds = 0;
    const maxRounds = 60;

    for (let round = 0; round < maxRounds; round++) {
        if (collectedPlaces.length >= limit) {
            console.log(`\n Target tercapai: ${collectedPlaces.length}/${limit} data berhasil dikumpulkan!`);
            break;
        }

        await sleep(2000);

        // Check for CAPTCHA / Sorry URL
        const urlEval = await send('Runtime.evaluate', { expression: 'window.location.href' });
        const currentUrl = urlEval.result?.value || '';

        const isCaptcha = currentUrl.includes('google.com/sorry') ||
            (await send('Runtime.evaluate', {
                expression: '!!(document.querySelector("#captcha-form, iframe[src*=\'recaptcha\'], .g-recaptcha"))'
            })).result?.value;

        if (isCaptcha) {
            console.log('\n⚠️ PERHATIAN: Google menampilkan layar verifikasi CAPTCHA!');
            triggerAudioAlert();

            // Bring window to visible foreground
            try {
                if (process.platform === 'win32') {
                    execSync(`powershell.exe -NoProfile -Command "(Get-Process -Name chrome, msedge -ErrorAction SilentlyContinue) | ForEach-Object { (New-Object -ComObject WScript.Shell).AppActivate($_.Id) }"`, { stdio: 'ignore' });
                }
            } catch (_) {}

            updateProgress('captcha_required', collectedPlaces.length, true);

            console.log('Menunggu Anda menyelesaikan CAPTCHA di layar (Batas waktu: 45 detik)...');
            let solved = false;
            for (let sec = 45; sec > 0; sec--) {
                process.stdout.write(`\rSisa waktu: ${sec} detik... `);
                await sleep(1000);
                const checkUrl = (await send('Runtime.evaluate', { expression: 'window.location.href' })).result?.value || '';
                if (!checkUrl.includes('google.com/sorry')) {
                    solved = true;
                    break;
                }
            }

            if (solved) {
                console.log('\n✅ CAPTCHA Berhasil diselesaikan! Melanjutkan scraping...');
                updateProgress('running', collectedPlaces.length, false);
                await sleep(2000);
                continue;
            } else {
                console.log('\n⏰ Batas 45 detik habis.');
                console.log(`[Fail-safe] ${collectedPlaces.length} data yang sudah didapat tetap aman tersimpan!`);
                console.log('Mengalihkan sisa target ke Cloud API (Failover)...\n');

                // Write failover signal file
                fs.writeFileSync(failoverFile, JSON.stringify({
                    query,
                    collected: collectedPlaces.length,
                    remaining: Math.max(1, limit - collectedPlaces.length),
                    reason: 'captcha_timeout',
                    created_at: new Date().toISOString()
                }, null, 2), 'utf-8');

                updateProgress('failover_to_api', collectedPlaces.length);
                break;
            }
        }

        // Evaluate and extract cards in Google Maps feed
        const extractScript = `
            (() => {
                const results = [];
                const cards = document.querySelectorAll('div[role="feed"] div.Nv2PK, div.m6QErb div.Nv2PK');
                cards.forEach(card => {
                    const titleEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, [role="heading"]');
                    if (!titleEl) return;
                    const name = titleEl.textContent.trim();
                    if (!name) return;

                    const linkEl = card.querySelector('a.hfpxzc, a[href*="/maps/place/"]');
                    const mapsUrl = linkEl ? linkEl.href : '';

                    // Rating and reviews
                    let rating = 0;
                    let reviews = 0;
                    const starEl = card.querySelector('span.MW4etd');
                    if (starEl) rating = parseFloat(starEl.textContent.replace(',', '.')) || 0;
                    const revEl = card.querySelector('span.UY7F9');
                    if (revEl) {
                        const m = revEl.textContent.replace(/[(),]/g, '').trim();
                        reviews = parseInt(m, 10) || 0;
                    }

                    // Text details
                    const textElements = card.querySelectorAll('.W4Efsd');
                    let address = '';
                    let category = 'Bisnis';
                    let phone = '';

                    textElements.forEach(el => {
                        const t = el.textContent.trim();
                        if (!t) return;
                        const phoneMatch = t.match(/(?:\\+?62|08)[0-9\\s\\-]{8,15}/);
                        if (phoneMatch && !phone) phone = phoneMatch[0].replace(/[^0-9]/g, '');
                        if (!address && (t.includes('Jl.') || t.includes('Kec.') || t.includes('Kab.') || t.includes('Kota'))) {
                            address = t;
                        }
                    });

                    results.push({
                        name,
                        category,
                        address: address || 'Google Maps',
                        phone,
                        whatsapp: (phone.startsWith('08') || phone.startsWith('628')) ? phone : '',
                        rating,
                        reviews_count: reviews,
                        google_maps_url: mapsUrl,
                        source: 'local_headless',
                        source_type: 'google_maps',
                        source_name: 'Chrome Mesin Lokal'
                    });
                });
                return results;
            })()
        `;

        const evalRes = await send('Runtime.evaluate', { expression: extractScript, returnByValue: true });
        const items = evalRes.result?.value || [];

        let newItemsFound = 0;
        for (const item of items) {
            const beforeCount = collectedPlaces.length;
            savePlaceIncrementally(item);
            if (collectedPlaces.length > beforeCount) newItemsFound++;
            if (collectedPlaces.length >= limit) break;
        }

        // Scroll the feed down
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollBy(0, 1200);
                    else window.scrollBy(0, 1000);
                })()
            `
        });

        if (newItemsFound === 0) idleRounds++;
        else idleRounds = 0;

        if (idleRounds >= 6) {
            console.log('Tidak ada tempat baru yang ditemukan dalam beberapa putaran scroll.');
            break;
        }
    }

    updateProgress('completed', collectedPlaces.length);
    console.log(`\n Selesai! Total ${collectedPlaces.length} data tersimpan di ${latestFile}`);

    // Clean up Chrome process
    try { chromeProc.kill(); } catch (_) {}
}

main().catch(err => {
    console.error('Fatal Error:', err);
    updateProgress('error', collectedPlaces.length);
    process.exit(1);
});
