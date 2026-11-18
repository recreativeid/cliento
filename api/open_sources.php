<?php
/**
 * Legal, attributable open-source directory registry.
 *
 * The application may use these sources only when a public record or an
 * explicitly supplied official URL is available. This registry intentionally
 * does not contain search-engine scraping or guessed contact data.
 */
function getOpenSourceCatalog() {
    return [
        [
            'id' => 'osm',
            'name' => 'OpenStreetMap',
            'kind' => 'data komunitas',
            'url' => 'https://www.openstreetmap.org/',
            'license' => 'ODbL 1.0',
            'usage' => 'Lokasi, nama, kategori, alamat, tag telepon, dan website yang tercantum.'
        ],
        [
            'id' => 'overpass',
            'name' => 'Overpass API',
            'kind' => 'query data komunitas',
            'url' => 'https://overpass-api.de/',
            'license' => 'Mengikuti lisensi OpenStreetMap/ODbL',
            'usage' => 'Query objek OSM berdasarkan area dan tag.'
        ],
        [
            'id' => 'nominatim',
            'name' => 'Nominatim',
            'kind' => 'geocoding komunitas',
            'url' => 'https://nominatim.openstreetmap.org/',
            'license' => 'Mengikuti lisensi OpenStreetMap/ODbL',
            'usage' => 'Geocoding dan reverse geocoding dengan batas penggunaan publik.'
        ],
        [
            'id' => 'photon',
            'name' => 'Photon',
            'kind' => 'geocoding komunitas',
            'url' => 'https://photon.komoot.io/',
            'license' => 'Mengikuti lisensi OpenStreetMap/ODbL',
            'usage' => 'Fallback pencarian spasial berbasis data OSM.'
        ],
        [
            'id' => 'data_go_id',
            'name' => 'data.go.id',
            'kind' => 'direktori pemerintah',
            'url' => 'https://data.go.id/',
            'license' => 'Periksa lisensi dataset masing-masing',
            'usage' => 'Referensi dataset pemerintah yang memiliki lisensi dan endpoint publik.'
        ],
        [
            'id' => 'kemendikdasmen',
            'name' => 'Direktori Satuan Pendidikan Pemerintah',
            'kind' => 'direktori pemerintah',
            'url' => 'https://dapo.kemdikbud.go.id/',
            'license' => 'Ketentuan portal pemerintah',
            'usage' => 'Verifikasi nama dan alamat satuan pendidikan melalui halaman resmi.'
        ],
        [
            'id' => 'official_business_site',
            'name' => 'Situs resmi bisnis',
            'kind' => 'website resmi',
            'url' => null,
            'license' => 'Ketentuan situs pemilik',
            'usage' => 'Hanya URL resmi yang tercantum pada record atau dimasukkan pengguna.'
        ],
        [
            'id' => 'company_site',
            'name' => 'Website perusahaan',
            'kind' => 'website perusahaan',
            'url' => null,
            'license' => 'Ketentuan situs pemilik',
            'usage' => 'Kontak hanya dipakai jika dipublikasikan oleh perusahaan sendiri.'
        ],
        [
            'id' => 'wikidata',
            'name' => 'Wikidata',
            'kind' => 'data komunitas',
            'url' => 'https://www.wikidata.org/',
            'license' => 'CC0',
            'usage' => 'Referensi identitas publik dan tautan resmi; cocok untuk verifikasi manual.'
        ]
    ];
}

function openSourceCatalogById($id) {
    foreach (getOpenSourceCatalog() as $source) {
        if (($source['id'] ?? '') === $id) return $source;
    }
    return null;
}

function normalizePublicSourceUrl($url) {
    $url = trim((string)$url);
    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) return '';
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    if (!in_array($scheme, ['http', 'https'], true)) return '';
    return $url;
}

/** Accept explicit Google Maps business URLs, never lookalike domains. */
function normalizeGoogleMapsSourceUrl($url) {
    $url = normalizePublicSourceUrl($url);
    if ($url === '') return '';
    $parts = parse_url($url);
    $host = strtolower($parts['host'] ?? '');
    if (strtolower($parts['scheme'] ?? '') !== 'https' ||
        !in_array($host, ['google.com', 'www.google.com', 'maps.google.com', 'google.co.id', 'www.google.co.id', 'maps.google.co.id'], true) ||
        isset($parts['user']) || isset($parts['pass']) ||
        (isset($parts['port']) && $parts['port'] !== 443)) return '';
    $path = $parts['path'] ?? '/';
    if (preg_match('~^/maps/place/[^/]+~', $path)) return $url;
    parse_str($parts['query'] ?? '', $query);
    $isMapsPath = in_array($path, ['/maps', '/maps/'], true) ||
        (in_array($host, ['maps.google.com', 'maps.google.co.id'], true) && $path === '/');
    if (!$isMapsPath) return '';
    if (isset($query['cid']) && is_string($query['cid']) && preg_match('/^\d+$/', $query['cid'])) return $url;
    if (isset($query['query_place_id']) && is_string($query['query_place_id']) &&
        preg_match('/^[A-Za-z0-9_-]+$/', $query['query_place_id'])) return $url;
    return '';
}

