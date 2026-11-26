<?php
/**
 * Client Reach AI - Workflow AI Sales
 * Configuration & Database Connection
 */

// Enable error reporting during development
error_reporting(E_ALL);
ini_set('display_errors', '0');

// PHP 8 Compatibility Polyfills for PHP 7.4
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        return (string)$needle !== '' && strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        return $needle === '' || $needle === substr($haystack, -strlen($needle));
    }
}
if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle) {
        return $needle !== '' && mb_strpos($haystack, $needle) !== false;
    }
}

// Set headers for JSON APIs
function jsonResponse($data, $status = 200) {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowedOrigins = [
            'http://127.0.0.1',
            'http://localhost',
            'https://127.0.0.1',
            'https://localhost'
        ];
        $isLocalOrigin = false;
        foreach ($allowedOrigins as $allowed) {
            if ($origin === $allowed || strpos($origin, $allowed . ':') === 0) {
                $isLocalOrigin = true;
                break;
            }
        }
        if ($isLocalOrigin && !empty($origin)) {
            header('Access-Control-Allow-Origin: ' . $origin);
        } else {
            header('Access-Control-Allow-Origin: ' . (!empty($origin) ? $origin : '*'));
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    }
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// Handle preflight OPTIONS request
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    exit(0);
}

// Load local overrides or environment variables securely
$localConfig = [];
if (file_exists(__DIR__ . '/config.local.php')) {
    $localConfig = require __DIR__ . '/config.local.php';
}

// Supabase Cloud PostgreSQL & API Configuration
$supabaseHost = $localConfig['SUPABASE_DB_HOST'] ?? (getenv('SUPABASE_DB_HOST') ?: '');
$supabasePass = $localConfig['SUPABASE_DB_PASSWORD'] ?? (getenv('SUPABASE_DB_PASSWORD') ?: '');
$supabaseUser = $localConfig['SUPABASE_DB_USER'] ?? (getenv('SUPABASE_DB_USER') ?: 'postgres');
$supabasePort = $localConfig['SUPABASE_DB_PORT'] ?? (getenv('SUPABASE_DB_PORT') ?: '5432');
$supabaseDb   = $localConfig['SUPABASE_DB_NAME'] ?? (getenv('SUPABASE_DB_NAME') ?: 'postgres');
$supabaseUrl  = $localConfig['SUPABASE_URL'] ?? (getenv('SUPABASE_URL') ?: '');
$supabaseKey  = $localConfig['SUPABASE_KEY'] ?? (getenv('SUPABASE_KEY') ?: '');

define('SUPABASE_URL', $supabaseUrl);
define('SUPABASE_KEY', $supabaseKey);

$dbConnected = false;
$dbMode = 'none';

// 1. Supabase Cloud PostgreSQL Connection with fast unreachable cache + automatic Local SQLite Fallback
if (!defined('SKIP_DB_CONNECT')) {
    $pgCacheFile = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'cliento_pg_unavailable.flag';
    $skipRemotePg = @file_exists($pgCacheFile) && (time() - (int)@file_get_contents($pgCacheFile)) < 60;

    if (!empty($supabaseHost) && extension_loaded('pdo_pgsql') && !$skipRemotePg) {
        try {
            $dsn = "pgsql:host={$supabaseHost};port={$supabasePort};dbname={$supabaseDb};sslmode=require";
            $pdo = new PDO($dsn, $supabaseUser, $supabasePass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 2
            ]);
            $dbConnected = true;
            $dbMode = 'pgsql';
            if (@file_exists($pgCacheFile)) @unlink($pgCacheFile);
        } catch (PDOException $e) {
            @file_put_contents($pgCacheFile, (string)time());
            error_log("Supabase Cloud connection error: " . $e->getMessage());
        }
    }

    if (!$dbConnected && extension_loaded('pdo_sqlite')) {
        try {
            $storageDir = __DIR__ . '/storage';
            if (!is_dir($storageDir)) @mkdir($storageDir, 0775, true);
            $sqlitePath = $storageDir . '/cliento_local.sqlite';
            $pdo = new PDO('sqlite:' . $sqlitePath, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
            $pdo->exec('PRAGMA foreign_keys = ON;');
            $dbConnected = true;
            $dbMode = 'sqlite';
        } catch (PDOException $e) {
            error_log("Local SQLite connection error: " . $e->getMessage());
        }
    }

    if (!$dbConnected) {
        jsonResponse([
            'success' => false,
            'message' => 'Gagal terhubung ke Supabase Cloud maupun database SQLite lokal. Pastikan pdo_sqlite atau koneksi PostgreSQL aktif.'
        ], 500);
    }
}

