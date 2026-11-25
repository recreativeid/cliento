<?php
/**
 * cliento - Multi-Provider Cloud Scraping Adapter (Waterfall Architecture)
 * 
 * Estafet Failover:
 * 1. Apify Google Places Actor ($5 free credit/month ~ 1.000-2.000 records)
 * 2. Outscraper Google Maps Data API (500 free records/month)
 * 3. SerpApi Google Maps Engine (100 free searches/month)
 * 4. Google Places API (New) (Optional fallback if configured)
 */

if (!defined('SKIP_DB_CONNECT')) {
    define('SKIP_DB_CONNECT', true);
}
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/google_places.php';

function cloudScraperGetStatus() {
    return [
        'apify' => [
            'configured' => defined('APIFY_TOKEN') && APIFY_TOKEN !== '',
            'name' => 'Apify Google Places',
            'free_quota' => '$5 saldo gratis/bulan (~1.500 tempat)'
        ],
        'outscraper' => [
            'configured' => defined('OUTSCRAPER_API_KEY') && OUTSCRAPER_API_KEY !== '',
            'name' => 'Outscraper Maps API',
            'free_quota' => '500 data tempat gratis/bulan'
        ],
        'serpapi' => [
            'configured' => defined('SERPAPI_API_KEY') && SERPAPI_API_KEY !== '',
            'name' => 'SerpApi Google Maps',
            'free_quota' => '100 pencarian gratis/bulan'
        ],
        'google_places' => [
            'configured' => function_exists('googlePlacesIsConfigured') && googlePlacesIsConfigured(),
            'name' => 'Google Places API (New)',
            'free_quota' => '5.000 request gratis/bulan (butuh kartu kredit)'
        ]
    ];
}

/**
 * Standardize phone / WhatsApp number for Indonesia
 */
function normalizeIndonesianPhone($phone) {
    if (!$phone || !is_string($phone)) return '';
    $clean = preg_replace('/[^\d+]/', '', trim($phone));
    if (strpos($clean, '+62') === 0) {
        $clean = '0' . substr($clean, 3);
    } elseif (strpos($clean, '62') === 0 && strlen($clean) > 8) {
        $clean = '0' . substr($clean, 2);
    }
    return (strlen($clean) >= 9 && strlen($clean) <= 15) ? $clean : trim($phone);
}

/**
 * 1. Apify Google Places Crawler
 */