/** Preserve only observed Google metrics; null means the page supplied none. */
function normalizeGoogleMapsMetrics($record, $recordNumber) {
    $rating = $record['rating'] ?? null;
    $reviews = $record['reviews_count'] ?? null;
    if ($rating === '') $rating = null;
    if ($reviews === '') $reviews = null;
    if ($rating !== null && (is_bool($rating) || !is_scalar($rating) || !is_numeric($rating) ||
        !is_finite((float)$rating) || (float)$rating < 1 || (float)$rating > 5)) {
        throw new InvalidArgumentException('Record ' . $recordNumber . ': rating Google Maps harus antara 1 dan 5.');
    }
    if ($reviews !== null && ((!is_int($reviews) && !is_string($reviews)) ||
        !preg_match('/^\d+$/', (string)$reviews) || (float)$reviews > 2147483647)) {
        throw new InvalidArgumentException('Record ' . $recordNumber . ': reviews_count harus bilangan bulat nonnegatif.');
    }
    return [
        'rating' => $rating === null ? null : (float)$rating,
        'reviews_count' => $reviews === null ? null : (int)$reviews,
        'rating_available' => $rating !== null,
        'reviews_count_available' => $reviews !== null
    ];
}

function normalizeSourceImportContext($context) {
    if (!is_array($context)) throw new InvalidArgumentException('Context impor harus berupa objek.');
    $limits = ['query_name' => 200, 'location_name' => 200, 'target_category' => 100];
    $result = [];
    foreach ($limits as $field => $maxLen) {
        if (isset($context[$field]) && !is_scalar($context[$field])) {
            throw new InvalidArgumentException('Context ' . $field . ' harus berupa teks.');
        }
        $result[$field] = mb_substr(trim((string)($context[$field] ?? '')), 0, $maxLen);
    }
    return $result;
}

function sourceProvenanceForPlace($source, $website = '') {
    $source = strtolower(trim((string)$source));
    $provenance = [];
    if ($source !== '') $provenance[] = $source;
    $website = normalizePublicSourceUrl($website);
    // A URL listed on OSM is still OSM-sourced; its presence alone does not
    // establish that the destination was inspected or is an official site.
    return array_values(array_unique($provenance));
}

