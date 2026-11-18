<?php
require_once __DIR__ . '/../api/open_sources.php';

function check($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
function rejects($document, $message) {
    try { normalizeOpenSourceImport($document); } catch (InvalidArgumentException $e) { return; }
    throw new RuntimeException($message);
}
$source = ['source_type' => 'community', 'source_name' => 'Komunitas Contoh', 'source_url' => 'https://example.org/dataset', 'license' => 'CC0'];
$record = ['name' => 'Contoh Usaha', 'address' => 'Jakarta'];
$input = ['source' => $source, 'records' => [$record, $record]];
$items = normalizeOpenSourceImport($input);
check(count($items) === 1, 'Duplicate records should collapse within one import.');
check($items[0]['lat'] === null && $items[0]['lng'] === null, 'Missing coordinates must remain missing.');
check($items[0]['phone'] === '' && $items[0]['website'] === '', 'Missing contacts must never be invented.');
check($items[0]['rating'] === 0 && $items[0]['reviews_count'] === 0, 'Directory imports cannot invent Google metrics.');
check($items[0]['insights']['contact']['whatsapp_listed'] === false, 'Missing WhatsApp must remain unverified.');

$phoneInput = ['source' => $source, 'records' => [array_merge($record, ['phone' => '+62 812 3456 7890', 'lat' => -6.2, 'lng' => 106.8, 'rating' => 4.9])]];
$phoneItem = normalizeOpenSourceImport($phoneInput)[0];
check($phoneItem['insights']['contact']['whatsapp_listed'] === false, 'A mobile number is not proof of WhatsApp.');
check($phoneItem['rating'] === 0, 'User-supplied directory rating must not become a Google rating.');
foreach (['government_directory', 'official_business', 'community', 'company_website', 'browser_manual'] as $type) {
    $typed = ['source' => array_merge($source, ['source_type' => $type]), 'records' => [$record]];
    check(normalizeOpenSourceImport($typed)[0]['source'] === $type, 'All documented source types should work.');
}
$perRecord = ['records' => [array_merge($record, $source, ['license' => '', 'usage_basis' => 'Izin penggunaan dari pemilik'])]];
check(normalizeOpenSourceImport($perRecord)[0]['provenance']['usage_basis'] !== '', 'Per-record permission metadata should work.');
rejects(null, 'Malformed JSON should be rejected.');
rejects(['records' => []], 'Empty imports should be rejected.');
rejects(['source' => $source, 'records' => ['unexpected_key' => $record]], 'Records must be a JSON list.');
rejects(['source' => $source, 'records' => array_fill(0, 501, $record)], 'Oversized imports should be rejected.');
rejects(['records' => [$record]], 'Missing provenance should be rejected.');
rejects(['source' => array_merge($source, ['license' => '']), 'records' => [$record]], 'A license or usage basis is required.');
rejects(['source' => array_merge($source, ['source_url' => 'javascript:alert(1)']), 'records' => [$record]], 'Unsafe source URLs should be rejected.');
rejects(['source' => $source, 'records' => [array_merge($record, ['lat' => -6])]], 'Partial coordinates should be rejected.');
rejects(['source' => $source, 'records' => [array_merge($record, ['lat' => 91, 'lng' => 106])]], 'Out-of-range coordinates should be rejected.');
rejects(['source' => $source, 'records' => [array_merge($record, ['website' => 'javascript:alert(1)'])]], 'Unsafe website URLs should be rejected.');

// Google Maps extension imports retain actual observed metrics and provenance.
$mapsSource = [
    'source_type' => 'google_maps_extension', 'source_name' => 'Google Maps (Chrome)',
    'source_url' => 'https://www.google.com/maps/place/Contoh+Usaha/data=!4m2!3m1!1s123',
    'usage_basis' => 'Pengambilan data publik Google Maps dimulai pengguna'
];
$mapsRecord = array_merge($record, ['phone' => '+62 812 3456 7890', 'rating' => 4.7, 'reviews_count' => 125]);
$mapsInput = ['source' => $mapsSource, 'records' => [$mapsRecord, array_merge($mapsRecord, ['name' => 'Nama lain untuk URL sama'])]];
$mapsItems = normalizeOpenSourceImport($mapsInput);
check(count($mapsItems) === 1, 'One Google Maps business URL should not create duplicate records.');
check($mapsItems[0]['rating'] === 4.7 && $mapsItems[0]['reviews_count'] === 125, 'Observed Google Maps metrics must be retained.');
check($mapsItems[0]['google_maps_url'] === $mapsSource['source_url'], 'The original Maps URL should remain available.');
check($mapsItems[0]['insights']['metrics']['rating_available'] === true, 'Observed metrics must record availability.');
check($mapsItems[0]['insights']['contact']['whatsapp_listed'] === false, 'Google Maps phones must not imply WhatsApp.');
check($mapsItems[0]['provenance']['method'] === 'user_started_chrome_extension', 'Extension provenance must identify the collection method.');
$noMetrics = normalizeOpenSourceImport(['source' => $mapsSource, 'records' => [$record]])[0];
check($noMetrics['rating'] === 0 && $noMetrics['reviews_count'] === 0, 'Missing metrics must remain schema-compatible unavailable values.');
check($noMetrics['insights']['metrics']['rating'] === null && $noMetrics['insights']['metrics']['reviews_count_available'] === false, 'Missing metrics must remain distinguishable in archived metadata.');
$zeroReviews = normalizeOpenSourceImport(['source' => $mapsSource, 'records' => [array_merge($record, ['reviews_count' => 0])]])[0];
check($zeroReviews['insights']['metrics']['reviews_count_available'] === true, 'An observed zero review count differs from an unavailable count.');
foreach ([
    'https://www.google.co.id/maps/place/Contoh+Usaha',
    'https://maps.google.com/?cid=1234567890',
    'https://www.google.com/maps/?api=1&query=Contoh&query_place_id=ChIJ123456'
] as $url) {
    check(normalizeGoogleMapsSourceUrl($url) === $url, 'Supported Google Maps place URLs should be accepted.');
}
foreach ([
    'http://www.google.com/maps/place/Contoh',
    'https://www.google.com.evil.example/maps/place/Contoh',
    'https://evil.example/maps/place/Contoh',
    'https://www.google.com@evil.example/maps/place/Contoh',
    'https://evil@www.google.com/maps/place/Contoh',
    'https://www.google.com:444/maps/place/Contoh',
    'https://www.google.com/search?q=Contoh',
    'https://www.google.com/maps/search/Contoh',
    'https://www.google.com/maps/place/'
] as $url) {
    rejects(['source' => array_merge($mapsSource, ['source_url' => $url]), 'records' => [$mapsRecord]], 'Spoofed or non-business Google Maps URLs should be rejected.');
}
foreach ([0, 5.1, -1, true, [], 'excellent', INF] as $rating) {
    rejects(['source' => $mapsSource, 'records' => [array_merge($record, ['rating' => $rating])]], 'Invalid Google ratings should be rejected.');
}
foreach ([-1, 1.5, true, [], '1,200', '10e3', '2147483648'] as $reviews) {
    rejects(['source' => $mapsSource, 'records' => [array_merge($record, ['reviews_count' => $reviews])]], 'Invalid Google review counts should be rejected.');
}
$boundedContext = normalizeSourceImportContext(['query_name' => str_repeat('A', 250), 'location_name' => ' Jakarta ', 'target_category' => str_repeat('B', 150)]);
check(strlen($boundedContext['query_name']) === 200 && $boundedContext['location_name'] === 'Jakarta' && strlen($boundedContext['target_category']) === 100, 'Import context should be bounded to DB column limits and trimmed.');
try { normalizeSourceImportContext(['query_name' => []]); throw new RuntimeException('Nested import context should be rejected.'); } catch (InvalidArgumentException $e) {}

// Verify real persistence and rollback without connecting to the user's DB.
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE scraping_history (id INTEGER PRIMARY KEY AUTOINCREMENT, query_name TEXT, method TEXT, location_name TEXT, target_category TEXT, total_found INTEGER, user_id INTEGER)');
$pdo->exec('CREATE TABLE scraped_items (id INTEGER PRIMARY KEY AUTOINCREMENT, history_id INTEGER, name TEXT NOT NULL, address TEXT, phone TEXT, lat REAL, lng REAL, category TEXT, social_media TEXT, opening_hours TEXT, rating REAL, reviews_count INTEGER, status TEXT, insights_json TEXT)');
$saved = saveOpenSourceImport($pdo, $items, 42);
check($saved['history_id'] > 0 && $saved['items'][0]['db_id'] > 0, 'Persistence should return saved identifiers.');
check((int)$pdo->query('SELECT user_id FROM scraping_history')->fetchColumn() === 42, 'Import must retain its owner.');
$restored = json_decode($pdo->query('SELECT insights_json FROM scraped_items')->fetchColumn(), true);
check($restored['provenance']['source_url'] === $source['source_url'], 'Source URL must survive persistence.');
check($restored['provenance']['license'] === 'CC0', 'License must survive persistence.');
$bad = $items;
$bad[0]['name'] = null;
try { saveOpenSourceImport($pdo, $bad, 42); } catch (PDOException $e) {}
check((int)$pdo->query('SELECT COUNT(*) FROM scraping_history')->fetchColumn() === 1, 'A failed save must roll back its history row.');
check((int)$pdo->query('SELECT COUNT(*) FROM scraped_items')->fetchColumn() === 1, 'A failed save must leave no partial records.');
$mapsSaved = saveOpenSourceImport($pdo, $mapsItems, 42, ['query_name' => 'Cafe di Jakarta', 'location_name' => 'Jakarta', 'target_category' => 'Cafe']);
$storedMaps = $pdo->query('SELECT * FROM scraped_items ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check((float)$storedMaps['rating'] === 4.7 && (int)$storedMaps['reviews_count'] === 125, 'Google Maps metrics must survive database persistence.');
$mapsMetadata = json_decode($storedMaps['insights_json'], true);
check($mapsMetadata['metrics']['rating'] === 4.7 && $mapsMetadata['provenance']['source_url'] === $mapsSource['source_url'], 'Source and actual metrics metadata must survive archival storage.');
$mapsHistory = $pdo->query('SELECT * FROM scraping_history ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check($mapsHistory['method'] === 'google_maps_extension' && $mapsHistory['query_name'] === 'Cafe di Jakarta', 'History should identify Maps imports and retain the search context.');
check($mapsHistory['location_name'] === 'Jakarta' && (int)$mapsHistory['total_found'] === 1, 'History recap should retain context and deduplicated counts.');
$badMaps = $mapsItems;
$badMaps[0]['name'] = null;
try { saveOpenSourceImport($pdo, $badMaps, 42); } catch (PDOException $e) {}
check((int)$pdo->query('SELECT COUNT(*) FROM scraping_history')->fetchColumn() === 2, 'A failed Google Maps batch must also roll back history.');

echo "Source import validation, Google Maps metrics, attribution, persistence and rollback passed.\n";