$geminiKey = $localConfig['GEMINI_API_KEY'] ?? (getenv('GEMINI_API_KEY') ?: '');
$gmapsKey  = $localConfig['GOOGLE_MAPS_API_KEY'] ?? (getenv('GOOGLE_MAPS_API_KEY') ?: '');
$placesEnabled = $localConfig['GOOGLE_PLACES_ENABLED'] ?? (getenv('GOOGLE_PLACES_ENABLED') ?: '');
$placesMaxPages = $localConfig['GOOGLE_PLACES_MAX_PAGES'] ?? (getenv('GOOGLE_PLACES_MAX_PAGES') ?: 3);
$apifyToken = $localConfig['APIFY_TOKEN'] ?? (getenv('APIFY_TOKEN') ?: '');
$outscraperKey = $localConfig['OUTSCRAPER_API_KEY'] ?? (getenv('OUTSCRAPER_API_KEY') ?: '');
$serpApiKey = $localConfig['SERPAPI_API_KEY'] ?? (getenv('SERPAPI_API_KEY') ?: '');

define('GEMINI_API_KEY', $geminiKey);
define('GOOGLE_MAPS_API_KEY', $gmapsKey);
define('GOOGLE_PLACES_ENABLED', filter_var($placesEnabled, FILTER_VALIDATE_BOOLEAN));
define('GOOGLE_PLACES_MAX_PAGES', max(1, min(3, (int)$placesMaxPages)));
define('APIFY_TOKEN', $apifyToken);
define('OUTSCRAPER_API_KEY', $outscraperKey);
define('SERPAPI_API_KEY', $serpApiKey);

define('SMTP_PROVIDER', (string)($localConfig['SMTP_PROVIDER'] ?? (getenv('SMTP_PROVIDER') ?: '')));
define('SMTP_HOST', (string)($localConfig['SMTP_HOST'] ?? (getenv('SMTP_HOST') ?: '')));
define('SMTP_PORT', (string)($localConfig['SMTP_PORT'] ?? (getenv('SMTP_PORT') ?: '')));
define('SMTP_USER', (string)($localConfig['SMTP_USER'] ?? (getenv('SMTP_USER') ?: '')));
define('SMTP_PASS', (string)($localConfig['SMTP_PASS'] ?? (getenv('SMTP_PASS') ?: '')));
define('SMTP_FROM', (string)($localConfig['SMTP_FROM'] ?? (getenv('SMTP_FROM') ?: '')));

define('APP_NAME', 'cliento');
define('APP_SUBTITLE', 'sales intelligence');

