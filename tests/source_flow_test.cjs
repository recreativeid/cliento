const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function run() {
  const code = fs.readFileSync('assets/js/scraper.js', 'utf8');
  const exportLine = 'window.ScraperClient = ScraperClient;';
  const context = {window: {}, document: {}, console, URL};
  vm.runInNewContext(code.slice(0, code.indexOf(exportLine) + exportLine.length), context);
  const client = context.window.ScraperClient;
  assert.equal(typeof client.bindSourceImport, 'function');
  assert.equal(typeof client.renderScrapedResultsTable, 'function');
  assert.equal(typeof client.launchGoogleMapsAutoScrape, 'function');
  assert.equal(client.escapeText('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  const item = {name: 'Contoh', address: 'Jakarta', category: 'Toko', phone: '', rating: 0, reviews_count: 0};
  assert(!client.detectOpportunities(item).some(o => o.id === 'low_rating' || o.id === 'low_reviews'), 'Missing metrics must not trigger rating/review opportunities.');
  const insights = client.generateTriChannelInsights('Contoh', 'Toko', 0, 0, '081234567890', -6.2, 106.8);
  assert.equal(insights.triple_verified, false);
  assert.match(insights.channel_beta.summary, /tidak membuktikan/);

  const renderedRows = [];
  const tbody = {innerHTML: '', appendChild(row) { renderedRows.push(row); }};
  context.document.getElementById = id => id === 'scraped-table-body' ? tbody : null;
  context.document.createElement = () => ({classList: {add() {}}, querySelector() { return {addEventListener() {}}; }});
  client.scrapedResults = [{...item, id: 1, name: '<img src=x onerror=alert(1)>', provenance: {source_name: '<script>bad</script>'}}];
  client.renderScrapedResultsTable();
  assert.equal(renderedRows.length, 1);
  assert(!renderedRows[0].innerHTML.includes('<img src=x'), 'Imported text must be escaped in results.');
  assert(!renderedRows[0].innerHTML.includes('<script>bad'), 'Imported source metadata must be escaped.');
  assert.match(renderedRows[0].innerHTML, /tidak tersedia/i);
  client.activeFilter = 'low_rating';
  client.renderScrapedResultsTable();
  assert.match(tbody.innerHTML, /Tidak ada data hasil/);
  client.activeFilter = 'all';

  let opened;
  context.window.open = url => { opened = url; };
  client.showToast = () => {};
  context.document.getElementById = () => null;
  client.launchGoogleMapsAutoScrape();
  assert.match(opened, /^https:\/\/www.google.com\/maps\/search\//);
  assert(!opened.includes('clientreach_auto') && !opened.includes('target='));
  let requests = 0;
  context.fetch = async () => { requests++; throw new Error('Non-Google search requested'); };
  await client.scanTerritory();
  await client.loadPreScrapeCandidates();
  assert.equal((await client.fetchRealMapPlaces({})).length, 0);
  await client.executeDeepScrape();
  assert.equal(requests, 0, 'Google Maps workflow must not query OSM or server scraping.');
  context.document.getElementById = id => ({
    'target-category-select': {selectedOptions: [{textContent: 'Kantor PT (0) [12]'}]},
    'filter-kabupaten': {selectedOptions: [{textContent: 'Kota Magelang [Database Siap: 1,003]'}]},
    'filter-provinsi': {selectedOptions: [{textContent: 'Jawa Tengah'}]}
  })[id];
  client.currentQuery.targetMode = 'preset';
  assert.equal(client.googleMapsSearchQuery(true), 'Kantor PT di Kota Magelang, Jawa Tengah');
  client.currentQuery.location = 'Magelang Utara, Kota Magelang [Database Siap: 1,003], Jawa Tengah';
  assert.equal(client.googleMapsSearchQuery(false), 'Kantor PT di Magelang Utara, Kota Magelang, Jawa Tengah');
  client.currentQuery.category = 'semua_perusahaan';
  context.document.getElementById = id => id === 'target-category-select' ? {selectedOptions: [{textContent: 'Semua Kantor Perusahaan & PT/CV (0)'}]} : null;
  assert.match(client.googleMapsSearchQuery(), /^Kantor Perusahaan & PT\/CV di /);

  const input = {dataset: {}, addEventListener(type, handler) { this[type] = handler; }};
  const button = {disabled: true, addEventListener(type, handler) { this[type] = handler; }};
  const status = {};
  const setup = {style: {}}, results = {style: {}};
  context.document.getElementById = id => ({'public-source-file': input, 'btn-import-public-source': button, 'public-source-status': status, 'scraper-setup-view': setup, 'scraped-results-view': results}[id]);
  let posted;
  const provenance = {source_name: 'Google Maps (Chrome)', source_type: 'google_maps_extension', source_url: 'https://www.google.com/maps/place/Contoh/data=!4m2!3m1!1sABC', usage_basis: 'Pengambilan dimulai pengguna'};
  context.fetch = async (url, options) => {
    posted = {url, payload: JSON.parse(options.body)};
    return {ok: true, json: async () => ({success: true, items: [{...item, provenance}]})};
  };
  let rendered = 0;
  client.renderScrapedResultsTable = () => { rendered++; };
  client.bindSourceImport();
  input.files = [{size: 30, text: async () => '{bad json'}];
  await input.change();
  assert.equal(button.disabled, true);
  assert.equal(posted, undefined);
  input.files = [{size: 100, text: async () => JSON.stringify({context: {target_category: 'Toko', location_name: 'Jakarta'}, source: provenance, records: [item]})}];
  await input.change();
  assert.equal(button.disabled, false);
  assert.equal(posted, undefined, 'Selecting a file must not save it automatically.');
  await button.click();
  assert.equal(posted.url, 'api/source_import.php');
  assert.equal(posted.payload.records[0].name, item.name);
  assert.equal(rendered, 1);
  assert.equal(setup.style.display, 'none');
  assert.equal(results.style.display, 'block');
  assert.equal(client.sourceForItem(client.scrapedResults[0]).usage_basis, provenance.usage_basis);
  assert.equal(client.currentQuery.location, 'Jakarta');

  // Persisted records are exported together with their attribution.
  let exported;
  context.XLSX = {utils: {json_to_sheet(rows) { exported = rows; return {}; }, book_new() { return {}; }, book_append_sheet() {}}, writeFile() {}};
  client.exportScrapedToExcel();
  assert.equal(exported[0]['URL Sumber'], provenance.source_url);
  assert.equal(exported[0]['Lisensi / Dasar Penggunaan'], provenance.usage_basis);
  assert.equal(exported[0]['Rating Bintang'], '');
  client.scrapedResults = [{...item, rating: 4.7, reviews_count: 0, insights: {metrics: {rating_available: true, reviews_count_available: false}}}];
  assert(!client.detectOpportunities(client.scrapedResults[0]).some(o => o.id === 'low_reviews'));
  client.exportScrapedToExcel();
  assert.equal(exported[0]['Rating Bintang'], 4.7);
  assert.equal(exported[0]['Jumlah Ulasan'], '');
  client.scrapedResults[0].insights.metrics.reviews_count_available = true;
  client.exportScrapedToExcel();
  assert.equal(exported[0]['Jumlah Ulasan'], 0);

  context.fetch = async () => ({json: async () => ({success: true, items: [{...item, rating: 4.6, reviews_count: 0, insights: {provenance, metrics: {rating_available: true, reviews_count_available: false}}}]})});
  await client.exportHistoryToExcel(7, 'Maps Jakarta');
  assert.equal(exported[0]['Rating'], 4.6);
  assert.equal(exported[0]['Jumlah Ulasan'], '');
  assert.equal(exported[0]['URL Sumber'], provenance.source_url);

  console.log('Google Maps search, import, attribution export and missing metrics checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