function apifyScrapePlaces($query, $limit = 25) {
    if (!defined('APIFY_TOKEN') || APIFY_TOKEN === '') {
        return ['success' => false, 'error' => 'APIFY_TOKEN belum diisi di config.local.php'];
    }

    $url = 'https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=' . urlencode(APIFY_TOKEN);
    $payload = [
        'searchStringsArray' => [$query],
        'maxCrawledPlacesPerSearch' => max(1, min(100, (int)$limit)),
        'language' => 'id',
        'countryCode' => 'id',
        'includeHistogram' => false,
        'includeOpeningHours' => true,
        'includePeopleAlsoSearch' => false
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($code === 401) {
        return ['success' => false, 'error' => 'Apify Token tidak valid. Periksa APIFY_TOKEN di config.local.php'];
    }
    if ($code === 429 || $code === 402) {
        return ['success' => false, 'error' => 'Kuota gratis Apify habis (Rate limit / insufficient credit).'];
    }
    if ($body === false || $code < 200 || $code >= 300) {
        return ['success' => false, 'error' => 'Apify HTTP ' . $code . ($curlErr ? ' ' . $curlErr : '')];
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        return ['success' => false, 'error' => 'Format respons Apify tidak valid.'];
    }

    $places = [];
    foreach ($data as $item) {
        $name = trim($item['title'] ?? '');
        if (empty($name)) continue;

        $phone = normalizeIndonesianPhone($item['phoneUnformatted'] ?? ($item['phone'] ?? ''));
        $lat = isset($item['location']['lat']) ? (float)$item['location']['lat'] : null;
        $lng = isset($item['location']['lng']) ? (float)$item['location']['lng'] : null;

        $places[] = [
            'name' => $name,
            'category' => $item['categoryName'] ?? ($item['categories'][0] ?? 'Bisnis'),
            'address' => $item['address'] ?? ($item['street'] ?? ''),
            'phone' => $phone,
            'whatsapp' => (strpos($phone, '08') === 0 || strpos($phone, '628') === 0) ? $phone : '',
            'lat' => $lat,
            'lng' => $lng,
            'website' => $item['website'] ?? '',
            'social_media' => $item['website'] ?? '',
            'opening_hours' => is_array($item['openingHours'] ?? null) ? json_encode($item['openingHours']) : ($item['openingHours'] ?? ''),
            'rating' => isset($item['totalScore']) ? (float)$item['totalScore'] : 0,
            'reviews_count' => isset($item['reviewsCount']) ? (int)$item['reviewsCount'] : 0,
            'google_maps_url' => $item['url'] ?? '',
            'source' => 'apify',
            'source_type' => 'google_maps',
            'source_name' => 'Apify Google Places'
        ];
    }

    return ['success' => true, 'provider' => 'apify', 'places' => $places, 'total' => count($places)];
}

/**
 * 2. Outscraper Google Maps Data API
 */
function outscraperScrapePlaces($query, $limit = 25) {
    if (!defined('OUTSCRAPER_API_KEY') || OUTSCRAPER_API_KEY === '') {
        return ['success' => false, 'error' => 'OUTSCRAPER_API_KEY belum diisi di config.local.php'];
    }

    $url = 'https://api.outscraper.com/maps/search-v3?' . http_build_query([
        'query' => $query,
        'limit' => max(1, min(100, (int)$limit)),
        'language' => 'id',
        'region' => 'ID',
        'async' => 'false'
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'X-API-KEY: ' . OUTSCRAPER_API_KEY,
            'Accept: application/json'
        ],
        CURLOPT_TIMEOUT => 40,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($code === 401 || $code === 403) {
        return ['success' => false, 'error' => 'Outscraper API Key tidak valid.'];
    }
    if ($code === 429 || $code === 402) {
        return ['success' => false, 'error' => 'Kuota gratis Outscraper habis.'];
    }
    if ($body === false || $code < 200 || $code >= 300) {
        return ['success' => false, 'error' => 'Outscraper HTTP ' . $code . ($curlErr ? ' ' . $curlErr : '')];
    }

    $json = json_decode($body, true);
    $items = $json['data'][0] ?? ($json['data'] ?? []);
    if (!is_array($items)) {
        return ['success' => false, 'error' => 'Respons Outscraper kosong atau tidak sesuai.'];
    }

    $places = [];
    foreach ($items as $item) {
        $name = trim($item['name'] ?? '');
        if (empty($name)) continue;

        $phone = normalizeIndonesianPhone($item['phone'] ?? '');
        $lat = isset($item['latitude']) ? (float)$item['latitude'] : null;
        $lng = isset($item['longitude']) ? (float)$item['longitude'] : null;

        $places[] = [
            'name' => $name,
            'category' => $item['type'] ?? ($item['subtypes'][0] ?? 'Bisnis'),
            'address' => $item['full_address'] ?? ($item['address'] ?? ''),
            'phone' => $phone,
            'whatsapp' => (strpos($phone, '08') === 0 || strpos($phone, '628') === 0) ? $phone : '',
            'lat' => $lat,
            'lng' => $lng,
            'website' => $item['site'] ?? '',
            'social_media' => $item['site'] ?? '',
            'opening_hours' => is_array($item['working_hours'] ?? null) ? json_encode($item['working_hours']) : ($item['working_hours'] ?? ''),
            'rating' => isset($item['rating']) ? (float)$item['rating'] : 0,
            'reviews_count' => isset($item['reviews']) ? (int)$item['reviews'] : 0,
            'google_maps_url' => $item['location_link'] ?? '',
            'source' => 'outscraper',
            'source_type' => 'google_maps',
            'source_name' => 'Outscraper Maps API'
        ];
    }

    return ['success' => true, 'provider' => 'outscraper', 'places' => $places, 'total' => count($places)];
}

/**
 * 3. SerpApi Google Maps Engine
 */
function serpapiScrapePlaces($query, $limit = 25) {
    if (!defined('SERPAPI_API_KEY') || SERPAPI_API_KEY === '') {
        return ['success' => false, 'error' => 'SERPAPI_API_KEY belum diisi di config.local.php'];
    }

    $url = 'https://serpapi.com/search.json?' . http_build_query([
        'engine' => 'google_maps',
        'q' => $query,
        'hl' => 'id',
        'gl' => 'id',
        'api_key' => SERPAPI_API_KEY
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($code === 401) {
        return ['success' => false, 'error' => 'SerpApi API Key tidak valid.'];
    }
    if ($code === 429) {
        return ['success' => false, 'error' => 'Kuota gratis SerpApi habis.'];
    }
    if ($body === false || $code < 200 || $code >= 300) {
        return ['success' => false, 'error' => 'SerpApi HTTP ' . $code . ($curlErr ? ' ' . $curlErr : '')];
    }

    $json = json_decode($body, true);
    $results = $json['local_results'] ?? [];
    if (!is_array($results)) {
        return ['success' => false, 'error' => 'Tidak ada local_results dari SerpApi.'];
    }

    $places = [];
    foreach (array_slice($results, 0, (int)$limit) as $item) {
        $name = trim($item['title'] ?? '');
        if (empty($name)) continue;

        $phone = normalizeIndonesianPhone($item['phone'] ?? '');
        $gps = $item['gps_coordinates'] ?? [];
        $lat = isset($gps['latitude']) ? (float)$gps['latitude'] : null;
        $lng = isset($gps['longitude']) ? (float)$gps['longitude'] : null;

        $places[] = [
            'name' => $name,
            'category' => $item['type'] ?? 'Bisnis',
            'address' => $item['address'] ?? '',
            'phone' => $phone,
            'whatsapp' => (strpos($phone, '08') === 0 || strpos($phone, '628') === 0) ? $phone : '',
            'lat' => $lat,
            'lng' => $lng,
            'website' => $item['website'] ?? '',
            'social_media' => $item['website'] ?? '',
            'opening_hours' => $item['operating_hours'] ?? '',
            'rating' => isset($item['rating']) ? (float)$item['rating'] : 0,
            'reviews_count' => isset($item['reviews']) ? (int)$item['reviews'] : 0,
            'google_maps_url' => $item['link'] ?? '',
            'source' => 'serpapi',
            'source_type' => 'google_maps',
            'source_name' => 'SerpApi Google Maps'
        ];
    }

    return ['success' => true, 'provider' => 'serpapi', 'places' => $places, 'total' => count($places)];
}

/**
 * 4. Waterfall Router (Estafet Berurutan)
 * Menjalankan urutan: Apify -> Outscraper -> SerpApi -> Google Places
 */
function cloudScrapeWaterfall($query, $limit = 25, $preferredProvider = null, $meta = []) {
    $chain = ['apify', 'outscraper', 'serpapi', 'google_places'];
    if ($preferredProvider && in_array($preferredProvider, $chain, true)) {
        // Prioritaskan provider yang dipilih pengguna di depan
        $chain = array_unique(array_merge([$preferredProvider], $chain));
    }

    $errors = [];
    $attemptLog = [];
    $attempted = 0;

    foreach ($chain as $provider) {
        if ($provider === 'apify') {
            if (!defined('APIFY_TOKEN') || APIFY_TOKEN === '') {
                $attemptLog[] = ['provider' => 'apify', 'label' => 'Apify', 'status' => 'off', 'reason' => 'APIFY_TOKEN kosong di config.local.php'];
                continue;
            }
            $attempted++;
            $res = apifyScrapePlaces($query, $limit);
            if ($res['success'] && !empty($res['places'])) {
                $attemptLog[] = ['provider' => 'apify', 'label' => 'Apify', 'status' => 'active', 'count' => count($res['places'])];
                $res['attempt_log'] = $attemptLog;
                return $res;
            }
            $err = $res['error'] ?? 'Tidak ada data';
            $errors['Apify'] = $err;
            $attemptLog[] = ['provider' => 'apify', 'label' => 'Apify', 'status' => 'error', 'reason' => $err];
        } elseif ($provider === 'outscraper') {
            if (!defined('OUTSCRAPER_API_KEY') || OUTSCRAPER_API_KEY === '') {
                $attemptLog[] = ['provider' => 'outscraper', 'label' => 'Outscraper', 'status' => 'off', 'reason' => 'OUTSCRAPER_API_KEY kosong di config.local.php'];
                continue;
            }
            $attempted++;
            $res = outscraperScrapePlaces($query, $limit);
            if ($res['success'] && !empty($res['places'])) {
                $attemptLog[] = ['provider' => 'outscraper', 'label' => 'Outscraper', 'status' => 'active', 'count' => count($res['places'])];
                $res['attempt_log'] = $attemptLog;
                return $res;
            }
            $err = $res['error'] ?? 'Tidak ada data';
            $errors['Outscraper'] = $err;
            $attemptLog[] = ['provider' => 'outscraper', 'label' => 'Outscraper', 'status' => 'error', 'reason' => $err];
        } elseif ($provider === 'serpapi') {
            if (!defined('SERPAPI_API_KEY') || SERPAPI_API_KEY === '') {
                $attemptLog[] = ['provider' => 'serpapi', 'label' => 'SerpApi', 'status' => 'off', 'reason' => 'SERPAPI_API_KEY kosong di config.local.php'];
                continue;
            }
            $attempted++;
            $res = serpapiScrapePlaces($query, $limit);
            if ($res['success'] && !empty($res['places'])) {
                $attemptLog[] = ['provider' => 'serpapi', 'label' => 'SerpApi', 'status' => 'active', 'count' => count($res['places'])];
                $res['attempt_log'] = $attemptLog;
                return $res;
            }
            $err = $res['error'] ?? 'Tidak ada data';
            $errors['SerpApi'] = $err;
            $attemptLog[] = ['provider' => 'serpapi', 'label' => 'SerpApi', 'status' => 'error', 'reason' => $err];
        } elseif ($provider === 'google_places') {
            if (!function_exists('googlePlacesIsConfigured') || !googlePlacesIsConfigured()) {
                $attemptLog[] = ['provider' => 'google_places', 'label' => 'Google Places', 'status' => 'off', 'reason' => 'GOOGLE_MAPS_API_KEY kosong / nonaktif di config.local.php'];
                continue;
            }
            $attempted++;
            $cat = trim((string)($meta['category'] ?? '')) ?: $query;
            $loc = trim((string)($meta['location'] ?? '')) ?: 'Indonesia';
            $lat = isset($meta['lat']) && is_numeric($meta['lat']) ? (float)$meta['lat'] : -7.4589;
            $lng = isset($meta['lng']) && is_numeric($meta['lng']) ? (float)$meta['lng'] : 110.2251;
            $places = googlePlacesSearch($cat, $loc, $lat, $lng, 5, max(1, min(60, (int)$limit)));
            if (!empty($places)) {
                $attemptLog[] = ['provider' => 'google_places', 'label' => 'Google Places', 'status' => 'active', 'count' => count($places)];
                return [
                    'success' => true,
                    'provider' => 'google_places',
                    'places' => $places,
                    'total' => count($places),
                    'attempt_log' => $attemptLog
                ];
            }
            $err = 'Tidak ada tempat ditemukan atau kuota habis / ditolak Google';
            $errors['Google Places'] = $err;
            $attemptLog[] = ['provider' => 'google_places', 'label' => 'Google Places', 'status' => 'error', 'reason' => $err];
        }
    }

    if ($attempted === 0) {
        return [
            'success' => false,
            'message' => 'Belum ada API Key Cloud atau Google Places yang diisi di config.local.php.',
            'status' => cloudScraperGetStatus(),
            'attempt_log' => $attemptLog
        ];
    }

    return [
        'success' => false,
        'message' => 'Semua provider Cloud / Places yang terkonfigurasi gagal mendapatkan data.',
        'details' => $errors,
        'attempt_log' => $attemptLog
    ];
}