/** Normalize user-supplied, attributable records without fetching any URL. */
function normalizeOpenSourceImport($document) {
    if (!is_array($document) || !isset($document['records']) || !is_array($document['records']) ||
        count($document['records']) < 1 || count($document['records']) > 500 ||
        array_keys($document['records']) !== range(0, count($document['records']) - 1)) {
        throw new InvalidArgumentException('Gunakan JSON dengan records berisi 1–500 data.');
    }
    $defaults = isset($document['source']) && is_array($document['source']) ? $document['source'] : [];
    $types = ['government_directory', 'official_business', 'community', 'company_website', 'browser_manual', 'google_maps_extension'];
    $items = [];
    $seen = [];
    foreach ($document['records'] as $index => $record) {
        if (!is_array($record)) throw new InvalidArgumentException('Record harus berupa objek.');
        $record = array_merge($defaults, $record);
        $text = function($key, $max = 1000) use ($record) {
            if (isset($record[$key]) && !is_scalar($record[$key])) {
                throw new InvalidArgumentException('Kolom ' . $key . ' harus berupa teks.');
            }
            return mb_substr(trim((string)($record[$key] ?? '')), 0, $max);
        };
        $type = $text('source_type', 80);
        $url = normalizePublicSourceUrl($text('source_url', 2048));
        $name = $text('name', 200);
        $sourceName = $text('source_name', 200);
        $license = $text('license', 500);
        $basis = $text('usage_basis', 500);
        if ($name === '' || $sourceName === '' || $url === '' || !in_array($type, $types, true)) {
            throw new InvalidArgumentException('Record ' . ($index + 1) . ': nama, source_name, source_type, dan URL sumber HTTP(S) wajib valid.');
        }
        if ($license === '' && $basis === '') {
            throw new InvalidArgumentException('Record ' . ($index + 1) . ': sertakan license atau usage_basis yang mengizinkan penggunaan data.');
        }
        $isGoogleMaps = $type === 'google_maps_extension';
        if ($isGoogleMaps && normalizeGoogleMapsSourceUrl($url) === '') {
            throw new InvalidArgumentException('Record ' . ($index + 1) . ': URL sumber harus profil bisnis HTTPS Google Maps yang valid.');
        }
        $metrics = $isGoogleMaps ? normalizeGoogleMapsMetrics($record, $index + 1) : [
            'rating' => null, 'reviews_count' => null, 'rating_available' => false, 'reviews_count_available' => false
        ];
        $key = $isGoogleMaps ? $url : mb_strtolower($name . '|' . $text('address') . '|' . $url);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $lat = $text('lat', 40);
        $lng = $text('lng', 40);
        $hasCoordinates = $lat !== '' && $lng !== '';
        if (($lat !== '' || $lng !== '') && (!$hasCoordinates || !is_numeric($lat) || !is_numeric($lng) ||
            abs((float)$lat) > 90 || abs((float)$lng) > 180)) {
            throw new InvalidArgumentException('Record ' . ($index + 1) . ': koordinat harus berupa pasangan latitude/longitude yang valid.');
        }
        $phone = $text('phone', 50);
        $whatsapp = $text('whatsapp', 50);
        foreach ([$phone, $whatsapp] as $contact) {
            if ($contact !== '' && !preg_match('/^[+\d\s().;\/-]{6,50}$/', $contact)) {
                throw new InvalidArgumentException('Record ' . ($index + 1) . ': format kontak tidak valid.');
            }
        }
        $website = $text('website', 2048);
        if ($website !== '' && normalizePublicSourceUrl($website) === '') {
            throw new InvalidArgumentException('Record ' . ($index + 1) . ': website harus berupa URL HTTP(S).');
        }
        $provenance = [
            'source_type' => $type, 'source_name' => $sourceName, 'source_url' => $url,
            'license' => $license, 'usage_basis' => $basis, 'observed_at' => $text('observed_at', 80),
            'imported_at' => gmdate('c'), 'method' => $isGoogleMaps ? 'user_started_chrome_extension' :
                ($type === 'browser_manual' ? 'manual_verification' : 'user_supplied_dataset')
        ];
        $items[] = [
            'id' => count($items) + 1, 'name' => $name, 'category' => $text('category', 100) ?: 'Usaha Lokal',
            'address' => $text('address'), 'phone' => $phone ?: $whatsapp, 'whatsapp' => $whatsapp,
            'lat' => $hasCoordinates ? (float)$lat : null, 'lng' => $hasCoordinates ? (float)$lng : null,
            'website' => $website, 'social_media' => $website, 'opening_hours' => $text('opening_hours'),
            // Only an explicitly supplied Google Maps observation has Google metrics.
            'rating' => $metrics['rating'] ?? 0, 'reviews_count' => $metrics['reviews_count'] ?? 0,
            'status' => 'none', 'source' => $type,
            'source_name' => $sourceName, 'source_type' => $type, 'source_url' => $url,
            'google_maps_url' => $isGoogleMaps ? $url : '',
            'provenance' => $provenance,
            'insights' => [
                'provenance' => $provenance,
                'metrics' => $metrics,
                'contact' => ['phone_listed' => $phone !== '', 'whatsapp_listed' => $whatsapp !== '', 'whatsapp' => $whatsapp],
                'triple_verified' => false, 'verification_score' => 'Sumber dicantumkan pengguna; belum diverifikasi independen'
            ]
        ];
    }
    return $items;
}

function saveOpenSourceImport($pdo, $items, $userId, $context = []) {
    $context = normalizeSourceImportContext($context);
    $googleMapsOnly = count($items) > 0;
    foreach ($items as $item) {
        if (($item['source'] ?? '') !== 'google_maps_extension') $googleMapsOnly = false;
    }
    $pdo->beginTransaction();
    try {
        $history = $pdo->prepare('INSERT INTO scraping_history (query_name, method, location_name, target_category, total_found, user_id) VALUES (?, ?, ?, ?, ?, ?)');
        $history->execute([
            $context['query_name'] ?: ($googleMapsOnly ? 'Impor Google Maps' : 'Impor sumber publik'),
            $googleMapsOnly ? 'google_maps_extension' : 'public_source_import',
            $context['location_name'] ?: ($googleMapsOnly ? 'Google Maps' : 'Sesuai sumber'),
            $context['target_category'] ?: ($googleMapsOnly ? 'Bisnis Google Maps' : 'Sumber tambahan'),
            count($items), $userId
        ]);
        $historyId = (int)$pdo->lastInsertId();
        $insert = $pdo->prepare("INSERT INTO scraped_items (history_id, name, address, phone, lat, lng, category, social_media, opening_hours, rating, reviews_count, status, insights_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?)");
        foreach ($items as &$item) {
            $insert->execute([
                $historyId, $item['name'], $item['address'], $item['phone'], $item['lat'], $item['lng'],
                $item['category'], $item['social_media'], $item['opening_hours'], $item['rating'], $item['reviews_count'],
                json_encode($item['insights'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)
            ]);
            $item['db_id'] = (int)$pdo->lastInsertId();
        }
        unset($item);
        $pdo->commit();
        return ['history_id' => $historyId, 'items' => $items];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
