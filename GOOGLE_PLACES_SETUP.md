# Google Maps melalui ekstensi dan adapter Places opsional

Alur utama cliento menggunakan **ekstensi Chrome Google Maps** yang dimulai
pengguna, maksimal 100 bisnis per proses. Hasil JSON diunduh lalu diimpor secara
eksplisit ke aplikasi setelah login. Alur ekstensi ini **tidak membutuhkan
Google Places API key**, Google Cloud, atau langganan Gemini.

Lihat [panduan pengambilan dan rekap](OPEN_SOURCES.md) serta
[pemasangan ekstensi](extension/README.md).

## Adapter Google Places API

`api/google_places.php` tetap tersedia sebagai adapter server untuk integrasi
terpisah. Adapter tidak dipanggil oleh alur utama dan mengisi API key tidak
memulai panggilan Places secara otomatis. Endpoint `preview`, `scan`, dan
`scrape` diarahkan ke alur impor ekstensi melalui respons HTTP 409; tidak ada
fallback pengambilan bisnis OSM pada UI utama.

Pemakaian adapter memerlukan project Google Cloud, pengaktifan Places API,
billing, kuota, dan API key milik instalasi sendiri. Simpan key hanya di
konfigurasi server privat, bukan kode ekstensi atau browser. Contoh
`config.local.php` berikut menggunakan placeholder:

```php
return [
    'GOOGLE_MAPS_API_KEY' => 'PASTE_API_KEY_DI_SINI',
    'GOOGLE_PLACES_ENABLED' => false,
    'GOOGLE_PLACES_MAX_PAGES' => 3,
];
```

Adapter dinonaktifkan secara default. Mengubah `GOOGLE_PLACES_ENABLED` menjadi
`true` hanya mengizinkan adapter digunakan oleh integrasi eksplisit; perubahan
itu tidak mengganti alur ekstensi di UI. Biaya dan ketentuan Google Maps
Platform berlaku bila adapter benar-benar digunakan.

Status konfigurasi dapat diperiksa tanpa mengembalikan API key:

```text
/api/scraper.php?action=google_places_status
```

## Data dan Gemini

Rating dan jumlah ulasan yang terlihat pada Google Maps dapat disimpan oleh
ekstensi. Nilai yang tidak terbaca tetap tidak tersedia. Nomor telepon hanya
disimpan jika tercantum; nomor seluler tidak membuktikan akun WhatsApp aktif.
Ekstensi tidak melewati CAPTCHA atau pembatasan akses.

Gemini Pro dan Google Maps Platform memiliki layanan, akses, billing, dan
kuota terpisah. Gemini tidak memberikan akses otomatis ke Places API dan
tidak digunakan untuk menebak kontak atau metrik bisnis.
