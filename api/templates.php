<?php
/**
 * cliento - WhatsApp Message Template & Product Manager API
 * Manage message templates per business category, add custom categories,
 * and manage offered products / services with optional offering copy.
 */
require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$jsonInput = !empty($rawInput) ? json_decode($rawInput, true) : [];
$input = !empty($jsonInput) ? $jsonInput : $_POST;
$action = $_GET['action'] ?? ($input['action'] ?? 'list');

function ensureTemplatesAndProductsSchema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'pgsql') {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS public.products (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT DEFAULT NULL,
                name VARCHAR(200) NOT NULL,
                offer_sentence TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        ");
    } else {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT NULL,
                name TEXT NOT NULL,
                offer_sentence TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");
    }

    // Ensure complete separated Indonesian business categories exist
    if (function_exists('getIndonesianBusinessCategories')) {
        $sqlCat = ($driver === 'pgsql')
            ? "INSERT INTO categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING"
            : "INSERT OR IGNORE INTO categories (name) VALUES (?)";
        $catStmt = $pdo->prepare($sqlCat);
        foreach (getIndonesianBusinessCategories() as $cname) {
            $catStmt->execute([$cname]);
        }

        // Remove uncustomized legacy bundled seed categories (only if user has NOT saved a custom template on them)
        $legacyBundled = [
            'Cafe & Coffee Shop', 'Restoran & Kuliner', 'Bengkel & Otomotif',
            'Jasa Laundry & Cuci', 'Salon & Barbershop', 'Klinik & Rumah Sakit',
            'Sekolah & Bimbel', 'Hotel & Penginapan'
        ];
        $chkTpl = $pdo->prepare("SELECT id FROM templates WHERE category_name = ? LIMIT 1");
        $delCat = $pdo->prepare("DELETE FROM categories WHERE name = ?");
        foreach ($legacyBundled as $legacy) {
            $chkTpl->execute([$legacy]);
            if (!$chkTpl->fetch()) {
                $delCat->execute([$legacy]);
            }
        }
    }
}

function resolveTemplateActorId(PDO $pdo): ?int {
    if (function_exists('getAuthUser')) {
        $u = getAuthUser($pdo);
        if ($u && !empty($u['id'])) return (int)$u['id'];
    }
    return null;
}

ensureTemplatesAndProductsSchema($pdo);