// Auto-check and create local SQLite schema + seed default accounts if running on SQLite
if ($dbConnected && isset($pdo)) {
try {
    $activeDriver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($activeDriver === 'sqlite') {
        $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL DEFAULT 'customer',
            username TEXT UNIQUE DEFAULT NULL,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT DEFAULT '',
            password_hash TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            is_verified INTEGER DEFAULT 0,
            avatar TEXT DEFAULT '',
            token TEXT DEFAULT '',
            last_login DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS email_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT NULL,
            email TEXT NOT NULL,
            otp_code TEXT NOT NULL,
            type TEXT DEFAULT 'register',
            expires_at DATETIME NOT NULL,
            is_used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS system_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS archives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            total_items INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scraping_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_name TEXT NOT NULL,
            method TEXT NOT NULL,
            location_name TEXT NOT NULL,
            target_category TEXT NOT NULL,
            total_found INTEGER DEFAULT 0,
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scraped_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            archive_id INTEGER DEFAULT NULL,
            history_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            phone TEXT DEFAULT '',
            lat REAL DEFAULT 0,
            lng REAL DEFAULT 0,
            category TEXT DEFAULT '',
            social_media TEXT DEFAULT '',
            opening_hours TEXT DEFAULT '',
            rating REAL DEFAULT 0,
            reviews_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'none',
            insights_json TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT UNIQUE NOT NULL,
            greeting_type TEXT DEFAULT 'formal',
            message_body TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        ");
    }

    // Seed default admin if empty
    $chkAdmin = $pdo->query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")->fetch();
    if (!$chkAdmin) {
        $adminStmt = $pdo->prepare("INSERT INTO users (role, username, name, email, phone, password_hash, status, is_verified) VALUES ('admin', 'admin', 'Super Administrator', 'admin@cliento.id', '081234567890', ?, 'active', 1)");
        $adminStmt->execute([password_hash('admin123', PASSWORD_DEFAULT)]);
    }

    // Seed default customer if empty
    $chkCust = $pdo->query("SELECT id FROM users WHERE role = 'customer' LIMIT 1")->fetch();
    if (!$chkCust) {
        $custStmt = $pdo->prepare("INSERT INTO users (role, username, name, email, phone, password_hash, status, is_verified) VALUES ('customer', 'customer', 'Budi Pratama (Owner Cafe Kopi Titik)', 'customer@demo.com', '085712345678', ?, 'active', 1)");
        $custStmt->execute([password_hash('customer123', PASSWORD_DEFAULT)]);

        $sitiStmt = $pdo->prepare("INSERT INTO users (role, username, name, email, phone, password_hash, status, is_verified) VALUES ('customer', 'siti', 'Siti Nurhaliza', 'siti@example.com', '081299887766', ?, 'active', 1)");
        $sitiStmt->execute([password_hash('secret123', PASSWORD_DEFAULT)]);
    }

    // Seed default templates if empty
    if ($activeDriver === 'sqlite') {
        $chkTpl = $pdo->query("SELECT id FROM templates LIMIT 1")->fetch();
        if (!$chkTpl) {
            $tplSeed = $pdo->prepare("INSERT OR IGNORE INTO templates (category_name, greeting_type, message_body) VALUES (?, ?, ?)");
            $tplSeed->execute(['Cafe', 'formal', 'Hallo kak dgn pemilik/team manajemen {nama_tempat}? Kami dari tim cliento melihat perkembangan cafe kakak di {alamat} sangat menarik. Ada waktu 5 menit untuk sharing optimasi prospek?']);
            $tplSeed->execute(['Resto', 'humas', 'Selamat siang bapak/ibu manajemen {nama_tempat} di {alamat}. Kami ingin berbagi solusi otomasi data pelanggan & outreach B2B. Boleh kami kirimkan detail singkatnya?']);
            $tplSeed->execute(['Bengkel', 'casual', 'Halo kak {nama_tempat}! Kami melihat profil bengkel kakak di {alamat} sangat bagus. Tertarik melihat demo perluasan pelanggan digital?']);
        }
        $chkCat = $pdo->query("SELECT id FROM categories LIMIT 1")->fetch();
        if (!$chkCat) {
            $catSeed = $pdo->prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
            foreach (['Cafe & Coffee Shop', 'Restoran & Kuliner', 'Bengkel & Otomotif', 'Jasa Laundry & Cuci', 'Salon & Barbershop', 'Klinik & Rumah Sakit'] as $cn) {
                $catSeed->execute([$cn]);
            }
        }
    }
} catch (Exception $e) {
    // Ignore if table already exists or locked
}
}

/**
 * Detect if running on localhost/development environment
 * Used to conditionally expose OTP preview (NEVER in production)
 */
