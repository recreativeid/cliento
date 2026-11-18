<?php
/**
 * Google Places API (New) adapter.
 *
 * This file deliberately contains only server-side API calls. The API key is
 * never exposed to the browser. If the key is missing or Google returns an
 * error, callers receive an empty array and can use the OSM fallback.
 */

function googlePlacesIsConfigured() {
    return defined('GOOGLE_PLACES_ENABLED')
        ? GOOGLE_PLACES_ENABLED && defined('GOOGLE_MAPS_API_KEY') && GOOGLE_MAPS_API_KEY !== ''
        : defined('GOOGLE_MAPS_API_KEY') && GOOGLE_MAPS_API_KEY !== '';
}

function googlePlacesFieldMask() {
    return implode(',', [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.primaryType',
        'places.primaryTypeDisplayName',
        'places.nationalPhoneNumber',
        'places.internationalPhoneNumber',
        'places.websiteUri',
        'places.regularOpeningHours',
        'places.rating',
        'places.userRatingCount',
        'places.googleMapsUri',
        'nextPageToken'
    ]);
}

function googlePlacesHttpJson($url, $payload = null) {
    if (!defined('GOOGLE_MAPS_API_KEY') || GOOGLE_MAPS_API_KEY === '') return null;

    $ch = curl_init($url);
    $headers = [
        'Content-Type: application/json',
        'X-Goog-Api-Key: ' . GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask: ' . googlePlacesFieldMask()
    ];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $payload === null ? 'GET' : 'POST',
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));

    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false || $code < 200 || $code >= 300) {
        error_log('Google Places API request failed: HTTP ' . $code . ($error ? ' ' . $error : ''));
        return null;
    }
    $json = json_decode($body, true);
    return is_array($json) ? $json : null;
}

function googlePlacesNormalizeBbox($bbox) {
    if (!is_array($bbox) || count($bbox) < 4) return null;
    $v = array_map('floatval', array_values($bbox));
    return [
        'minLat' => min($v[0], $v[2]),
        'maxLat' => max($v[0], $v[2]),
        'minLng' => min($v[1], $v[3]),
        'maxLng' => max($v[1], $v[3])
    ];
}

function googlePlacesInsideBbox($lat, $lng, $bbox) {
    $b = googlePlacesNormalizeBbox($bbox);
    if (!$b) return true;
    return $lat >= $b['minLat'] && $lat <= $b['maxLat'] && $lng >= $b['minLng'] && $lng <= $b['maxLng'];
}

function googlePlacesQueryText($category, $locationName) {
    $category = trim((string)$category);
    $locationName = trim((string)$locationName);
    if ($category === '' || preg_match('/^(all|semua|semua_bidang|all_categories)$/i', $category)) {
        return 'businesses in ' . ($locationName ?: 'Indonesia');
    }
    return $category . ' in ' . ($locationName ?: 'Indonesia');
}

function googlePlacesOpeningHours($hours) {
    if (!is_array($hours)) return '';
    $days = $hours['weekdayDescriptions'] ?? [];
    return is_array($days) ? implode('; ', array_filter(array_map('trim', $days))) : '';
}

function googlePlacesCategory($place) {
    $display = $place['primaryTypeDisplayName']['text'] ?? '';
    if ($display !== '') return $display;
    $type = trim((string)($place['primaryType'] ?? ''));
    return $type !== '' ? ucwords(str_replace('_', ' ', $type)) : 'Usaha Lokal';
}

function googlePlacesMapPlace($place, $locationName) {
    $loc = $place['location'] ?? [];
    $lat = (float)($loc['latitude'] ?? 0);
    $lng = (float)($loc['longitude'] ?? 0);
    $name = trim((string)($place['displayName']['text'] ?? ''));
    if ($name === '' || !$lat || !$lng) return null;

    $phone = trim((string)($place['internationalPhoneNumber'] ?? ($place['nationalPhoneNumber'] ?? '')));
    $website = trim((string)($place['websiteUri'] ?? ''));
    $rating = isset($place['rating']) ? (float)$place['rating'] : 0.0;
    $reviews = isset($place['userRatingCount']) ? (int)$place['userRatingCount'] : 0;
    $insights = function_exists('generateTriChannelInsights')
        ? generateTriChannelInsights($name, googlePlacesCategory($place), $rating, $reviews, $phone, $lat, $lng, 'google_places_api')
        : null;

    return [
        'id' => 0,
        'google_place_id' => $place['id'] ?? null,
        'name' => $name,
        'category' => googlePlacesCategory($place),
        'address' => trim((string)($place['formattedAddress'] ?? $locationName)),
        'phone' => $phone !== '' ? $phone : '-',
        'lat' => $lat,
        'lng' => $lng,
        'social_media' => $website !== '' ? $website : '-',
        'website' => $website,
        'opening_hours' => googlePlacesOpeningHours($place['regularOpeningHours'] ?? []),
        'rating' => $rating,
        'reviews_count' => $reviews,
        'status' => 'none',
        'source' => 'google_places_api',
        'source_ids' => ['google_places_api'],
        'contact_source' => $phone !== '' || $website !== '' ? 'google_places_api' : '',
        'source_name' => 'Google Places API',
        'source_type' => 'Google Places API (New)',
        'source_color' => '#2563eb',
        'source_icon' => 'fa-brands fa-google',
        'google_maps_url' => $place['googleMapsUri'] ?? '',
        'insights' => $insights
    ];
}

/**
 * Search Google Places. Results are capped by the API and filtered locally to
 * the selected bbox when one is supplied. The caller can supplement with OSM.
 */
function googlePlacesSearch($category, $locationName, $centerLat, $centerLng, $radiusKm = 5, $count = 20, $bbox = null) {
    if (!googlePlacesIsConfigured()) return [];

    $count = max(1, min((int)$count, 60));
    $pageSize = min(20, $count);
    $radiusMeters = max(100.0, min((float)$radiusKm * 1000.0, 50000.0));
    $payload = [
        'textQuery' => googlePlacesQueryText($category, $locationName),
        'languageCode' => 'id',
        'regionCode' => 'ID',
        'pageSize' => $pageSize,
        'locationBias' => [
            'circle' => [
                'center' => ['latitude' => (float)$centerLat, 'longitude' => (float)$centerLng],
                'radius' => $radiusMeters
            ]
        ]
    ];

    $places = [];
    $seen = [];
    $page = 0;
    $nextToken = null;
    $maxPages = defined('GOOGLE_PLACES_MAX_PAGES') ? max(1, (int)GOOGLE_PLACES_MAX_PAGES) : 3;

    do {
        if ($nextToken) {
            // Google requires a short delay before a page token becomes valid.
            usleep(250000);
            $payload['pageToken'] = $nextToken;
        }
        $data = googlePlacesHttpJson('https://places.googleapis.com/v1/places:searchText', $payload);
        if (!$data) break;

        foreach (($data['places'] ?? []) as $place) {
            $mapped = googlePlacesMapPlace($place, $locationName);
            if (!$mapped) continue;
            $key = $mapped['google_place_id'] ?: strtolower($mapped['name'] . '|' . $mapped['lat'] . '|' . $mapped['lng']);
            if (isset($seen[$key])) continue;
            if (!googlePlacesInsideBbox($mapped['lat'], $mapped['lng'], $bbox)) continue;
            $seen[$key] = true;
            $mapped['id'] = count($places) + 1;
            $places[] = $mapped;
            if (count($places) >= $count) break;
        }

        $nextToken = $data['nextPageToken'] ?? null;
        $page++;
    } while ($nextToken && $page < $maxPages && count($places) < $count);

    return $places;
}

