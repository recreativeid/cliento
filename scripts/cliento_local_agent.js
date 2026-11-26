/**
 * cliento - Standalone Local PC Bridge Agent (Loopback HTTP Daemon 127.0.0.1:43210)
 *
 * Memungkinkan website online (https://cliento.my.id/) maupun localhost memicu:
 * 1. Google Chrome CDP di laptop pengguna (Auto-Save + CAPTCHA 45s + Ribuan Target)
 * 2. Sosmed WA Dorking via IP laptop pengguna (DuckDuckGo HTML/Lite tanpa blokir datacenter)
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
let dorkProbeCache = {
    checkedAt: 0,
    ready: null,
    engine: 'DuckDuckGo (Agen PC Lokal)',
    message: 'Memeriksa koneksi Sosmed Dorking dari laptop...',
    lastHttpCode: 0
};

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
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Required by Chromium Private Network Access when HTTPS pages call 127.0.0.1
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
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

function decodeHtmlEntities(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;|&#x0*27;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function unwrapDuckDuckGoUrl(rawHref) {
    let link = String(rawHref || '').replace(/&amp;/g, '&').trim();
    if (link.startsWith('//')) link = 'https:' + link;
    if (link.includes('uddg=')) {
        try {
            const u = new URL(link.startsWith('http') ? link : 'https://html.duckduckgo.com' + link);
            const uddg = u.searchParams.get('uddg');
            if (uddg) link = decodeURIComponent(uddg);
        } catch (_) {}
    }
    return link;
}

function extractPhonesFromText(text) {
    const phones = new Set();
    const s = String(text || '');
    if (!s) return [];

    // 1. Direct wa.me & api.whatsapp.com links
    const waRe = /(?:wa\.me\/|api\.whatsapp\.com\/send\?[^\s"']*?phone=)(?:62|0)?(\d{8,15})/gi;
    let m;
    while ((m = waRe.exec(s)) !== null) {
        let p = m[1];
        const norm = p.startsWith('08') ? p : '0' + p.replace(/^62/, '');
        if (norm.length >= 10 && norm.length <= 15) phones.add(norm);
    }

    // 2. Explicit WA / contact labels
    const kwRe = /(?:wa|whatsapp|hub|order|kontak|telp|hp|call)[\s:.\-/]*([0+62][\d\s\-]{8,15}\d)/gi;
    while ((m = kwRe.exec(s)) !== null) {
        let clean = m[1].replace(/[^\d]/g, '');
        if (clean.startsWith('62')) clean = '0' + clean.slice(2);
        if (clean.length >= 10 && clean.length <= 14 && clean.startsWith('08')) {
            phones.add(clean);
        }
    }

    // 3. Raw Indonesian Mobile 08xx
    const rawRe = /\b(08[1-9][0-9\s\-]{6,12}[0-9])\b/g;
    while ((m = rawRe.exec(s)) !== null) {
        const clean = m[1].replace(/[^\d]/g, '');
        if (clean.length >= 10 && clean.length <= 14) {
            phones.add(clean);
        }
    }

    return [...phones];
}

function detectPlatform(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('instagram.com')) return 'instagram';
        if (host.includes('facebook.com')) return 'facebook';
        if (host.includes('tiktok.com')) return 'tiktok';
        if (host.includes('linktr.ee')) return 'linktree';
        if (host.includes('shopee.co.id')) return 'shopee';
        if (host.includes('tokopedia.com')) return 'tokopedia';
    } catch (_) {}
    return 'website';
}

function cleanSocialTitle(title, platform) {
    let t = decodeHtmlEntities(title);
    if (platform === 'instagram') {
        t = t.replace(/\s*\(?@.*$/i, '').replace(/\s*•.*$/i, '').replace(/\s*\|\s*Instagram.*$/i, '').replace(/\s*-\s*Instagram.*$/i, '');
    } else if (platform === 'facebook') {
        t = t.replace(/\s*\|\s*Facebook.*$/i, '').replace(/\s*-\s*Home.*$/i, '');
    } else if (platform === 'tiktok') {
        t = t.replace(/\s*\|\s*TikTok.*$/i, '');
    }
    return t.trim() || 'Bisnis Online';
}

function parseDdgHtml(html) {
    const out = [];
    const blockRe = /<div[^>]+class=["'][^"']*(?:result__body|\bresult\b)[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*(?:result__body|\bresult\b)[^"']*["']|<div[^>]+id=["']links["']|<div[^>]+class=["']nav-link|$)/gi;
    let b;
    const seenUrls = new Set();
    while ((b = blockRe.exec(html)) !== null) {
        const block = b[1];
        const aMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
            || block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!aMatch) continue;
        const snipMatch = block.match(/<(?:a|div|span)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
        const url = unwrapDuckDuckGoUrl(aMatch[1]);
        const title = decodeHtmlEntities(aMatch[2]);
        const snippet = snipMatch ? decodeHtmlEntities(snipMatch[1]) : decodeHtmlEntities(block);
        if (url && url.startsWith('http') && !url.includes('duckduckgo.com') && !seenUrls.has(url)) {
            seenUrls.add(url);
            out.push({ title: title || 'Profil Bisnis', url, snippet });
        }
    }
    return out;
}

function parseDdgLite(html) {
    const out = [];
    const linkRe = /<a[^>]+class=["']result-link["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const snipRe = /<td[^>]+class=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>/gi;
    const links = [];
    const snips = [];
    let m;
    while ((m = linkRe.exec(html)) !== null) {
        links.push({ url: unwrapDuckDuckGoUrl(m[1]), title: decodeHtmlEntities(m[2]) });
    }
    while ((m = snipRe.exec(html)) !== null) {
        snips.push(decodeHtmlEntities(m[1]));
    }
    for (let i = 0; i < links.length; i++) {
        if (!links[i].url || !links[i].url.startsWith('http') || links[i].url.includes('duckduckgo.com')) continue;
        out.push({
            title: links[i].title || 'Profil Bisnis',
            url: links[i].url,
            snippet: snips[i] || ''
        });
    }
    return out;
}

async function queryDuckDuckGoFromLaptop(dorkQuery) {
    const endpoints = [
        {
            name: 'DuckDuckGo HTML (Agen PC)',
            url: 'https://html.duckduckgo.com/html/',
            referer: 'https://html.duckduckgo.com/',
            body: new URLSearchParams({ q: dorkQuery, b: '', kl: 'id-id' }).toString(),
            parser: parseDdgHtml
        },
        {
            name: 'DuckDuckGo Lite (Agen PC)',
            url: 'https://lite.duckduckgo.com/lite/',
            referer: 'https://lite.duckduckgo.com/',
            body: new URLSearchParams({ q: dorkQuery, kl: 'id-id' }).toString(),
            parser: parseDdgLite
        }
    ];

    let lastCode = 0;
    let lastError = '';
    let anyBlocked = false;

    for (const ep of endpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 14000);
        try {
            const resp = await fetch(ep.url, {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': ep.referer
                },
                body: ep.body,
                signal: controller.signal
            });
            clearTimeout(timer);
            lastCode = resp.status;
            const html = await resp.text();
            const isChallenge = resp.status === 202 || resp.status === 403 || resp.status === 429
                || /anomaly-modal|Unfortunately,\s*bots\s*use\s*DuckDuckGo/i.test(html);

            if (isChallenge) {
                anyBlocked = true;
                lastError = 'DuckDuckGo meminta verifikasi anti-bot (anomaly challenge)';
                continue;
            }
            if (!resp.ok || !html) {
                lastError = `DuckDuckGo HTTP ${resp.status}`;
                continue;
            }
            const parsed = ep.parser(html);
            if (parsed.length > 0 || ep === endpoints[endpoints.length - 1]) {
                return { ok: true, httpCode: resp.status, blocked: false, engine: ep.name, results: parsed, error: '' };
            }
        } catch (err) {
            clearTimeout(timer);
            lastError = err.message || 'Timeout menghubungi DuckDuckGo';
        }
    }

    return {
        ok: false,
        httpCode: lastCode,
        blocked: anyBlocked,
        engine: 'DuckDuckGo (Agen PC Lokal)',
        results: [],
        error: lastError || 'DuckDuckGo tidak merespons'
    };
}

async function runDorkAvailabilityProbe(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && dorkProbeCache.ready !== null && (now - dorkProbeCache.checkedAt) < 300000) {
        return dorkProbeCache;
    }
    const res = await queryDuckDuckGoFromLaptop('kopi magelang');
    const ready = !!(res.ok && !res.blocked);
    dorkProbeCache = {
        checkedAt: Date.now(),
        ready,
        engine: res.engine || 'DuckDuckGo (Agen PC Lokal)',
        lastHttpCode: res.httpCode || 0,
        message: ready
            ? 'Aktif — Sosmed WA Dorking siap via IP Laptop Anda (Bebas blokir IP hosting!)'
            : `Mati — ${res.error || 'DuckDuckGo memblokir koneksi'}`
    };
    return dorkProbeCache;
}

async function huntSocialWhatsAppFromLaptop({ category = 'bisnis', location = 'Indonesia', platform = 'all', limit = 30 }) {
    let cleanCat = String(category || '').trim() || 'bisnis';
    if (/^(all|semua|semua_bidang|all_categories)$/i.test(cleanCat)) cleanCat = 'usaha';
    const cleanLoc = String(location || '').trim() || 'Indonesia';
    const maxResults = Math.max(1, Math.min(200, parseInt(limit || '30', 10) || 30));

    const dorks = [];
    if (platform === 'instagram' || platform === 'all') {
        dorks.push({ platform: 'instagram', query: `site:instagram.com ${cleanCat} ${cleanLoc} (wa.me OR whatsapp OR 08)` });
    }
    if (platform === 'facebook' || platform === 'all') {
        dorks.push({ platform: 'facebook', query: `site:facebook.com ${cleanCat} ${cleanLoc} (wa.me OR 08)` });
    }
    if (platform === 'tiktok' || platform === 'all') {
        dorks.push({ platform: 'tiktok', query: `site:tiktok.com ${cleanCat} ${cleanLoc} (wa.me OR 08)` });
    }
    if (platform === 'website' || platform === 'all') {
        dorks.push({ platform: 'website', query: `${cleanCat} ${cleanLoc} ("wa.me/62" OR "wa.me/08" OR "api.whatsapp.com")` });
    }

    const leads = [];
    const seenPhones = new Set();
    let rawHits = 0;
    let blockedCount = 0;
    let queriesRun = 0;
    let lastHttpCode = 0;
    let lastErr = '';
    let usedEngine = 'DuckDuckGo (Agen PC Lokal)';

    for (let i = 0; i < dorks.length; i++) {
        if (leads.length >= maxResults) break;
        if (i > 0) await new Promise(r => setTimeout(r, 1400));

        queriesRun++;
        const resp = await queryDuckDuckGoFromLaptop(dorks[i].query);
        lastHttpCode = resp.httpCode;
        if (resp.engine) usedEngine = resp.engine;
        if (resp.blocked) blockedCount++;
        if (resp.error) lastErr = resp.error;

        const items = resp.results || [];
        rawHits += items.length;

        for (const item of items) {
            const phones = extractPhonesFromText(`${item.title} ${item.snippet} ${item.url}`);
            if (!phones.length) continue;

            const pf = detectPlatform(item.url);
            const cleanName = cleanSocialTitle(item.title, pf);

            for (const phone of phones) {
                if (seenPhones.has(phone)) continue;
                seenPhones.add(phone);

                leads.push({
                    name: cleanName,
                    category: cleanCat.replace(/\b\w/g, c => c.toUpperCase()),
                    address: `${cleanLoc} (Ditemukan via ${pf.charAt(0).toUpperCase() + pf.slice(1)})`,
                    phone,
                    whatsapp: phone,
                    lat: null,
                    lng: null,
                    website: item.url,
                    social_media: item.url,
                    opening_hours: 'Online / Kontak Langsung',
                    rating: 0,
                    reviews_count: 0,
                    source: 'duckduckgo_pc_agent',
                    source_type: 'google_dorking',
                    source_name: `Dorking ${pf.charAt(0).toUpperCase() + pf.slice(1)} (PC)`,
                    platform: pf,
                    snippet: item.snippet,
                    evidence_url: item.url
                });
                if (leads.length >= maxResults) break;
            }
            if (leads.length >= maxResults) break;
        }

        if (resp.blocked) break;
    }

    const engineActive = (rawHits > 0) || (blockedCount === 0 && !lastErr);
    dorkProbeCache = {
        checkedAt: Date.now(),
        ready: engineActive,
        engine: usedEngine,
        lastHttpCode,
        message: engineActive
            ? 'Aktif — Sosmed WA Dorking siap via IP Laptop Anda (Bebas blokir IP hosting!)'
            : `Mati — ${lastErr || 'DuckDuckGo memblokir koneksi'}`
    };

    return {
        success: engineActive || leads.length > 0,
        via: 'cliento_local_agent',
        category: cleanCat,
        location: cleanLoc,
        platform,
        leads,
        total: leads.length,
        diagnostics: {
            engine: usedEngine,
            active: engineActive,
            queries_run: queriesRun,
            raw_search_hits: rawHits,
            blocked_or_captcha: blockedCount > 0,
            last_http_code: lastHttpCode,
            error: lastErr
        }
    };
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
            const forceDork = urlObj.searchParams.get('fresh') === '1';
            const dorkStatus = await runDorkAvailabilityProbe(forceDork);
            res.statusCode = 200;
            res.end(JSON.stringify({
                success: true,
                active: ready,
                agent: 'cliento-local-agent',
                version: '1.1.0',
                chrome_found: !!chromeBin,
                node_version: process.version,
                running: !!(activeChild && activeChild.exitCode === null),
                dork_ready: !!dorkStatus.ready,
                dork_engine: dorkStatus.engine,
                dork_message: dorkStatus.message,
                message: ready
                    ? 'Aktif — Agen PC Lokal siap (Chrome CDP + Sosmed Dorking)'
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

        if (req.method === 'POST' && pathname === '/dork-hunt') {
            const body = await readJsonBody(req);
            const result = await huntSocialWhatsAppFromLaptop({
                category: body.category,
                location: body.location,
                platform: body.platform || 'all',
                limit: body.limit || 30
            });
            res.statusCode = 200;
            res.end(JSON.stringify(result));
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

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.log('==========================================================');
        console.log(` cliento - Agen PC Lokal SUDAH AKTIF di http://${HOST}:${PORT}`);
        console.log(' Silakan langsung buka https://cliento.my.id/ dan klik Cek Ulang.');
        console.log('==========================================================');
        process.exit(0);
    }
    console.error('Server error:', err);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log('==========================================================');
    console.log(' cliento - Agen PC Lokal v1.1.0 AKTIF');
    console.log(` Mendengarkan di: http://${HOST}:${PORT}`);
    console.log(' Chrome Lokal + Sosmed Dorking IP Laptop siap dipakai!');
    console.log('==========================================================');
});
