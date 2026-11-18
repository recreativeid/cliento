const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = require('../extension/content.js');

assert.equal(helpers.rating('4,8 bintang'), 4.8);
assert.equal(helpers.rating('4.9 stars'), 4.9);
assert.equal(helpers.rating('5.1 stars'), null);
assert.equal(helpers.rating('Tidak ada rating'), null);
assert.equal(helpers.reviews('(1.234)'), 1234);
assert.equal(helpers.reviews('1,234 reviews'), 1234);
assert.equal(helpers.reviews('1 234 ulasan'), 1234);
assert.equal(helpers.reviews('0 ulasan'), 0);
assert.equal(helpers.reviews('1.2K'), null);
assert.equal(helpers.reviews('4.8'), null);
assert.equal(helpers.mapsUrl('https://www.google.com.evil.test/maps/place/Fake'), '');
assert.equal(helpers.mapsUrl('javascript:alert(1)'), '');
assert.equal(helpers.mapsUrl('https://user:secret@www.google.com/maps/place/A'), '');
assert.equal(helpers.mapsUrl('https://www.google.com/maps/search/clinic'), '');
assert.equal(helpers.webUrl('javascript:alert(1)'), '');
assert.equal(helpers.identity('https://www.google.com/maps/place/A/data=!1sabc!3d0!4d0'), 'abc');
assert.equal(helpers.identity('https://www.google.co.id/maps/place/A/data=!1sabc!3d1!4d1'), 'abc');
assert.equal(
  helpers.identity('https://www.google.com/maps/place/A/data=!1s0x2e7a8f%3A0x123!3d-7.47!4d110.22'),
  helpers.identity('https://www.google.com/maps/place/A/data=!1s0x2e7a8f:0x123!3d-7.47!4d110.22')
);
assert.deepEqual(helpers.coords('https://www.google.com/maps/place/A/data=!1sabc!3d-7.4705!4d110.2177'), {lat: -7.4705, lng: 110.2177});
assert.deepEqual(helpers.coords('https://www.google.com/maps/place/A/data=!1sabc!3d999!4d110.2177'), {lat: null, lng: null});
assert.deepEqual(helpers.parseQueryContext('Klinik di Kota Magelang, Jawa Tengah'), {
  query_name: 'Klinik di Kota Magelang, Jawa Tengah',
  target_category: 'Klinik',
  location_name: 'Kota Magelang, Jawa Tengah'
});
assert.deepEqual(helpers.merge({phone: '123456', rating: 4.7}, {phone: '', rating: null, name: 'A'}), {phone: '123456', rating: 4.7, name: 'A'});

function fixture() {
  const controls = {};
  const make = () => ({
    disabled: false, checked: true, value: '30', children: [],
    addEventListener(type, handler) { this[type] = handler; },
    replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); }
  });
  for (const id of ['start', 'stop', 'single', 'limit', 'details', 'scroll', 'download', 'clear', 'message', 'summary', 'preview']) controls[id] = make();
  const panel = {style: {}, setAttribute() {}, querySelector(selector) { return controls[selector.slice(4)]; }};
  let reads = 0;
  let isBlocked = false;
  let profile = null;
  let feed = null;
  let downloaded = null;
  const document = {
    getElementById() { return null; }, body: {appendChild() {}},
    createElement(tag) {
      if (tag === 'section') return panel;
      if (tag === 'a') return {click() { downloaded = this; }};
      return make();
    },
    querySelector(selector) {
      reads++;
      if (selector === '#searchboxinput') return {value: 'Klinik Magelang'};
      return isBlocked ? {} : null;
    },
    querySelectorAll(selector) {
      reads++;
      if (selector === '[role="feed"]') return feed ? [feed] : [];
      if (selector.startsWith('h1.')) return profile ? [profile.heading] : [];
      return [];
    }
  };
  const url = 'https://www.google.com/maps/place/Klinik/data=!1sclinic1!3d-7.4!4d110.2';
  const window = {location: {href: url, pathname: '/maps/place/Klinik'}};
  let blob = null;
  class TestURL extends URL {}
  TestURL.createObjectURL = value => { blob = value; return 'blob:test'; };
  TestURL.revokeObjectURL = () => {};
  let now = 0;
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  let stopOnTimer = false;
  const context = {document, window, URL: TestURL, Blob, Date: TestDate, console,
    setTimeout(callback, ms) { now += ms; if (stopOnTimer) controls.stop.click({isTrusted: true}); callback(); }};
  vm.runInNewContext(fs.readFileSync('extension/content.js', 'utf8'), context);
  const node = (innerText, attrs = {}) => ({innerText, href: attrs.href, getClientRects: () => [{}], getAttribute: key => attrs[key] ?? null});
  return {
    controls, document, window, node, get reads() { return reads; }, get downloaded() { return downloaded; },
    get blob() { return blob; }, set blocked(value) { isBlocked = value; },
    set stopOnTimer(value) { stopOnTimer = value; },
    set profile(value) { profile = value; }, set feed(value) { feed = value; },
    makeProfile(name, phone = '+628123456789', rating = '4,8') {
      const values = {
        'button[data-item-id^="phone:tel:"], a[href^="tel:"]': node('', {'data-item-id': `phone:tel:${phone}`}),
        'button[data-item-id="address"]': node('Alamat: Jalan Klinik 1'),
        'a[data-item-id="authority"]': node('', {href: 'https://clinic.example/'}),
        'button.DkEaL': node('Klinik'),
        '.F7nice span[aria-hidden="true"]': node(rating),
        '.F7nice [aria-label]': node('', {'aria-label': '1.234 ulasan'})
      };
      const root = {querySelectorAll(selector) { return values[selector] ? [values[selector]] : []; }};
      const heading = node(name);
      heading.closest = () => root;
      profile = {heading};
    }
  };
}

