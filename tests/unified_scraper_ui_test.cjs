const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Honest Multi-Engine UI, Telemetry & No-Fake-Data Guard ---');

const scraperJs = fs.readFileSync(path.join(__dirname, '../assets/js/scraper.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scraperPhp = fs.readFileSync(path.join(__dirname, '../api/scraper.php'), 'utf8');
const cloudScraperPhp = fs.readFileSync(path.join(__dirname, '../api/cloud_scraper.php'), 'utf8');
const localJs = fs.readFileSync(path.join(__dirname, '../scripts/local_headless_scraper.js'), 'utf8');

// 1. Structural HTML check: ensure scraper-right-panel is inside scraper-split-container (map sits on the RIGHT, not below!)
const splitStart = indexHtml.indexOf('<div class="scraper-split-container">');
const leftStart = indexHtml.indexOf('<div class="scraper-left-panel">', splitStart);
const rightStart = indexHtml.indexOf('<div class="scraper-right-panel">', leftStart);
assert.ok(splitStart !== -1 && leftStart !== -1 && rightStart !== -1, 'Split container, left panel, and right panel must all exist');

const betweenLeftAndRight = indexHtml.slice(leftStart, rightStart);
const openDivs = (betweenLeftAndRight.match(/<div\b/g) || []).length;
const closeDivs = (betweenLeftAndRight.match(/<\/div>/g) || []).length;
assert.equal(openDivs, closeDivs, `HTML div balance between left panel and right panel must be equal (open=${openDivs}, close=${closeDivs}) so scraper-right-panel stays inside the CSS grid!`);

// 2. UX Step Ordering & Live Diagnostics Elements
const posStep1 = indexHtml.indexOf('Langkah 1 · Mau Cari Bisnis Apa?');
const posStep2 = indexHtml.indexOf('Langkah 2 · Di Wilayah Mana?');
const posStep3 = indexHtml.indexOf('Langkah 3 · Ambil Data (1 Klik)');
assert.ok(posStep1 > 0 && posStep2 > posStep1 && posStep3 > posStep2, 'Steps must be ordered: Step 1 Target -> Step 2 Wilayah -> Step 3 1-Click Extract');
assert.ok(indexHtml.includes('id="engine-diagnostics-strip"'), 'index.html must include #engine-diagnostics-strip');
assert.ok(indexHtml.includes('id="engine-telemetry-matrix"'), 'index.html must include #engine-telemetry-matrix');
assert.ok(indexHtml.includes('id="tile-engine-hybrid"') && indexHtml.includes('value="hybrid" checked'), 'hybrid engine must be selected by default');

// 3. NO FAKE DATA GENERATOR anywhere in scraper.js!
assert.equal(scraperJs.includes('generateStaticHostLeads'), false, 'scraper.js must NEVER include fake generateStaticHostLeads generator!');
assert.equal(scraperJs.includes('0812-28'), false, 'scraper.js must NEVER synthesize fake 0812 phone numbers!');

// 4. Verify backend contracts: engine_diagnostics, Google Places positional call, URL batch, and Local Chrome real detail extraction
assert.ok(scraperPhp.includes("action === 'engine_diagnostics'"), 'api/scraper.php must expose engine_diagnostics endpoint');
assert.ok(scraperPhp.includes("action === 'run_url_batch_scrape'"), 'api/scraper.php must expose Amapulse-style run_url_batch_scrape endpoint');
assert.ok(scraperPhp.includes("start \"\" /B "), 'api/scraper.php Windows popen must quote empty title cleanly');
assert.ok(cloudScraperPhp.includes('googlePlacesSearch($cat, $loc, $lat, $lng'), 'api/cloud_scraper.php must pass positional args to googlePlacesSearch');
assert.ok(cloudScraperPhp.includes("'attempt_log' =>"), 'api/cloud_scraper.php must report attempt_log per provider');
assert.ok(localJs.includes('button[data-item-id^="phone:tel:"]'), 'local_headless_scraper.js must inspect detail pane phone selector');
assert.ok(localJs.includes("getArg('urls-file'"), 'local_headless_scraper.js must support --urls-file batch mode');
assert.ok(localJs.includes("updateProgress('collecting_links'"), 'local_headless_scraper.js must run 2-phase link collection + extraction');
assert.ok(localJs.includes("getArg('sublocations-file'"), 'local_headless_scraper.js must support sublocation expansion beyond 100 results');
assert.ok(localJs.includes('failover_to_api'), 'local_headless_scraper.js must preserve 45s failover_to_api');
const agentJs = fs.readFileSync(path.join(__dirname, '../scripts/cliento_local_agent.js'), 'utf8');
assert.ok(agentJs.includes('127.0.0.1') && agentJs.includes('Access-Control-Allow-Private-Network'), 'cliento_local_agent.js must support Chrome Private Network Access from https://cliento.my.id');

// 5. Evaluate ScraperClient in VM to verify static host refusal, Hybrid Merge separation, and clean dropdowns
const exportLine = 'window.ScraperClient = ScraperClient;';
const context = {
    window: { location: { hostname: 'recreativeid.github.io', protocol: 'https:' } },
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, querySelector() { return null; } }) },
    console,
    URL
};
vm.runInNewContext(scraperJs.slice(0, scraperJs.indexOf(exportLine) + exportLine.length), context);
const client = context.window.ScraperClient;

