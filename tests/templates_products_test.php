<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

function assertTrue(bool $cond, string $msg): void {
    if (!$cond) {
        fwrite(STDERR, "FAIL: $msg\n");
        exit(1);
    }
}

$cats = getIndonesianBusinessCategories();
assertTrue(count($cats) >= 150, 'Should define >= 150 separated Indonesian business categories');
assertTrue(in_array('Bengkel Mobil', $cats, true), 'Bengkel Mobil must exist separately');
assertTrue(in_array('Bengkel Motor', $cats, true), 'Bengkel Motor must exist separately');
assertTrue(in_array('Laundry', $cats, true), 'Laundry must exist separately');
assertTrue(in_array('Barbershop', $cats, true), 'Barbershop must exist separately');
assertTrue(in_array('Salon Kecantikan', $cats, true), 'Salon Kecantikan must exist separately');
assertTrue(in_array('Kafe', $cats, true), 'Kafe must exist separately');
assertTrue(in_array('Restoran', $cats, true), 'Restoran must exist separately');

// Ensure unrelated businesses are never combined (e.g. Bengkel & Laundry, Salon & Barbershop)
foreach ($cats as $c) {
    assertTrue(stripos($c, 'Bengkel & Laundry') === false, "Category '$c' must not merge Bengkel and Laundry");
    assertTrue(stripos($c, 'Salon & Barbershop') === false, "Category '$c' must not merge Salon and Barbershop");
    assertTrue(stripos($c, 'Cafe & Resto') === false, "Category '$c' must not merge Cafe and Resto");
}

// Test SQLite schema & CRUD queries using an isolated in-memory PDO
$mem = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);
$mem->exec("
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT UNIQUE NOT NULL, greeting_type TEXT DEFAULT 'formal', message_body TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT NULL, name TEXT NOT NULL, offer_sentence TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
");

$insCat = $mem->prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
foreach ($cats as $cn) {
    $insCat->execute([$cn]);
}
$countCats = (int)$mem->query("SELECT COUNT(*) FROM categories")->fetchColumn();
assertTrue($countCats >= 150, "Categories table should hold >= 150 separated items (got $countCats)");

// Insert manual product with prepared offering sentence
$insProd = $mem->prepare("INSERT INTO products (user_id, name, offer_sentence) VALUES (?, ?, ?)");
$insProd->execute([null, 'Paket Website UMKM', 'Kami siap bantu buatkan website siap pakai untuk {nama_tempat}.']);
$prodId = (int)$mem->lastInsertId();
assertTrue($prodId > 0, 'Product insert must return ID');

$fetched = $mem->query("SELECT * FROM products WHERE id = $prodId")->fetch();
assertTrue($fetched['name'] === 'Paket Website UMKM', 'Stored product name mismatch');
assertTrue(strpos($fetched['offer_sentence'], '{nama_tempat}') !== false, 'Offer sentence should preserve variable placeholder');

// Upsert template with {produk} variable
$tplStmt = $mem->prepare("INSERT INTO templates (category_name, greeting_type, message_body) VALUES (?, ?, ?) ON CONFLICT(category_name) DO UPDATE SET message_body = excluded.message_body");
$tplStmt->execute(['Laundry', 'formal', 'Halo {nama_tempat} di {alamat}, kami tawarkan {produk}.']);
$tplRow = $mem->query("SELECT * FROM templates WHERE category_name = 'Laundry'")->fetch();
assertTrue($tplRow && strpos($tplRow['message_body'], '{produk}') !== false, 'Template must store {produk} tag');

echo "All Indonesian Business Categories & Products Schema tests PASSED!\n";