function isLocalDev() {
    $serverName = $_SERVER['SERVER_NAME'] ?? '';
    $serverAddr = $_SERVER['SERVER_ADDR'] ?? '';
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
    
    $localHosts = ['localhost', '127.0.0.1', '::1'];
    return in_array($serverName, $localHosts) || in_array($serverAddr, $localHosts) || in_array($remoteAddr, $localHosts);
}

/**
 * Rate Limiter for Login, OTP verification, and Password Reset
 * Supports Supabase PostgreSQL & SQLite
 */
function initRateLimitTable($pdo) {
    static $initialized = false;
    if ($initialized) return;
    try {
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'pgsql') {
            $pdo->exec("CREATE TABLE IF NOT EXISTS public.rate_limits (
                id BIGSERIAL PRIMARY KEY,
                ip_address VARCHAR(100) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                attempt_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )");
            $pdo->exec("DELETE FROM public.rate_limits WHERE attempt_time < NOW() - INTERVAL '1 hour'");
        } else {
            $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                action_type TEXT NOT NULL,
                attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP
            )");
            $pdo->exec("DELETE FROM rate_limits WHERE attempt_time < datetime('now', '-1 hour')");
        }
        $initialized = true;
    } catch (Exception $e) {
        // Silently fail - don't block legitimate users if table creation fails
    }
}

function checkRateLimit($pdo, $actionType, $maxAttempts = 5, $windowSeconds = 300) {
    initRateLimitTable($pdo);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    try {
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'pgsql') {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM public.rate_limits WHERE ip_address = ? AND action_type = ? AND attempt_time > NOW() - (? || ' seconds')::INTERVAL");
        } else {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM rate_limits WHERE ip_address = ? AND action_type = ? AND attempt_time > datetime('now', '-' || ? || ' seconds')");
        }
        $stmt->execute([$ip, $actionType, $windowSeconds]);
        $count = (int)$stmt->fetchColumn();
        return $count < $maxAttempts; // true = allowed, false = rate limited
    } catch (Exception $e) {
        return true; // On error, allow the request (don't block legitimate users)
    }
}

function recordFailedAttempt($pdo, $actionType) {
    initRateLimitTable($pdo);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    try {
        $stmt = $pdo->prepare("INSERT INTO rate_limits (ip_address, action_type) VALUES (?, ?)");
        $stmt->execute([$ip, $actionType]);
    } catch (Exception $e) {
        // Silently fail
    }
}

function clearFailedAttempts($pdo, $actionType) {
    initRateLimitTable($pdo);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    try {
        $stmt = $pdo->prepare("DELETE FROM rate_limits WHERE ip_address = ? AND action_type = ?");
        $stmt->execute([$ip, $actionType]);
    } catch (Exception $e) {
        // Silently fail
    }
}

/**
 * Get Bearer token from HTTP Authorization header
 */
function getBearerToken() {
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    
    if (!empty($headers) && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
        return $matches[1];
    }
    return null;
}

/**
 * Get Authenticated User from Token
 */
function getAuthUser($pdo, $requiredRole = null) {
    $token = getBearerToken();
    if (!$token) {
        if ($requiredRole !== null) {
            jsonResponse(['success' => false, 'message' => 'Akses ditolak: Token autentikasi tidak ditemukan'], 401);
        }
        return null;
    }

    try {
        $stmt = $pdo->prepare("SELECT id, role, name, email, phone, status, is_verified, avatar FROM users WHERE token = ? AND status = 'active' LIMIT 1");
        $stmt->execute([$token]);
        $user = $stmt->fetch();

        if (!$user) {
            if ($requiredRole !== null) {
                jsonResponse(['success' => false, 'message' => 'Sesi login tidak valid atau telah berakhir'], 401);
            }
            return null;
        }

        if ($requiredRole !== null && $user['role'] !== $requiredRole && $user['role'] !== 'admin') {
            jsonResponse(['success' => false, 'message' => 'Akses ditolak: Hak akses tidak memadai'], 403);
        }

        return $user;
    } catch (Exception $e) {
        if ($requiredRole !== null) {
            jsonResponse(['success' => false, 'message' => 'Kesalahan autentikasi: ' . $e->getMessage()], 500);
        }
        return null;
    }
}

