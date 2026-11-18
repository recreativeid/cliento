const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function run() {
  let exported;
  const files = [];
  const provenance = {
    source_name: 'Google Maps (Chrome)',
    source_url: 'https://www.google.com/maps/place/Contoh/data=!1sabc',
    usage_basis: 'Pengambilan data dimulai pengguna'
  };
  const items = [
    {name: 'Tanpa metrik', rating: 0, reviews_count: 0, insights: {provenance, metrics: {rating_available: false, reviews_count_available: false}}},
    {name: 'Rating tersedia', rating: 4.8, reviews_count: 0, insights: {provenance, metrics: {rating_available: true, reviews_count_available: false}}},
    {name: 'Nol teramati', rating: 0, reviews_count: 0, provenance, insights: {metrics: {rating_available: false, reviews_count_available: true}}}
  ];
  const context = {
    window: {location: {hostname: 'localhost', protocol: 'http:'}},
    console,
    alert(message) { throw new Error(message); },
    fetch: async () => ({ok: true, json: async () => ({success: true, items})}),
    XLSX: {
      utils: {json_to_sheet(rows) { exported = rows; return {}; }, book_new() { return {}; }, book_append_sheet() {}},
      writeFile(book, filename) { files.push(filename); }
    }
  };
  vm.runInNewContext(fs.readFileSync('assets/js/archives.js', 'utf8'), context);
  const manager = context.window.ArchiveManager;
  manager.currentItems = items;
  manager.currentArchiveName = 'Rekap Maps';
  manager.exportCollectionToExcel();
  const verify = () => {
    assert.equal(exported[0].Rating, '');
    assert.equal(exported[0]['Jumlah Ulasan'], '');
    assert.equal(exported[1].Rating, 4.8);
    assert.equal(exported[1]['Jumlah Ulasan'], '');
    assert.equal(exported[2].Rating, '');
    assert.equal(exported[2]['Jumlah Ulasan'], 0);
    for (const row of exported) {
      assert.equal(row['Sumber Data'], provenance.source_name);
      assert.equal(row['URL Sumber'], provenance.source_url);
      assert.equal(row['Lisensi / Dasar Penggunaan'], provenance.usage_basis);
    }
  };
  verify();
  assert.equal(files[0], 'Rekap Maps.xlsx');
  await manager.downloadArchiveExcel(12, 'Unduhan Maps');
  verify();
  assert.equal(files[1], 'Unduhan Maps.xlsx');
  const legacy = manager.excelRowForItem({rating: 4.3, reviews_count: 42}, 0);
  assert.equal(legacy.Rating, 4.3);
  assert.equal(legacy['Jumlah Ulasan'], 42);
  assert.equal(manager.excelRowForItem({rating: 0, reviews_count: 0}, 0).Rating, '');
  console.log('Archive Google Maps Excel exports preserve attribution and observed metric availability.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