// 1. List all categories, their message templates, and registered products
if ($action === 'list') {
    try {
        $cats = $pdo->query("SELECT * FROM categories ORDER BY name ASC")->fetchAll();
        $templates = $pdo->query("SELECT * FROM templates")->fetchAll();

        $tplMap = [];
        foreach ($templates as $t) {
            $tplMap[$t['category_name']] = $t;
        }

        $result = [];
        foreach ($cats as $c) {
            $cName = $c['name'];
            $hasCustom = isset($tplMap[$cName]);
            $tpl = $tplMap[$cName] ?? [
                'category_name' => $cName,
                'greeting_type' => 'formal',
                'message_body' => 'Hallo kak dgn pemilik/team manajemen {nama_tempat}? Kami dari tim cliento tertarik dengan potensi usaha {kategori} kakak di {alamat}. Boleh kami sharing solusi singkat? Terima kasih!',
                'updated_at' => null
            ];
            $result[] = [
                'category_id' => $c['id'],
                'category_name' => $cName,
                'greeting_type' => $tpl['greeting_type'] ?? 'formal',
                'message_body' => $tpl['message_body'] ?? '',
                'has_custom_template' => $hasCustom,
                'updated_at' => $tpl['updated_at'] ?? null
            ];
        }

        $userId = resolveTemplateActorId($pdo);
        if ($userId !== null) {
            $prodStmt = $pdo->prepare("SELECT id, name, offer_sentence, created_at, updated_at FROM products WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC");
            $prodStmt->execute([$userId]);
            $products = $prodStmt->fetchAll();
        } else {
            $products = $pdo->query("SELECT id, name, offer_sentence, created_at, updated_at FROM products WHERE user_id IS NULL ORDER BY id DESC")->fetchAll();
        }

        jsonResponse([
            'success' => true,
            'categories' => $result,
            'products' => $products
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// 2. Save or update a template for a category
if ($action === 'save') {
    $categoryName = trim($input['category_name'] ?? '');
    $greetingType = trim($input['greeting_type'] ?? 'formal');
    $messageBody = trim($input['message_body'] ?? '');

    if (empty($categoryName) || empty($messageBody)) {
        jsonResponse(['success' => false, 'message' => 'Kategori dan isi pesan wajib diisi'], 400);
    }

    try {
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sqlCat = ($driver === 'pgsql')
            ? "INSERT INTO categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING"
            : "INSERT OR IGNORE INTO categories (name) VALUES (?)";
        $catStmt = $pdo->prepare($sqlCat);
        $catStmt->execute([$categoryName]);

        $stmt = $pdo->prepare("
            INSERT INTO templates (category_name, greeting_type, message_body, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(category_name) DO UPDATE SET
                greeting_type = excluded.greeting_type,
                message_body = excluded.message_body,
                updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$categoryName, $greetingType, $messageBody]);

        jsonResponse([
            'success' => true,
            'message' => 'Template untuk kategori "' . $categoryName . '" berhasil disimpan.'
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// 3. Create a new custom category
if ($action === 'create_category') {
    $categoryName = trim($input['name'] ?? '');

    if (empty($categoryName)) {
        jsonResponse(['success' => false, 'message' => 'Nama kategori tidak boleh kosong'], 400);
    }

    try {
        $chk = $pdo->prepare("SELECT id, name FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1");
        $chk->execute([$categoryName]);
        $existing = $chk->fetch();
        if ($existing) {
            jsonResponse([
                'success' => true,
                'already_exists' => true,
                'message' => 'Kategori "' . $existing['name'] . '" sudah tersedia.',
                'category' => ['id' => (int)$existing['id'], 'name' => $existing['name']]
            ]);
        }

        $stmt = $pdo->prepare("INSERT INTO categories (name) VALUES (?)");
        $stmt->execute([$categoryName]);
        $newId = (int)$pdo->lastInsertId();

        $defaultBody = 'Hallo kak dgn pemilik/team manajemen {nama_tempat}? Kami dari cliento melihat perkembangan usaha kakak di {alamat} sangat menarik. Boleh kami kirimkan detail penawaran singkat? Terima kasih!';
        $tplStmt = $pdo->prepare("INSERT INTO templates (category_name, greeting_type, message_body) VALUES (?, 'formal', ?) ON CONFLICT(category_name) DO NOTHING");
        $tplStmt->execute([$categoryName, $defaultBody]);

        jsonResponse([
            'success' => true,
            'message' => 'Kategori baru berhasil ditambahkan.',
            'category' => ['id' => $newId, 'name' => $categoryName]
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Gagal menambah kategori: ' . $e->getMessage()], 400);
    }
}

// 4. Delete a custom category
if ($action === 'delete_category') {
    $categoryName = trim($input['category_name'] ?? ($input['name'] ?? ''));
    if ($categoryName === '') {
        jsonResponse(['success' => false, 'message' => 'Nama kategori tidak boleh kosong'], 400);
    }
    try {
        $pdo->prepare("DELETE FROM templates WHERE category_name = ?")->execute([$categoryName]);
        $pdo->prepare("DELETE FROM categories WHERE name = ?")->execute([$categoryName]);
        jsonResponse(['success' => true, 'message' => 'Kategori "' . $categoryName . '" dihapus.']);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// 5. Save or update a registered product / service option
if ($action === 'save_product' || $action === 'create_product') {
    $prodId = isset($input['id']) && $input['id'] !== '' ? (int)$input['id'] : 0;
    $name = trim((string)($input['name'] ?? ''));
    $offerSentence = trim((string)($input['offer_sentence'] ?? ''));

    if ($name === '') {
        jsonResponse(['success' => false, 'message' => 'Nama produk / layanan wajib diisi'], 400);
    }
    if ($offerSentence === '') {
        $offerSentence = 'Kebetulan kami menyediakan ' . $name . ' yang dapat disesuaikan untuk membantu perkembangan usaha {nama_tempat}.';
    }

    try {
        $userId = resolveTemplateActorId($pdo);
        if ($prodId > 0) {
            if ($userId !== null) {
                $stmt = $pdo->prepare("UPDATE products SET name = ?, offer_sentence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (user_id = ? OR user_id IS NULL)");
                $stmt->execute([$name, $offerSentence, $prodId, $userId]);
            } else {
                $stmt = $pdo->prepare("UPDATE products SET name = ?, offer_sentence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id IS NULL");
                $stmt->execute([$name, $offerSentence, $prodId]);
            }
            $savedId = $prodId;
        } else {
            $stmt = $pdo->prepare("INSERT INTO products (user_id, name, offer_sentence) VALUES (?, ?, ?)");
            $stmt->execute([$userId, $name, $offerSentence]);
            $savedId = (int)$pdo->lastInsertId();
        }

        jsonResponse([
            'success' => true,
            'message' => 'Produk "' . $name . '" berhasil disimpan.',
            'product' => [
                'id' => $savedId,
                'name' => $name,
                'offer_sentence' => $offerSentence
            ]
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// 6. Delete a registered product / service option
if ($action === 'delete_product') {
    $prodId = isset($input['id']) ? (int)$input['id'] : 0;
    if ($prodId <= 0) {
        jsonResponse(['success' => false, 'message' => 'ID produk tidak valid'], 400);
    }
    try {
        $userId = resolveTemplateActorId($pdo);
        if ($userId !== null) {
            $stmt = $pdo->prepare("DELETE FROM products WHERE id = ? AND (user_id = ? OR user_id IS NULL)");
            $stmt->execute([$prodId, $userId]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM products WHERE id = ? AND user_id IS NULL");
            $stmt->execute([$prodId]);
        }
        jsonResponse(['success' => true, 'message' => 'Produk berhasil dihapus.']);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

jsonResponse(['success' => false, 'message' => 'Aksi template tidak dikenali'], 400);