/**
 * Native PHP Socket SMTP Client (Works directly with Gmail SMTP ssl://smtp.gmail.com:465)
 */
function sendDirectSmtpSocket($host, $port, $username, $password, $from, $fromName, $to, $subject, $htmlBody) {
    $timeout = 10;
    $isSsl = ($port == 465 || strpos($host, 'ssl://') !== false);
    $connectHost = ($isSsl && strpos($host, 'ssl://') === false) ? 'ssl://' . $host : $host;

    $socket = @stream_socket_client($connectHost . ':' . $port, $errno, $errstr, $timeout);
    if (!$socket) {
        return ['success' => false, 'error' => "Koneksi SMTP socket gagal ($errno): $errstr"];
    }

    stream_set_timeout($socket, $timeout);

    $readResp = function($s) {
        $out = '';
        while ($str = fgets($s, 515)) {
            $out .= $str;
            if (substr($str, 3, 1) == ' ') break;
        }
        return $out;
    };

    $sendCmd = function($s, $cmd) use ($readResp) {
        fputs($s, $cmd . "\r\n");
        return $readResp($s);
    };

    $greeting = $readResp($socket);
    if (substr($greeting, 0, 3) != '220') {
        fclose($socket);
        return ['success' => false, 'error' => "Server SMTP tidak merespon: $greeting"];
    }

    $fromDomain = substr(strrchr($from, '@'), 1) ?: 'cliento.my.id';
    $sendCmd($socket, "EHLO " . $fromDomain);

    if ($port == 587) {
        $tls = $sendCmd($socket, "STARTTLS");
        if (substr($tls, 0, 3) != '220') {
            fclose($socket);
            return ['success' => false, 'error' => "STARTTLS ditolak: $tls"];
        }
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($socket);
            return ['success' => false, 'error' => "Enkripsi TLS gagal"];
        }
        $sendCmd($socket, "EHLO " . $fromDomain);
    }

    $auth = $sendCmd($socket, "AUTH LOGIN");
    if (substr($auth, 0, 3) != '334') {
        fclose($socket);
        return ['success' => false, 'error' => "AUTH LOGIN ditolak: $auth"];
    }

    $userRes = $sendCmd($socket, base64_encode($username));
    if (substr($userRes, 0, 3) != '334') {
        fclose($socket);
        return ['success' => false, 'error' => "Email/Username SMTP ditolak: $userRes"];
    }

    $passRes = $sendCmd($socket, base64_encode($password));
    if (substr($passRes, 0, 3) != '235') {
        fclose($socket);
        return ['success' => false, 'error' => "Password SMTP ditolak: $passRes"];
    }

    $mailFromRes = $sendCmd($socket, "MAIL FROM: <$from>");
    if (substr($mailFromRes, 0, 3) != '250') {
        fclose($socket);
        return ['success' => false, 'error' => "MAIL FROM ditolak: $mailFromRes"];
    }

    $rcptRes = $sendCmd($socket, "RCPT TO: <$to>");
    if (substr($rcptRes, 0, 3) != '250' && substr($rcptRes, 0, 3) != '251') {
        fclose($socket);
        return ['success' => false, 'error' => "RCPT TO ditolak: $rcptRes"];
    }

    $dataCmdRes = $sendCmd($socket, "DATA");
    if (substr($dataCmdRes, 0, 3) != '354') {
        fclose($socket);
        return ['success' => false, 'error' => "Perintah DATA ditolak: $dataCmdRes"];
    }

    $msgId = '<' . bin2hex(random_bytes(10)) . '@' . $fromDomain . '>';
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "Message-ID: $msgId\r\n";
    $headers .= "From: $fromName <$from>\r\n";
    $headers .= "Reply-To: $from\r\n";
    $headers .= "To: <$to>\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Date: " . date('r') . "\r\n";

    $message = $headers . "\r\n" . $htmlBody . "\r\n.\r\n";
    fputs($socket, $message);
    $dataResp = $readResp($socket);

    $sendCmd($socket, "QUIT");
    fclose($socket);

    if (substr($dataResp, 0, 3) == '250') {
        return ['success' => true, 'message' => 'Email terkirim via SMTP'];
    }
    return ['success' => false, 'error' => "Pengiriman data gagal: $dataResp"];
}

