<?php
/**
 * Client Reach AI - Admin Settings & Profile API
 * Handles Admin profile updates, password changes, and system settings.
 */
require_once __DIR__ . '/../config.php';

$currentUser = getAuthUser($pdo, 'admin');

$rawInput = file_get_contents('php://input');
$jsonInput = !empty($rawInput) ? json_decode($rawInput, true) : [];
$input = !empty($jsonInput) ? $jsonInput : $_POST;
$action = $_GET['action'] ?? ($input['action'] ?? 'get_profile');

// 1. GET ADMIN PROFILE
if ($action === 'get_profile') {
    $stmt = $pdo->prepare("SELECT id, role, name, email, phone, status, avatar, last_login, created_at FROM users WHERE id = ?");
    $stmt->execute([$currentUser['id']]);
    $profile = $stmt->fetch();

    jsonResponse(['success' => true, 'profile' => $profile]);
}

// 2. UPDATE ADMIN LOGIN INFO & PROFILE
if ($action === 'update_profile') {
    $name = trim($input['name'] ?? '');
    $email = strtolower(trim($input['email'] ?? ''));
    $phone = trim($input['phone'] ?? '');

    if (empty($name)) {
        jsonResponse(['success' => false, 'message' => 'Nama lengkap admin wajib diisi.'], 400);
    }
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Format email login tidak valid.'], 400);
    }

    // Check email conflict
    $chk = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
    $chk->execute([$email, $currentUser['id']]);
    if ($chk->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Email login sudah digunakan oleh akun lain.'], 409);
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$name, $email, $phone, $currentUser['id']]);

        $upStmt = $pdo->prepare("SELECT id, role, name, email, phone, status, avatar FROM users WHERE id = ?");
        $upStmt->execute([$currentUser['id']]);
        $updated = $upStmt->fetch();

        jsonResponse([
            'success' => true,
            'message' => 'Informasi profil dan login admin berhasil disimpan!',
            'user' => $updated
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Gagal menyimpan profil: ' . $e->getMessage()], 500);
    }
}

// 3. CHANGE ADMIN PASSWORD
if ($action === 'change_password') {
    $currentPassword = $input['current_password'] ?? '';
    $newPassword = $input['new_password'] ?? '';
    $confirmPassword = $input['confirm_password'] ?? '';

    if (empty($currentPassword)) {
        jsonResponse(['success' => false, 'message' => 'Password saat ini wajib dimasukkan.'], 400);
    }
    if (strlen($newPassword) < 6) {
        jsonResponse(['success' => false, 'message' => 'Password baru minimal 6 karakter.'], 400);
    }
    if ($newPassword !== $confirmPassword) {
        jsonResponse(['success' => false, 'message' => 'Konfirmasi password baru tidak cocok.'], 400);
    }

    // Verify current password
    $pwdStmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
    $pwdStmt->execute([$currentUser['id']]);
    $storedHash = $pwdStmt->fetchColumn();

    if (!password_verify($currentPassword, $storedHash)) {
        jsonResponse(['success' => false, 'message' => 'Password saat ini yang Anda masukkan salah.'], 400);
    }

    try {
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$newHash, $currentUser['id']]);

        jsonResponse([
            'success' => true,
            'message' => 'Password admin berhasil diubah! Gunakan password baru untuk login selanjutnya.'
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Gagal mengubah password: ' . $e->getMessage()], 500);
    }
}

// 4. GET SYSTEM SETTINGS
if ($action === 'get_system_settings') {
    $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings");
    $rawSettings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $pickSetting = function($key, $constName, $default = '') use ($rawSettings) {
        $v = isset($rawSettings[$key]) ? trim((string)$rawSettings[$key]) : '';
        if ($v !== '') return $v;
        if (defined($constName) && trim((string)constant($constName)) !== '') {
            return trim((string)constant($constName));
        }
        return $default;
    };

    $gemini = $pickSetting('gemini_api_key', 'GEMINI_API_KEY', '');
    $gmaps = $pickSetting('gmaps_api_key', 'GOOGLE_MAPS_API_KEY', '');
    $smtpProvider = $pickSetting('smtp_provider', 'SMTP_PROVIDER', 'cpanel_smtp');
    $smtpHost = $pickSetting('smtp_host', 'SMTP_HOST', 'mail.cliento.my.id');
    $smtpPort = $pickSetting('smtp_port', 'SMTP_PORT', '465');
    $smtpUser = $pickSetting('smtp_user', 'SMTP_USER', '');
    $smtpFrom = $pickSetting('smtp_from', 'SMTP_FROM', $smtpUser ?: 'noreply@cliento.my.id');
    $hasSmtpPass = !empty($rawSettings['smtp_pass']) || (defined('SMTP_PASS') && SMTP_PASS !== '');
    $brevoKey = $rawSettings['brevo_api_key'] ?? '';
    $resendKey = $rawSettings['resend_api_key'] ?? '';

    jsonResponse([
        'success' => true,
        'settings' => [
            'gemini_api_key' => $gemini,
            'gmaps_api_key' => $gmaps,
            'smtp_provider' => $smtpProvider,
            'smtp_host' => $smtpHost,
            'smtp_port' => $smtpPort,
            'smtp_user' => $smtpUser,
            'smtp_from' => $smtpFrom,
            'has_smtp_pass' => $hasSmtpPass,
            'brevo_api_key' => $brevoKey,
            'resend_api_key' => $resendKey,
            'backend_url' => $rawSettings['backend_url'] ?? ''
        ]
    ]);
}

// 5. SAVE SYSTEM SETTINGS
if ($action === 'save_system_settings') {
    $allowedFields = [
        'gemini_api_key', 'gmaps_api_key',
        'smtp_provider', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from',
        'brevo_api_key', 'resend_api_key', 'backend_url'
    ];
    $settings = [];
    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $input)) {
            $settings[$field] = trim((string)$input[$field]);
        }
    }

    if (!empty($input['smtp_pass'])) {
        $settings['smtp_pass'] = $input['smtp_pass'];
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                               ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP");
        foreach ($settings as $k => $v) {
            $stmt->execute([$k, $v]);
        }

        jsonResponse([
            'success' => true,
            'message' => 'Pengaturan sistem & konfigurasi API email berhasil disimpan!'
        ]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Gagal menyimpan pengaturan: ' . $e->getMessage()], 500);
    }
}

// 6. TEST SEND EMAIL TO GMAIL
if ($action === 'test_email') {
    $targetEmail = strtolower(trim($input['target_email'] ?? ''));
    if (empty($targetEmail) || !filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Alamat email target uji coba tidak valid.'], 400);
    }

    $testOtp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $sent = sendEmailOtp($targetEmail, $testOtp, 'Admin Cliento', 'register');

    if ($sent) {
        jsonResponse([
            'success' => true,
            'message' => 'Uji coba pengiriman email BERHASIL! Kode OTP simulasi ' . $testOtp . ' dikirimkan ke ' . $targetEmail . '. Silakan periksa Inbox/Spam Gmail Anda.',
            'otp' => $testOtp
        ]);
    } else {
        $errDetail = !empty($GLOBALS['cliento_last_mail_error']) ? (' (' . $GLOBALS['cliento_last_mail_error'] . ')') : '';
        jsonResponse([
            'success' => false,
            'message' => 'Gagal mengirim email secara langsung' . $errDetail . '. Pastikan konfigurasi Email cPanel/Gmail atau API Key Brevo/Resend sudah tepat.',
            'otp_preview' => $testOtp
        ], 500);
    }
}

jsonResponse(['success' => false, 'message' => 'Aksi pengaturan tidak valid.'], 400);
