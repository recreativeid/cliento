<?php
/**
 * cliento - Social Media & Direct WhatsApp Hunter (DuckDuckGo Dorking Engine)
 * 
 * Melakukan dorking langsung ke media sosial & web untuk mencari nomor WhatsApp aktif:
 * - Instagram Bio & Posts
 * - Facebook Pages & Groups
 * - TikTok Profiles
 * - Web Directories & Linktree
 * 
 * Sumber disimpan terpisah dari Google Maps dengan label platform yang jelas.
 */

require_once __DIR__ . '/../config.php';

function dorkingExtractPhones($text) {
    $phones = [];
    if (empty($text)) return $phones;

    // 1. Direct wa.me & api.whatsapp.com links
    if (preg_match_all('~(?:wa\.me/|api\.whatsapp\.com/send\?[^\s"\']*?phone=)(?:62|0)?(\d{8,15})~i', $text, $waMatches)) {
        foreach ($waMatches[1] as $p) {
            $normalized = (strpos($p, '08') === 0) ? $p : '0' . ltrim($p, '62');
            $phones[] = $normalized;
        }
    }

    // 2. Explicit keywords: WA / WhatsApp / Tlp / HP / Hub
    if (preg_match_all('~(?:wa|whatsapp|hub|order|kontak|telp|hp|call)[\s:.\-\/]*([0\+62][\d\s\-]{8,15}\d)~i', $text, $kwMatches)) {
        foreach ($kwMatches[1] as $raw) {
            $clean = preg_replace('/[^\d]/', '', $raw);
            if (strpos($clean, '62') === 0) $clean = '0' . substr($clean, 2);
            if (strlen($clean) >= 10 && strlen($clean) <= 14 && strpos($clean, '08') === 0) {
                $phones[] = $clean;
            }
        }
    }

    // 3. Raw Indonesian Mobile Numbers (08xx-xxxx-xxxx)
    if (preg_match_all('~\b(08[1-9][0-9\s\-]{6,12}[0-9])\b~', $text, $rawMatches)) {
        foreach ($rawMatches[1] as $raw) {
            $clean = preg_replace('/[^\d]/', '', $raw);
            if (strlen($clean) >= 10 && strlen($clean) <= 14) {
                $phones[] = $clean;
            }
        }
    }

    return array_values(array_unique($phones));
}

function dorkingDetectPlatform($url) {
    $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
    if (strpos($host, 'instagram.com') !== false) return 'instagram';
    if (strpos($host, 'facebook.com') !== false) return 'facebook';
    if (strpos($host, 'tiktok.com') !== false) return 'tiktok';
    if (strpos($host, 'linktr.ee') !== false) return 'linktree';
    if (strpos($host, 'shopee.co.id') !== false) return 'shopee';
    if (strpos($host, 'tokopedia.com') !== false) return 'tokopedia';
    return 'website';
}