/**
 * Resend REST API Mailer (Free 3,000 emails/month via https://resend.com)
 */
function sendResendApiMail($apiKey, $from, $to, $subject, $html) {
    if (empty($apiKey)) return ['success' => false, 'error' => 'API Key Resend kosong'];
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'from' => $from ?: 'Cliento <onboarding@resend.dev>',
        'to' => [$to],
        'subject' => $subject,
        'html' => $html
    ]));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($res, true);
    return ['success' => ($code >= 200 && $code < 300), 'response' => $data];
}

/**
 * Brevo REST API Mailer (Free 300 emails/day / 9,000/mo via https://brevo.com)
 */
function sendBrevoApiMail($apiKey, $fromEmail, $fromName, $toEmail, $toName, $subject, $html) {
    if (empty($apiKey)) return ['success' => false, 'error' => 'API Key Brevo kosong'];
    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'api-key: ' . $apiKey,
        'Content-Type: application/json',
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'sender' => ['name' => $fromName, 'email' => $fromEmail],
        'to' => [['email' => $toEmail, 'name' => $toName]],
        'subject' => $subject,
        'htmlContent' => $html
    ]));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($res, true);
    return ['success' => ($code >= 200 && $code < 300), 'response' => $data];
}

/**
 * Helper to send branded HTML OTP email with support for Gmail SMTP, Resend API, & Native Mail
 */
