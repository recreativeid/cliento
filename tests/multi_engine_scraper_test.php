<?php
/**
 * Test Multi-Engine Scraper & Dorking Hunter (Isolated CLI Test)
 */

// Define helper functions from cloud_scraper.php and dorking_hunter.php for unit verification
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

function dorkingExtractPhones($text) {
    $phones = [];
    if (empty($text)) return $phones;

    // 1. Direct wa.me links
    if (preg_match_all('~wa\.me/(?:62|0)?(\d{8,15})~i', $text, $waMatches)) {
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

function assertEq($actual, $expected, $message) {
    if ($actual !== $expected) {
        echo "FAIL: $message | Expected: " . json_encode($expected) . " Got: " . json_encode($actual) . "\n";
        exit(1);
    }
}

// 1. Phone Normalization Tests
assertEq(normalizeIndonesianPhone('+628123456789'), '08123456789', 'Normalize +62 phone');
assertEq(normalizeIndonesianPhone('6285712345678'), '085712345678', 'Normalize 62 phone');
assertEq(normalizeIndonesianPhone('081912345678'), '081912345678', 'Keep 08 phone');

// 2. WhatsApp Dorking Extraction Tests
$sampleText = 'Halo kak, untuk pemesanan cafe kami hubungi wa.me/6281299887766 atau WhatsApp 0857-1122-3344. Info kantor: 021-1234567';
$phones = dorkingExtractPhones($sampleText);
assertEq(in_array('081299887766', $phones), true, 'Extracted wa.me phone');
assertEq(in_array('085711223344', $phones), true, 'Extracted 0857 phone');
assertEq(in_array('0211234567', $phones), false, 'Landline 021 should not be classified as mobile WA');

// 3. Platform Detection Tests
assertEq(dorkingDetectPlatform('https://www.instagram.com/kuliner.magelang/'), 'instagram', 'Detect Instagram');
assertEq(dorkingDetectPlatform('https://facebook.com/kulinermagelang'), 'facebook', 'Detect Facebook');
assertEq(dorkingDetectPlatform('https://tiktok.com/@kulinermgl'), 'tiktok', 'Detect TikTok');
assertEq(dorkingDetectPlatform('https://linktr.ee/kulinermgl'), 'linktree', 'Detect Linktree');
assertEq(dorkingDetectPlatform('https://kulinermagelang.com'), 'website', 'Detect Website');

// 4. Title Cleaning Tests
$cleanIg = dorkingCleanTitle('Es Coklat Impian Magelang (@escoklat) • Instagram photos and videos', 'instagram');
assertEq($cleanIg, 'Es Coklat Impian Magelang', 'Clean Instagram title');

$cleanFb = dorkingCleanTitle('Cafe & Resto Magelang | Facebook', 'facebook');
assertEq($cleanFb, 'Cafe & Resto Magelang', 'Clean Facebook title');

echo "All Multi-Engine Scraper & Dorking Hunter unit tests PASSED successfully!\n";
