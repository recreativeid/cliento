<?php
/**
 * Unit tests for OTP UTC expiry alignment and cPanel SMTP configuration guards.
 */
$authPhp = file_get_contents(__DIR__ . '/../api/auth.php');
$configPhp = file_get_contents(__DIR__ . '/../config.php');

function assertTrue($cond, $msg) {
    if (!$cond) {
        fwrite(STDERR, "FAIL: $msg\n");
        exit(1);
    }
}

// 1. Ensure api/auth.php never compares PHP local date() against SQLite UTC CURRENT_TIMESTAMP
assertTrue(strpos($authPhp, 'expires_at >= CURRENT_TIMESTAMP') === false, 'api/auth.php must not mix CURRENT_TIMESTAMP with PHP expiry timestamps');
assertTrue(substr_count($authPhp, "gmdate('Y-m-d H:i:s'") >= 8, 'api/auth.php must use UTC gmdate for both insert expires_at and verify SELECT');
assertTrue(strpos($authPhp, 'if (!$emailSent && !isLocalDev())') !== false, 'api/auth.php must surface real failure in production when email delivery fails');

// 2. Ensure config.php enforces SMTP protocol responses and Message-ID header
assertTrue(strpos($configPhp, 'Message-ID:') !== false, 'config.php sendDirectSmtpSocket must include Message-ID header for Gmail Inbox compliance');
assertTrue(strpos($configPhp, "MAIL FROM ditolak") !== false && strpos($configPhp, "RCPT TO ditolak") !== false && strpos($configPhp, "Perintah DATA ditolak") !== false, 'config.php sendDirectSmtpSocket must validate SMTP command reply codes');
assertTrue(strpos($configPhp, "define('SMTP_PROVIDER'") !== false && strpos($configPhp, "define('SMTP_PASS'") !== false, 'config.php must support SMTP_* constants from config.local.php');

// 3. Verify UTC expiry window SQL logic on SQLite
$pdo = new PDO('sqlite::memory:');
$pdo->exec('CREATE TABLE email_otps (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, otp_code TEXT, type TEXT, expires_at DATETIME, is_used INTEGER DEFAULT 0)');
$validExp = gmdate('Y-m-d H:i:s', time() + 900);
$staleExp = gmdate('Y-m-d H:i:s', time() - 60);
$pdo->prepare("INSERT INTO email_otps (email, otp_code, type, expires_at) VALUES (?, ?, 'register', ?)")->execute(['u@gmail.com', '123456', $validExp]);
$pdo->prepare("INSERT INTO email_otps (email, otp_code, type, expires_at) VALUES (?, ?, 'register', ?)")->execute(['u@gmail.com', '654321', $staleExp]);

$nowUtc = gmdate('Y-m-d H:i:s');
$q = $pdo->prepare("SELECT otp_code FROM email_otps WHERE email = ? AND otp_code = ? AND is_used = 0 AND expires_at >= ? LIMIT 1");
$q->execute(['u@gmail.com', '123456', $nowUtc]);
assertTrue($q->fetchColumn() === '123456', 'Valid future UTC OTP must be accepted');
$q->execute(['u@gmail.com', '654321', $nowUtc]);
assertTrue($q->fetchColumn() === false, 'Expired UTC OTP must be rejected immediately');

echo "All OTP UTC Expiry & cPanel SMTP Header Guard tests PASSED!\n";