function sendEmailOtp($toEmail, $otpCode, $userName = 'Pengguna Cliento', $purpose = 'register') {
    global $pdo;

    $badgeLabel = 'Verifikasi Akun Baru';
    $purposeDesc = 'Gunakan kode verifikasi OTP berikut untuk menyelesaikan pendaftaran akun Anda:';
    if ($purpose === 'forgot_password') {
        $badgeLabel = 'Pemulihan Kata Sandi Akun';
        $purposeDesc = 'Kami menerima permintaan untuk mereset kata sandi akun Anda. Masukkan kode OTP berikut:';
    } elseif ($purpose === 'change_email') {
        $badgeLabel = 'Verifikasi Perubahan Email';
        $purposeDesc = 'Gunakan kode OTP berikut untuk mengonfirmasi perubahan alamat email akun Cliento Anda:';
    }

    $subject = "Kode OTP $badgeLabel Cliento: " . $otpCode;
    
    $htmlContent = '
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
            .card { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .logo { font-size: 22px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 10px; background: #eff6ff; color: #2563eb; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
            .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
            .desc { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
            .otp-box { background: #f1f5f9; border: 2px dashed #93c5fd; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }
            .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a; font-family: monospace; }
            .otp-hint { font-size: 12px; color: #64748b; margin-top: 6px; }
            .footer { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">cliento <span style="font-size: 12px; font-weight: 500; color: #64748b;">sales intelligence</span></div>
            <div class="badge">' . htmlspecialchars($badgeLabel) . '</div>
            <div class="title">Halo, ' . htmlspecialchars($userName) . '!</div>
            <div class="desc">' . $purposeDesc . '</div>
            
            <div class="otp-box">
                <div class="otp-code">' . htmlspecialchars($otpCode) . '</div>
                <div class="otp-hint">Kode ini berlaku selama 15 menit. Jaga kerahasiaan kode Anda.</div>
            </div>
            
            <div class="desc" style="font-size: 13px;">Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini dengan aman.</div>
            
            <div class="footer">
                &copy; ' . date('Y') . ' cliento - sales intelligence. Seluruh hak cipta dilindungi.
            </div>
        </div>
    </body>
    </html>';

    // Check configured settings from DB, with config.local.php fallback
    $settings = [];
    try {
        if ($pdo) {
            $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings");
            $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        }
    } catch (Exception $e) {}

    $pickCfg = function($dbKey, $constName, $default = '') use ($settings) {
        $val = isset($settings[$dbKey]) ? trim((string)$settings[$dbKey]) : '';
        if ($val !== '') return $val;
        if (defined($constName)) {
            $cVal = trim((string)constant($constName));
            if ($cVal !== '') return $cVal;
        }
        return $default;
    };

    $provider = $pickCfg('smtp_provider', 'SMTP_PROVIDER', 'cpanel_smtp');
    $defaultHost = ($provider === 'gmail_smtp') ? 'smtp.gmail.com' : 'mail.cliento.my.id';
    $smtpHost = $pickCfg('smtp_host', 'SMTP_HOST', $defaultHost);
    $smtpPort = (int)$pickCfg('smtp_port', 'SMTP_PORT', '465');
    $smtpUser = $pickCfg('smtp_user', 'SMTP_USER', '');
    $smtpPass = $pickCfg('smtp_pass', 'SMTP_PASS', '');
    $smtpFrom = $pickCfg('smtp_from', 'SMTP_FROM', $smtpUser ?: 'noreply@cliento.my.id');
    $smtpFromName = 'cliento Sales Intelligence';
    $brevoKey = $settings['brevo_api_key'] ?? '';
    $resendKey = $settings['resend_api_key'] ?? '';
    $GLOBALS['cliento_last_mail_error'] = '';

    // 1. Try Brevo API (Free 300 emails/day to Gmail)
    if ($provider === 'brevo' || (!empty($brevoKey) && empty($smtpPass))) {
        $res = sendBrevoApiMail($brevoKey, $smtpFrom, $smtpFromName, $toEmail, $userName, $subject, $htmlContent);
        if (!empty($res['success'])) return true;
        $GLOBALS['cliento_last_mail_error'] = $res['error'] ?? json_encode($res['response'] ?? 'Brevo gagal');
    }

    // 2. Try Resend API (Free 3,000 emails/month)
    if ($provider === 'resend' || (!empty($resendKey) && empty($smtpPass))) {
        $res = sendResendApiMail($resendKey, $smtpFrom, $toEmail, $subject, $htmlContent);
        if (!empty($res['success'])) return true;
        $GLOBALS['cliento_last_mail_error'] = $res['error'] ?? json_encode($res['response'] ?? 'Resend gagal');
    }

    // 3. Try cPanel Domain SMTP / Gmail SMTP if password configured
    if (!empty($smtpUser) && !empty($smtpPass)) {
        $res = sendDirectSmtpSocket($smtpHost, $smtpPort, $smtpUser, $smtpPass, $smtpFrom, $smtpFromName, $toEmail, $subject, $htmlContent);
        if (!empty($res['success'])) return true;
        $GLOBALS['cliento_last_mail_error'] = $res['error'] ?? 'Koneksi SMTP gagal';
        error_log("sendDirectSmtpSocket failed: " . $GLOBALS['cliento_last_mail_error']);
    } else {
        $GLOBALS['cliento_last_mail_error'] = 'SMTP / API email belum dikonfigurasi.';
    }

    // 4. Fallback to native PHP mail (only on non-SMTP setups where mail() might work)
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $smtpFromName . ' <' . $smtpFrom . '>',
        'Reply-To: ' . $smtpFrom,
        'X-Mailer: PHP/' . phpversion()
    ];

    $sent = false;
    try {
        $sent = @mail($toEmail, $subject, $htmlContent, implode("\r\n", $headers));
    } catch (Exception $e) {
        $sent = false;
    }
    return (bool)$sent;
}


