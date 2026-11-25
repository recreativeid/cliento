const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Unified Hybrid Scraper UI & Static Host Fallback ---');

const scraperJs = fs.readFileSync(path.join(__dirname, '../assets/js/scraper.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// 1. Structural HTML check: ensure scraper-right-panel is inside scraper-split-container (map sits on the RIGHT, not below!)
const splitStart = indexHtml.indexOf('<div class="scraper-split-container">');
const leftStart = indexHtml.indexOf('<div class="scraper-left-panel">', splitStart);
const rightStart = indexHtml.indexOf('<div class="scraper-right-panel">', leftStart);
assert.ok(splitStart !== -1 && leftStart !== -1 && rightStart !== -1, 'Split container, left panel, and right panel must all exist');

const betweenLeftAndRight = indexHtml.slice(leftStart, rightStart);
const openDivs = (betweenLeftAndRight.match(/<div\b/g) || []).length;
const closeDivs = (betweenLeftAndRight.match(/<\/div>/g) || []).length;
assert.equal(openDivs, closeDivs, `HTML div balance between left panel and right panel must be equal (open=${openDivs}, close=${closeDivs}) so scraper-right-panel stays inside the CSS grid!`);

// 2. UX Step Ordering: Langkah 1 (Target Usaha) comes BEFORE Langkah 2 (Wilayah), followed by Langkah 3 (1 Button)
const posStep1 = indexHtml.indexOf('Langkah 1 · Mau Cari Bisnis Apa?');
const posStep2 = indexHtml.indexOf('Langkah 2 · Di Wilayah Mana?');
const posStep3 = indexHtml.indexOf('Langkah 3 · Ambil Data (1 Klik)');
assert.ok(posStep1 > 0 && posStep2 > posStep1 && posStep3 > posStep2, 'Steps must be ordered: Step 1 Target -> Step 2 Wilayah -> Step 3 1-Click Extract');

// 3. Default engine must be hybrid (Google Maps + Sosmed Dorking in 1 button)
assert.ok(indexHtml.includes('id="tile-engine-hybrid"'), 'index.html must include hybrid engine option');
assert.ok(indexHtml.includes('value="hybrid" checked'), 'hybrid engine must be checked by default');
assert.ok(!indexHtml.includes('Semua Bidang Usaha (Semua Kategori)</option>'), 'Sector default option should be concise without clutter');

// 4. Evaluate ScraperClient in VM to verify Hybrid Merge, clean dropdowns without (0), and keyword priority
const exportLine = 'window.ScraperClient = ScraperClient;';
const context = { window: { location: { hostname: 'recreativeid.github.io', protocol: 'https:' } }, document: { getElementById: () => null }, console, URL };
vm.runInNewContext(scraperJs.slice(0, scraperJs.indexOf(exportLine) + exportLine.length), context);
const client = context.window.ScraperClient;

assert.equal(client.isStaticHost(), true, 'isStaticHost() must return true for github.io');
assert.equal(typeof client.executeHybridScrape, 'function', 'executeHybridScrape must exist');
assert.equal(typeof client.mergeHybridLeads, 'function', 'mergeHybridLeads must exist');
assert.equal(typeof client.pollLocalScraper, 'function', 'pollLocalScraper must exist');

// Test mergeHybridLeads keeps Google Maps and Sosmed Dorking cleanly separated for filter tabs
const mapsLeads = client.generateStaticHostLeads('kuliner', 'Magelang Utara', 3, 'cloud');
const dorkLeads = client.generateStaticHostLeads('kuliner', 'Magelang Utara', 2, 'dorking');
const merged = client.mergeHybridLeads(mapsLeads, dorkLeads);
assert.equal(merged.length, 5, 'Merged leads should preserve both Maps and Dorking entries');
assert.equal(merged.filter(x => x.source_type !== 'google_dorking').length, 3, 'Tab 1 (Google Maps) count must match');
assert.equal(merged.filter(x => x.source_type === 'google_dorking').length, 2, 'Tab 2 (Sosmed Dorking) count must match');

// Test populateSectorsWithCounts omits (0) when territoryData is null
const mockSectorSelect = {
    value: 'semua_bidang',
    options: [],
    innerHTML: '',
    appendChild(opt) { this.options.push(opt); }
};
const mockCatSelect = {
    options: [],
    innerHTML: '',
    selectedIndex: 0,
    appendChild(opt) { this.options.push(opt); }
};
context.document.getElementById = id => (id === 'target-sector-select' ? mockSectorSelect : (id === 'target-category-select' ? mockCatSelect : null));
context.document.createElement = () => ({});
client.territoryData = null;
client.populateSectorsWithCounts();
assert.ok(!mockSectorSelect.options[0].textContent.includes('(0)'), 'Sector dropdown must NOT display misleading (0) when unscanned');
assert.ok(!mockCatSelect.options[0].textContent.includes('(0)'), 'Category dropdown must NOT display misleading (0) when unscanned');

console.log('✓ All Unified Hybrid Scraper UI, Grid Nesting & Fallback tests passed successfully!');
