<?php
/** Import an explicitly supplied dataset or user-started Google Maps export. */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/open_sources.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Gunakan POST untuk mengimpor data.'], 405);
}
$user = getAuthUser($pdo);
if (!$user) jsonResponse(['success' => false, 'message' => 'Silakan login sebelum mengimpor data.'], 401);
$raw = file_get_contents('php://input', false, null, 0, 2097153);
if (strlen($raw) > 2097152) {
    jsonResponse(['success' => false, 'message' => 'Ukuran JSON maksimal 2 MB.'], 413);
}
try {
    $document = json_decode($raw, true);
    $items = normalizeOpenSourceImport($document);
    $context = normalizeSourceImportContext($document['context'] ?? []);
    $result = saveOpenSourceImport($pdo, $items, $user['id'], $context);
    jsonResponse(['success' => true, 'history_id' => $result['history_id'], 'items' => $result['items']]);
} catch (InvalidArgumentException $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 400);
} catch (Exception $e) {
    error_log('Source import failed: ' . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'Impor gagal disimpan. Silakan coba lagi.'], 500);
}