assert.equal(client.isStaticHost(), true, 'isStaticHost() must return true for github.io');
assert.equal(typeof client.refreshEngineDiagnostics, 'function');
assert.equal(typeof client.renderTelemetryMatrix, 'function');

// Running executeHybridScrape on static host must NEVER populate fake scrapedResults!
client.scrapedResults = [];
client.executeHybridScrape().then(async () => {
    assert.equal(client.scrapedResults.length, 0, 'Static host must NOT populate fake scrapedResults!');

    // mergeHybridLeads separation check with authentic-shaped sample records
    const mapsSample = client.normalizeMapsPlaces([{ name: 'Warung Asli', phone: '08111111111', rating: 4.8, reviews_count: 120, source: 'apify', source_name: 'Apify Google Places' }], 'Magelang', 'Apify', 'apify');
    const dorkSample = client.normalizeDorkingLeads([{ name: 'Toko Sosmed Asli', phone: '08222222222', whatsapp: '08222222222', source: 'duckduckgo_dorking', source_name: 'Dorking Instagram' }], 'Kuliner', 'Magelang');
    const merged = client.mergeHybridLeads(mapsSample, dorkSample);
    assert.equal(merged.length, 2);
    assert.equal(merged.filter(x => x.source_type !== 'google_dorking').length, 1);
    assert.equal(merged.filter(x => x.source_type === 'google_dorking').length, 1);

    // Dropdown clean labels check without (0)
    const mockSectorSelect = { value: 'semua_bidang', options: [], innerHTML: '', appendChild(opt) { this.options.push(opt); } };
    const mockCatSelect = { options: [], innerHTML: '', selectedIndex: 0, appendChild(opt) { this.options.push(opt); } };
    context.document.getElementById = id => (id === 'target-sector-select' ? mockSectorSelect : (id === 'target-category-select' ? mockCatSelect : null));
    client.territoryData = null;
    client.populateSectorsWithCounts();
    assert.ok(!mockSectorSelect.options[0].textContent.includes('(0)'), 'Sector dropdown must omit (0) when unscanned');
    assert.ok(!mockCatSelect.options[0].textContent.includes('(0)'), 'Category dropdown must omit (0) when unscanned');

    // Amapulse-style Google Maps URL Batch parser & static-host Extension JSON import check
    const parsedUrls = [...client.parseGoogleMapsUrls('https://www.google.com/maps/place/Test\nhttps://maps.app.goo.gl/abc123\nhttps://evil.example.com/maps/place/Bad\nhttps://maps.app.goo.gl/abc123')];
    assert.deepEqual(parsedUrls, ['https://www.google.com/maps/place/Test', 'https://maps.app.goo.gl/abc123'], 'URL parser must allow only Google Maps links and dedupe cleanly');

    await client.importExtensionPayload({
        context: { target_category: 'Cafe', location_name: 'Magelang' },
        records: [{
            name: 'Cafe Nyata Ekstensi',
            phone: '08123456789',
            rating: 4.9,
            reviews_count: 50,
            source_type: 'google_maps_extension',
            source_url: 'https://www.google.com/maps/place/Cafe+Nyata/data=!1sabc!3d-7.4!4d110.2'
        }]
    });
    assert.equal(client.scrapedResults.length, 1, 'Extension JSON import must work even on static GitHub Pages host');
    assert.equal(client.scrapedResults[0].name, 'Cafe Nyata Ekstensi');
    assert.equal(client.scrapedResults[0].insights.metrics.rating_available, true);

    // Spreadsheet Amapulse row transfer parser check
    const sheetLeads = client.parseAmapulseSheetRows([
        { Title: 'Kedai Suka', 'Phone Number': '08120000999', Address: 'Jl. Tidar No. 5', 'Google Maps URL': 'https://www.google.com/maps/place/Kedai+Suka', Rating: '4.7', Reviews: '310' },
        { Title: 'Tanpa Rating', Address: 'Magelang' }
    ]);
    assert.equal(sheetLeads.length, 2);
    assert.equal(sheetLeads[0].phone, '08120000999');
    assert.equal(sheetLeads[0].insights.metrics.rating_available, true);
    assert.equal(sheetLeads[1].phone, '');
    assert.equal(sheetLeads[1].insights.metrics.rating_available, false);

    // Unlimited / >1000 target limit helper verification
    let mockSelectVal = '1000';
    let mockCustomVal = '3500';
    context.document.getElementById = id => (
        id === 'scraper-batch-limit' ? { get value() { return mockSelectVal; } } :
        (id === 'scraper-custom-limit' ? { get value() { return mockCustomVal; } } : null)
    );
    assert.equal(client.getActiveBatchLimit(), 1000);
    mockSelectVal = 'custom';
    assert.equal(client.getActiveBatchLimit(), 3500);

    console.log('✓ All Honest Multi-Engine UI, Telemetry, Unlimited Limits, Amapulse URL Batch & PC Agent Bridge tests passed successfully!');
}).catch(err => {
    console.error(err);
    process.exit(1);
});
