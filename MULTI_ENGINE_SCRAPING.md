# Panduan Mesin Pengambilan Data Otomatis & WA Hunter

cliento kini dilengkapi dengan arsitektur **Multi-Engine** yang bekerja 100% di latar belakang (*background*) tanpa perlu ekstensi manual:

---

## 1. Cloud API (Estafet Waterfall)

Jika Anda memiliki API Key gratis dari penyedia cloud, sistem akan menjalankannya secara **estafet (waterfall)**:

```
[Permintaan Pencarian]
        │
        ▼
┌───────────────────────────────┐
│ Prioritas 1: APIFY            │ ──(Sukses)──► Selesai & Simpan Data
│ (Jatah gratis $5/bln, ~1.500) │
└───────────────────────────────┘
        │ (Jika kuota habis / Error 429)
        ▼
┌───────────────────────────────┐
│ Prioritas 2: OUTSCRAPER       │ ──(Sukses)──► Selesai & Simpan Data
│ (Jatah gratis 500 data/bln)   │
└───────────────────────────────┘
        │ (Jika kuota habis)
        ▼
┌───────────────────────────────┐
│ Prioritas 3: SERPAPI          │ ──(Sukses)──► Selesai & Simpan Data
│ (Jatah gratis 100 search/bln) │
└───────────────────────────────┘
```

### Cara Memasang API Key:
Buka file `config.local.php` di folder utama, lalu tambahkan key Anda:
```php
return [
    // ... konfigurasi database ...

    // Cloud Scraping Multi-API
    'APIFY_TOKEN'        => 'PASTE_APIFY_TOKEN_DI_SINI',
    'OUTSCRAPER_API_KEY' => 'PASTE_OUTSCRAPER_KEY_DI_SINI',
    'SERPAPI_API_KEY'    => 'PASTE_SERPAPI_KEY_DI_SINI',
];
```
> **Catatan:** Apify dan Outscraper bisa didaftarkan secara gratis menggunakan email tanpa kartu kredit.

---

## 2. Mesin Lokal Laptop (Node.js Chrome Engine)

Berjalan 100% di komputer/laptop Anda sendiri tanpa ketergantungan kuota pihak ketiga.

* **Incremental Real-Time Auto-Save:** Setiap kali 1 data bisnis terdeteksi, data tersebut langsung disimpan ke database/file lokal. Jika proses terputus, data yang sudah didapat tidak akan hilang.
* **Deteksi CAPTCHA Interaktif:**
  * Jika Google memunculkan verifikasi CAPTCHA, komputer membunyikan nada (*beep*).
  * Jendela browser otomatis dimunculkan ke layar laptop Anda.
  * Ada timer **45 detik**: Jika Anda menyelesaikannya, jendela otomatis kembali sembunyi dan proses berlanjut.
  * **Failover Otomatis:** Jika 45 detik berlalu tanpa respons (misalnya Anda sedang tidak di depan laptop), data awal yang sudah didapat tetap aman, dan sisa targetnya otomatis dialihkan ke **Cloud API**!

### Cara Menjalankan:
* **Via Web Dashboard:** Klik tombol hijau **"Mesin Lokal (Laptop Sendiri)"** di panel pencarian cliento.
* **Via Terminal / Command Prompt:**
  ```bash
  node scripts/local_headless_scraper.js --query="kuliner di Magelang" --limit=30 --headless=true
  ```

---

## 3. Sosmed & Direct WA Hunter (DuckDuckGo Dorking)

Memburu nomor WhatsApp aktif langsung dari profil publik media sosial:
* **Platform:** Instagram Bio, Facebook Pages/Posts, TikTok Profiles, Linktree, dan Website.
* **Keunggulan:**
  * 100% Gratis selamanya tanpa API Key.
  * Menggunakan DuckDuckGo Engine (tanpa CAPTCHA agresif, tanpa perlu VPN).
  * Jeda manusiawi (*human-like throttling* 1,5 detik) menjaga reputasi IP internet rumahan Anda.
* **Pemisahan Sumber:**
  * Data dorking ditandai khusus dengan label `source_type: google_dorking`.
  * Di tabel hasil, Anda dapat menyaring data hanya dari Google Maps atau hanya dari Sosmed Dorking melalui tombol filter **Google Maps** dan **Sosmed Dorking**.