function dorkingCleanTitle($title, $platform) {
    $t = html_entity_decode(strip_tags($title), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = preg_replace('/\s+/', ' ', trim($t));
    if ($platform === 'instagram') {
        $t = preg_replace('/\s*\(?@.*$/i', '', $t);
        $t = preg_replace('/\s*•.*$/i', '', $t);
        $t = preg_replace('/\s*\|\s*Instagram.*$/i', '', $t);
    } elseif ($platform === 'facebook') {
        $t = preg_replace('/\s*\|\s*Facebook.*$/i', '', $t);
        $t = preg_replace('/\s*-\s*Home.*$/i', '', $t);
    } elseif ($platform === 'tiktok') {
        $t = preg_replace('/\s*\|\s*TikTok.*$/i', '', $t);
    }
    return trim($t) ?: 'Bisnis Online';
}

function dorkingCleanDuckDuckGoUrl($link) {
    $link = html_entity_decode(trim((string)$link), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (strpos($link, '//') === 0) {
        $link = 'https:' . $link;
    }
    if (strpos($link, 'uddg=') !== false) {
        $queryPart = parse_url($link, PHP_URL_QUERY) ?? '';
        parse_str($queryPart, $qp);
        if (!empty($qp['uddg'])) {
            $link = urldecode($qp['uddg']);
        }
    }
    return $link;
}

/**
 * Parse DuckDuckGo HTML safely using DOMDocument + DOMXPath (handles nested divs cleanly)
 */
function dorkingParseDuckDuckGoHtml($html) {
    if (empty($html) || !is_string($html)) return [];
    $results = [];

    if (class_exists('DOMDocument')) {
        $dom = new DOMDocument();
        $prevUseErrors = libxml_use_internal_errors(true);
        $loaded = @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
        libxml_clear_errors();
        libxml_use_internal_errors($prevUseErrors);

        if ($loaded) {
            $xpath = new DOMXPath($dom);
            $nodes = $xpath->query("//div[contains(concat(' ', normalize-space(@class), ' '), ' result ')]");
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $titleNode = $xpath->query(".//a[contains(@class, 'result__a')]", $node)->item(0)
                        ?: $xpath->query(".//h2//a", $node)->item(0);
                    $snipNode = $xpath->query(".//*[contains(@class, 'result__snippet')]", $node)->item(0);
                    $urlNode = $xpath->query(".//a[contains(@class, 'result__url')]", $node)->item(0);

                    $title = $titleNode ? trim($titleNode->textContent) : 'Profil Bisnis';
                    $href = $titleNode ? $titleNode->getAttribute('href') : ($urlNode ? $urlNode->getAttribute('href') : '');
                    if (empty($href) && $snipNode && $snipNode->nodeName === 'a') {
                        $href = $snipNode->getAttribute('href');
                    }
                    $link = dorkingCleanDuckDuckGoUrl($href);
                    $snippet = $snipNode ? trim($snipNode->textContent) : trim($node->textContent);

                    if (!empty($link) && (!empty($snippet) || !empty($title))) {
                        $results[] = [
                            'title' => preg_replace('/\s+/', ' ', $title) ?: 'Profil Bisnis',
                            'url' => $link,
                            'snippet' => preg_replace('/\s+/', ' ', $snippet)
                        ];
                    }
                }
            }
        }
    }

    return $results;
}

/**
 * Run DuckDuckGo query via HTML endpoint with browser emulation headers and clear status
 */
function dorkingQueryDuckDuckGo($dorkQuery) {
    $ch = curl_init('https://html.duckduckgo.com/html/');
    $postData = http_build_query([
        'q' => $dorkQuery,
        'b' => '',
        'kl' => 'id-id'
    ]);

    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type: application/x-www-form-urlencoded',
        'Origin: https://html.duckduckgo.com',
        'Referer: https://html.duckduckgo.com/'
    ];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postData,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $html = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($html === false || $code < 200 || $code >= 300 || empty($html)) {
        return [
            'ok' => false,
            'http_code' => $code,
            'blocked' => ($code === 403 || $code === 429 || $code === 202),
            'error' => $curlErr ?: ('DuckDuckGo HTTP ' . $code),
            'results' => []
        ];
    }

    // Detect anti-bot / anomaly challenge page served with HTTP 200
    $isChallenge = (stripos($html, 'anomaly-modal') !== false || stripos($html, 'Unfortunately, bots use DuckDuckGo') !== false);
    $results = $isChallenge ? [] : dorkingParseDuckDuckGoHtml($html);

    return [
        'ok' => !$isChallenge,
        'http_code' => $code,
        'blocked' => $isChallenge,
        'error' => $isChallenge ? 'DuckDuckGo meminta verifikasi anti-bot (anomaly challenge)' : '',
        'results' => $results
    ];
}

/**
 * Main Hunt Function: Runs targeted social dorks for category & location
 */
