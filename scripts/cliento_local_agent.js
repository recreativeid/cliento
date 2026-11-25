/**
 * cliento - Standalone Local PC Bridge Agent (Loopback HTTP Daemon 127.0.0.1:43210)
 *
 * Memungkinkan website online (https://cliento.my.id/) maupun localhost memicu
 * Google Chrome di laptop/PC pengguna secara langsung (Auto-Save + CAPTCHA 45s + Ribuan Target).
 * Tanpa dependensi eksternal (Zero npm install) - cukup Node.js & Google Chrome / Edge.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.CLIENTO_AGENT_PORT || '43210', 10);
const HOST = '127.0.0.1';
const BASE_DIR = path.resolve(__dirname, '..');
const STORAGE_DIR = path.join(BASE_DIR, 'storage');
const SCRAPER_SCRIPT = path.join(__dirname, 'local_headless_scraper.js');

if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

let activeChild = null;

function findChromeExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium'
    ];
    return candidates.find(p => p && fs.existsSync(p)) || null;
}

function setCorsHeaders(req, res) {
    const origin = req.headers.origin || '';
    const allowed = [
        'https://cliento.my.id',
        'https://www.cliento.my.id',
        'https://recreativeid.github.io',
        'http://localhost',
        'http://127.0.0.1'
    ];
    let allowOrigin = 'https://cliento.my.id';
    if (origin && allowed.some(prefix => origin === prefix || origin.startsWith(prefix + ':'))) {
        allowOrigin = origin;
    } else if (!origin) {
        allowOrigin = '*';
    }
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Required by Chromium Private Network Access when HTTPS pages call 127.0.0.1
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 5 * 1024 * 1024) reject(new Error('Payload terlalu besar'));
        });
        req.on('end', () => {
            if (!raw.trim()) return resolve({});
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(new Error('JSON tidak valid')); }
        });
        req.on('error', reject);
    });
}

function writeInitialProgress(queryLabel, limit) {
    const failoverFile = path.join(STORAGE_DIR, 'local_scrape_failover.json');
    const progressFile = path.join(STORAGE_DIR, 'local_scrape_progress.json');
    try { if (fs.existsSync(failoverFile)) fs.unlinkSync(failoverFile); } catch (_) {}
    fs.writeFileSync(progressFile, JSON.stringify({
        query: queryLabel,
        target_limit: limit,
        collected_count: 0,
        status: 'starting_browser',
        captcha_prompt: false,
        updated_at: new Date().toISOString(),
        places: []
    }, null, 2), 'utf-8');
}

function launchLocalScraper(args, queryLabel, limit) {
    if (activeChild && activeChild.exitCode === null) {
        try { activeChild.kill(); } catch (_) {}
    }
    writeInitialProgress(queryLabel, limit);
    const logFd = fs.openSync(path.join(STORAGE_DIR, 'local_scrape.log'), 'w');
    activeChild = spawn(process.execPath, [SCRAPER_SCRIPT, ...args], {
        cwd: BASE_DIR,
        stdio: ['ignore', logFd, logFd]
    });
    activeChild.on('exit', () => {
        try { fs.closeSync(logFd); } catch (_) {}
    });
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${HOST}:${PORT}`);
    const pathname = urlObj.pathname;

    try {
        if (req.method === 'GET' && (pathname === '/status' || pathname === '/')) {
            const chromeBin = findChromeExecutable();
            const ready = !!(chromeBin && fs.existsSync(SCRAPER_SCRIPT));
            res.statusCode = 200;
            res.end(JSON.stringify({
                success: true,
                active: ready,
                agent: 'cliento-local-agent',
                version: '1.0.0',
                chrome_found: !!chromeBin,
                node_version: process.version,
                running: !!(activeChild && activeChild.exitCode === null),
                message: ready
                    ? 'Aktif — Agen PC Lokal siap (Chrome CDP + Auto-Save + CAPTCHA 45s)'
                    : 'Chrome / Edge tidak ditemukan di laptop ini'
            }));
            return;
        }

        if (req.method === 'GET' && pathname === '/progress') {
            const progressFile = path.join(STORAGE_DIR, 'local_scrape_progress.json');
            const failoverFile = path.join(STORAGE_DIR, 'local_scrape_failover.json');
            if (!fs.existsSync(progressFile)) {
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, status: 'idle', collected_count: 0, places: [] }));
                return;
            }
            let data = { status: 'idle', collected_count: 0, places: [] };
            try { data = JSON.parse(fs.readFileSync(progressFile, 'utf-8')); } catch (_) {}
            let failover = null;
            if (fs.existsSync(failoverFile)) {
                try { failover = JSON.parse(fs.readFileSync(failoverFile, 'utf-8')); } catch (_) {}
            }
            data.failover = failover;
            data.success = true;
            res.statusCode = 200;
            res.end(JSON.stringify(data));
            return;
        }

        if (req.method === 'POST' && pathname === '/scrape') {
            const body = await readJsonBody(req);
            const query = String(body.query || '').trim() || 'bisnis di Indonesia';
            const limit = Math.max(1, Math.min(50000, parseInt(body.limit || '25', 10) || 25));
            const headless = body.headless !== false;
            const sublocations = Array.isArray(body.sublocations) ? body.sublocations.filter(Boolean) : [];

            const args = [
                `--query=${query}`,
                `--limit=${limit}`,
                `--headless=${headless ? 'true' : 'false'}`
            ];
            if (sublocations.length > 0) {
                const subFile = path.join(STORAGE_DIR, 'local_sublocations.json');
                fs.writeFileSync(subFile, JSON.stringify({ sublocations }, null, 2), 'utf-8');
                args.push(`--sublocations-file=${subFile}`);
            }

            launchLocalScraper(args, query, limit);
            res.statusCode = 200;
            res.end(JSON.stringify({
                success: true,
                via: 'cliento_local_agent',
                message: `Chrome lokal dimulai di laptop Anda (target: ${limit} tempat).`,
                query,
                limit
            }));
            return;
        }

        if (req.method === 'POST' && pathname === '/scrape-urls') {
            const body = await readJsonBody(req);
            const rawUrls = Array.isArray(body.urls) ? body.urls : [];
            const seen = new Set();
            const validUrls = [];
            for (const raw of rawUrls) {
                const u = String(raw || '').trim();
                try {
                    const parsed = new URL(u);
                    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
                    const h = parsed.hostname.toLowerCase();
                    if (/^(?:www\.|maps\.)?google\.(com|co\.id)$/.test(h) || h === 'maps.app.goo.gl' || h === 'goo.gl') {
                        if (!seen.has(parsed.href)) {
                            seen.add(parsed.href);
                            validUrls.push(parsed.href);
                        }
                    }
                } catch (_) {}
                if (validUrls.length >= 5000) break;
            }
            if (!validUrls.length) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, message: 'Tidak ada tautan Google Maps valid yang dikirim.' }));
                return;
            }

            const batchFile = path.join(STORAGE_DIR, 'local_url_batch.json');
            fs.writeFileSync(batchFile, JSON.stringify({ urls: validUrls }, null, 2), 'utf-8');
            const label = `Batch Link Google Maps (${validUrls.length} URL)`;
            launchLocalScraper([`--urls-file=${batchFile}`, `--query=${label}`, `--limit=${validUrls.length}`, `--headless=${body.headless === false ? 'false' : 'true'}`], label, validUrls.length);

            res.statusCode = 200;
            res.end(JSON.stringify({
                success: true,
                via: 'cliento_local_agent',
                message: `Mengekstrak ${validUrls.length} link Google Maps langsung di Chrome laptop Anda...`,
                query: label,
                limit: validUrls.length
            }));
            return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ success: false, message: 'Endpoint tidak dikenal.' }));
    } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, message: err.message }));
    }
});

server.listen(PORT, HOST, () => {
    console.log('==========================================================');
    console.log(' cliento - Agen Chrome PC Lokal AKTIF');
    console.log(` Mendengarkan di: http://${HOST}:${PORT}`);
    console.log(' Sekarang buka https://cliento.my.id/ dan klik Cek Ulang!');
    console.log(' Jangan tutup jendela ini selama proses scraping berjalan.');
    console.log('==========================================================');
});
