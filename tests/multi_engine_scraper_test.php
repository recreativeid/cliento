<?php
/**
 * Test Multi-Engine Scraper & Dorking Hunter (Isolated CLI Test)
 */

// Load real dorking helper logic cleanly by guarding config include or testing functions directly
$dorkingCode = file_get_contents(__DIR__ . '/../api/dorking_hunter.php');
$dorkingCode = preg_replace('/require_once\s+__DIR__\s*\.\s*[\'"]\/\.\.\/config\.php[\'"]\s*;/', '', $dorkingCode);
eval('?>' . $dorkingCode);

$cloudCode = file_get_contents(__DIR__ . '/../api/cloud_scraper.php');
$cloudCode = preg_replace('/require_once\s+__DIR__\s*\.\s*[\'"]\/\.\.\/config\.php[\'"]\s*;/', '', $cloudCode);
$cloudCode = preg_replace('/require_once\s+__DIR__\s*\.\s*[\'"]\/google_places\.php[\'"]\s*;/', '', $cloudCode);
eval('?>' . $cloudCode);

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

// 2. WhatsApp Dorking Extraction Tests (wa.me, api.whatsapp.com, 08xx, ignoring 021 landline)
$sampleText = 'Halo kak, order via wa.me/6281299887766 atau https://api.whatsapp.com/send?phone=6287811223344 atau WhatsApp 0857-1122-3344. Info kantor: 021-1234567';
$phones = dorkingExtractPhones($sampleText);
assertEq(in_array('081299887766', $phones), true, 'Extracted wa.me phone');
assertEq(in_array('087811223344', $phones), true, 'Extracted api.whatsapp.com phone');
assertEq(in_array('085711223344', $phones), true, 'Extracted 0857 phone');
assertEq(in_array('0211234567', $phones), false, 'Landline 021 should not be classified as mobile WA');

// 3. DOMDocument DuckDuckGo HTML Parser Test (including nested divs and uddg redirect unwrapping)
$sampleDdgHtml = <<<HTML
<html><body>
  <div class="results">
    <div class="result results_links results_links_deep web-result">
      <div class="result__body links_main links_deep">
        <h2 class="result__title"><a class="result__a" href="/l/?kh=-1&uddg=https%3A%2F%2Fwww.instagram.com%2Fkopimagelang%2F">Kopi Magelang (@kopimagelang) • Instagram</a></h2>
        <div class="result__extras"><a class="result__url" href="/l/?kh=-1&uddg=https%3A%2F%2Fwww.instagram.com%2Fkopimagelang%2F">instagram.com/kopimagelang</a></div>
        <a class="result__snippet" href="/l/?kh=-1&uddg=https%3A%2F%2Fwww.instagram.com%2Fkopimagelang%2F">Reservasi & order kopi wa.me/6285612345678 buka tiap hari</a>
      </div>
    </div>
  </div>
</body></html>
HTML;

$parsed = dorkingParseDuckDuckGoHtml($sampleDdgHtml);
assertEq(count($parsed), 1, 'Parse nested DDG result block via DOMDocument');
assertEq($parsed[0]['url'], 'https://www.instagram.com/kopimagelang/', 'Unwrap DuckDuckGo uddg redirect URL');
assertEq(dorkingCleanTitle($parsed[0]['title'], dorkingDetectPlatform($parsed[0]['url'])), 'Kopi Magelang', 'Clean parsed IG title');
$extractedFromHtml = dorkingExtractPhones($parsed[0]['snippet']);
assertEq($extractedFromHtml, ['085612345678'], 'Extract authentic WA phone from parsed DDG HTML snippet');

// 4. Platform Detection Tests
assertEq(dorkingDetectPlatform('https://www.instagram.com/kuliner.magelang/'), 'instagram', 'Detect Instagram');
assertEq(dorkingDetectPlatform('https://facebook.com/kulinermagelang'), 'facebook', 'Detect Facebook');
assertEq(dorkingDetectPlatform('https://tiktok.com/@kulinermgl'), 'tiktok', 'Detect TikTok');
assertEq(dorkingDetectPlatform('https://linktr.ee/kulinermgl'), 'linktree', 'Detect Linktree');
assertEq(dorkingDetectPlatform('https://kulinermagelang.com'), 'website', 'Detect Website');

// 5. Waterfall attempt_log behavior when all cloud keys are unset
function googlePlacesIsConfigured() { return false; }
$wfRes = cloudScrapeWaterfall('cafe di Magelang', 10);
assertEq($wfRes['success'], false, 'Waterfall fails cleanly when zero keys are set');
assertEq(count($wfRes['attempt_log']), 4, 'Attempt log reports status of all 4 cloud/places providers');

echo "All Multi-Engine Scraper, DDG DOMParser & Waterfall AttemptLog unit tests PASSED successfully!\n";
