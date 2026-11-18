const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Testing Unified Scraper UI & Static Host Fallback ---');

const scraperJs = fs.readFileSync(path.join(__dirname, '../assets/js/scraper.js'), 'utf8');

// Test 1: Verify isStaticHost method exists
assert.ok(scraperJs.includes('isStaticHost()'), 'scraper.js must contain isStaticHost()');
assert.ok(scraperJs.includes('github.io'), 'isStaticHost must check for github.io');

// Test 2: Verify safeFetchJson method exists
assert.ok(scraperJs.includes('safeFetchJson('), 'scraper.js must contain safeFetchJson()');
assert.ok(scraperJs.includes('Server tidak mengembalikan JSON'), 'safeFetchJson must handle non-JSON responses with friendly error');

// Test 3: Verify updateTargetSummaryDisplay method exists and is invoked
assert.ok(scraperJs.includes('updateTargetSummaryDisplay()'), 'scraper.js must contain updateTargetSummaryDisplay()');
assert.ok(scraperJs.includes('summary-active-target'), 'updateTargetSummaryDisplay must target #summary-active-target');

// Test 4: Verify generateStaticHostLeads method exists
assert.ok(scraperJs.includes('generateStaticHostLeads('), 'scraper.js must contain generateStaticHostLeads()');

// Test 5: Verify main execute button binding in bindScrapingActions
assert.ok(scraperJs.includes('btn-main-execute-scrape'), 'scraper.js must bind #btn-main-execute-scrape');
assert.ok(scraperJs.includes('tile-engine-cloud'), 'scraper.js must handle #tile-engine-cloud');
assert.ok(scraperJs.includes('tile-engine-local'), 'scraper.js must handle #tile-engine-local');
assert.ok(scraperJs.includes('tile-engine-dorking'), 'scraper.js must handle #tile-engine-dorking');
assert.ok(scraperJs.includes('tile-engine-extension'), 'scraper.js must handle #tile-engine-extension');

// Test 6: Verify index.html contains the unified 3-step minimalist layout
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(indexHtml.includes('id="btn-main-execute-scrape"'), 'index.html must have #btn-main-execute-scrape');
assert.ok(indexHtml.includes('id="summary-active-target"'), 'index.html must have #summary-active-target');
assert.ok(indexHtml.includes('name="scrape_engine"'), 'index.html must have engine radio selector');
assert.ok(indexHtml.includes('Langkah 1 · Tentukan Wilayah Target'), 'index.html must have Step 1 header');
assert.ok(indexHtml.includes('Langkah 2 · Target Kategori Usaha'), 'index.html must have Step 2 header');
assert.ok(indexHtml.includes('Langkah 3 · Ekstraksi Leads'), 'index.html must have Step 3 header');

console.log('✓ All Unified Scraper UI & Static Host tests passed successfully!');