function dorkingHuntWhatsAppLeads($category, $location, $targetPlatform = 'all', $maxResults = 30) {
    $category = trim((string)$category) ?: 'bisnis';
    $location = trim((string)$location) ?: 'Indonesia';
    if (preg_match('/^(all|semua|semua_bidang|all_categories)$/i', $category)) {
        $category = 'usaha';
    }

    $dorks = [];
    if ($targetPlatform === 'instagram' || $targetPlatform === 'all') {
        $dorks[] = ['platform' => 'instagram', 'query' => 'site:instagram.com "' . $category . '" "' . $location . '" ("wa.me" OR "08" OR "WhatsApp")'];
    }
    if ($targetPlatform === 'facebook' || $targetPlatform === 'all') {
        $dorks[] = ['platform' => 'facebook', 'query' => 'site:facebook.com "' . $category . '" "' . $location . '" ("wa.me" OR "08")'];
    }
    if ($targetPlatform === 'tiktok' || $targetPlatform === 'all') {
        $dorks[] = ['platform' => 'tiktok', 'query' => 'site:tiktok.com "' . $category . '" "' . $location . '" ("wa.me" OR "08")'];
    }
    if ($targetPlatform === 'website' || $targetPlatform === 'all') {
        $dorks[] = ['platform' => 'website', 'query' => '"' . $category . '" "' . $location . '" ("wa.me/62" OR "wa.me/08" OR "api.whatsapp.com")'];
    }

    $leads = [];
    $seenPhones = [];
    $rawHits = 0;
    $blockedCount = 0;
    $lastHttp = 0;
    $lastErr = '';

    foreach ($dorks as $idx => $dork) {
        if (count($leads) >= $maxResults) break;

        // Polite delay between queries (1.2s) to preserve IP reputation
        if ($idx > 0) usleep(1200000);

        $resp = dorkingQueryDuckDuckGo($dork['query']);
        $lastHttp = $resp['http_code'];
        if (!empty($resp['blocked'])) $blockedCount++;
        if (!empty($resp['error'])) $lastErr = $resp['error'];

        $rawResults = $resp['results'] ?? [];
        $rawHits += count($rawResults);

        foreach ($rawResults as $item) {
            $phones = dorkingExtractPhones($item['title'] . ' ' . $item['snippet'] . ' ' . $item['url']);
            if (empty($phones)) continue;

            $platform = dorkingDetectPlatform($item['url']);
            $cleanName = dorkingCleanTitle($item['title'], $platform);

            foreach ($phones as $phone) {
                if (isset($seenPhones[$phone])) continue;
                $seenPhones[$phone] = true;

                $leads[] = [
                    'name' => $cleanName,
                    'category' => ucwords($category),
                    'address' => $location . ' (Ditemukan via ' . ucfirst($platform) . ')',
                    'phone' => $phone,
                    'whatsapp' => $phone,
                    'lat' => null,
                    'lng' => null,
                    'website' => $item['url'],
                    'social_media' => $item['url'],
                    'opening_hours' => 'Online / Kontak Langsung',
                    'rating' => 0,
                    'reviews_count' => 0,
                    'source' => 'duckduckgo_dorking',
                    'source_type' => 'google_dorking',
                    'source_name' => 'Dorking ' . ucfirst($platform),
                    'platform' => $platform,
                    'snippet' => $item['snippet'],
                    'evidence_url' => $item['url']
                ];

                if (count($leads) >= $maxResults) break 2;
            }
        }
    }

    $engineActive = ($rawHits > 0) || ($blockedCount === 0 && empty($lastErr));

    return [
        'success' => $engineActive || !empty($leads),
        'category' => $category,
        'location' => $location,
        'platform' => $targetPlatform,
        'leads' => $leads,
        'total' => count($leads),
        'diagnostics' => [
            'engine' => 'DuckDuckGo HTML',
            'active' => $engineActive,
            'queries_run' => count($dorks),
            'raw_search_hits' => $rawHits,
            'blocked_or_captcha' => $blockedCount > 0,
            'last_http_code' => $lastHttp,
            'error' => $lastErr
        ]
    ];
}