async function run() {
  const f = fixture();
  assert.equal(f.reads, 0, 'Initializing the panel must not read business data.');
  await f.controls.start.click({isTrusted: false});
  f.controls.single.click({isTrusted: false});
  assert.equal(f.reads, 0, 'Synthetic clicks must not start collection.');

  f.makeProfile('<img src=x onerror=alert(1)>');
  f.controls.single.click({isTrusted: true});
  assert.match(f.controls.summary.textContent, /^1 bisnis/);
  assert.equal(f.controls.preview.children[0].textContent, '<img src=x onerror=alert(1)>');
  f.makeProfile('Klinik', '', '4,9');
  f.controls.single.click({isTrusted: true});
  assert.match(f.controls.summary.textContent, /^1 bisnis/, 'Repeated place identity must be deduplicated.');
  f.controls.download.click({isTrusted: true});
  assert.equal(f.downloaded.download, 'cliento-google-maps-1970-01-01.json');
  const payload = JSON.parse(await f.blob.text());
  assert.equal(payload.records[0].source_type, 'google_maps_extension');
  assert.equal(payload.records[0].rating, 4.9);
  assert.equal(payload.records[0].reviews_count, 1234);
  assert.equal(payload.records[0].phone, '+628123456789', 'A missing reread must not erase a collected contact.');
  assert.equal(payload.records[0].whatsapp, undefined, 'Phone must never be promoted to WhatsApp.');

  f.controls.clear.click({isTrusted: true});
  f.blocked = true;
  f.controls.single.click({isTrusted: true});
  await f.controls.start.click({isTrusted: true});
  assert.match(f.controls.summary.textContent, /^0 bisnis/);
  assert.match(f.controls.message.textContent, /dibatasi/);

  const b = fixture();
  const anchors = [1, 2].map(id => {
    const row = {querySelectorAll: () => [], querySelector: () => null};
    const anchor = b.node('', {'aria-label': `Klinik ${id}`, href: `https://www.google.com/maps/place/Klinik${id}/data=!1splace${id}!3d-7.4${id}!4d110.2${id}`});
    anchor.closest = () => row;
    anchor.click = () => {};
    return anchor;
  });
  b.feed = {getClientRects: () => [{}], querySelectorAll: () => anchors};
  b.controls.limit.value = '1';
  b.controls.details.checked = false;
  b.controls.scroll.checked = false;
  await b.controls.start.click({isTrusted: true});
  assert.match(b.controls.summary.textContent, /^1 bisnis/, 'Per-run limit must bound collection.');
  b.controls.download.click({isTrusted: true});
  const batch = JSON.parse(await b.blob.text());
  assert.equal(batch.context.query_name, 'Klinik Magelang');
  assert.equal(batch.records[0].lat, -7.41, 'Card coordinates should be extracted from Maps URL.');
  assert.equal(batch.records[0].lng, 110.21);
  assert.equal(batch.records[0].rating, undefined, 'Missing Google metrics must remain absent.');
  assert.equal(batch.records[0].reviews_count, undefined);

  b.controls.clear.click({isTrusted: true});
  b.controls.details.checked = true;
  b.stopOnTimer = true;
  await b.controls.start.click({isTrusted: true});
  assert.match(b.controls.summary.textContent, /^0 bisnis/, 'Stop during a detail read must not save unfinished data.');
  assert.equal(b.controls.start.disabled, false);
  assert.match(b.controls.message.textContent, /dihentikan/);

  console.log('Google Maps extension trust gate, metrics, dedupe, JSON export, limits and cancellation passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
