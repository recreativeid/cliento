# CLIENTO - DOKUMENTASI SISTEM

Versi: 2.2 | Diperbarui: 2026-11-18

## 1. Ringkasan

Cliento adalah aplikasi pengambilan dan pengelolaan prospek bisnis. Alur
pengambilan saat ini menggunakan **Google Maps melalui ekstensi Chrome**.
Pengguna memulai scraping pada browser, mengunduh JSON, lalu mengimpor hasilnya
ke aplikasi. Sistem menyimpan riwayat, menampilkan rekap, menyediakan filter,
penyimpanan ke arsip, dan ekspor Excel.

Alur ekstensi tidak membutuhkan Google Cloud atau Places API key. Peta dan
data wilayah pada aplikasi membantu memilih target; pengambilan bisnis pada
UI utama tidak memakai OSM atau fallback sumber bisnis lain. Data historis
dari sumber lama tetap memiliki asalnya sendiri.

## 2. Arsitektur

Frontend memakai HTML, CSS, JavaScript, Leaflet untuk peta, Chart.js untuk
dashboard, SheetJS untuk ekspor Excel, dan FontAwesome. Ekstensi memakai
Chrome Manifest V3 dan membaca halaman Google Maps setelah tindakan pengguna.

Backend memakai PHP dan PDO. Database instalasi dapat menggunakan SQLite
atau PostgreSQL/Supabase sesuai konfigurasi privat. Tabel `scraping_history`
dan `scraped_items` menyimpan impor dan hasilnya. `insights_json` menyimpan
provenance, ketersediaan metrik, dan informasi kontak bersumber. Integrasi
Gemini menyusun pesan outreach berdasarkan data yang tersedia.

### Alur data utama

```text
Pengguna memilih lokasi/kategori di aplikasi
    -> Membuka pencarian Google Maps
    -> Memulai scraping dari panel ekstensi (maksimal 100 bisnis)
    -> Ekstensi membaca hasil dan detail yang tersedia
    -> Pengguna mengunduh JSON
    -> Pengguna login dan mengimpor JSON ke cliento
    -> Validasi + deduplikasi dalam satu impor
    -> Simpan scraping_history + scraped_items
    -> Tabel rekap / filter / riwayat
    -> Simpan arsip / ekspor Excel
```

Pengguna dapat menghentikan proses ekstensi. Ekstensi tidak mengirim hasil
otomatis ke server dan tidak melewati CAPTCHA. Perubahan struktur Google Maps
dapat memengaruhi kelengkapan pengambilan. Kegagalan membaca satu kolom tidak
diisi dengan data buatan.

### Struktur berkas utama

```text
index.html                  UI utama
config.php                  Konfigurasi dan koneksi database
api/source_import.php       Impor JSON terautentikasi
api/open_sources.php        Normalisasi, validasi, dan penyimpanan impor
api/history.php             Riwayat dan penyimpanan hasil ke arsip
api/archives.php            Pengelolaan arsip
api/google_places.php       Adapter Places server opsional, tidak otomatis
api/scraper.php             Status/katalog dan endpoint scraper legacy
api/gemini.php              Copywriting Gemini
api/auth.php                Autentikasi
assets/js/scraper.js         Peluncuran Maps, impor, rekap, dan ekspor
assets/js/archives.js        Tampilan arsip
extension/manifest.json     Konfigurasi ekstensi Chrome
extension/content.js        Scraping Google Maps yang dimulai pengguna
extension/README.md         Pemasangan dan penggunaan ekstensi
```

## 3. Pengambilan dan rekap

1. Pasang atau muat ulang ekstensi Chrome versi 1.5.0.
2. Pilih wilayah atau titik target dan kategori pada aplikasi, lalu buka Maps.
3. Klik **Mulai scraping** pada ekstensi, maksimal 100 bisnis per proses.
   Gunakan **Ambil profil yang terbuka** untuk profil tunggal, atau klik
   **Hentikan** jika hasil sudah cukup.
4. Unduh JSON, pilih file pada bagian impor aplikasi, lalu konfirmasi impor.
5. Data tersimpan pada akun pengguna dan tampil pada rekap hasil.
6. Gunakan filter, buka rincian sumber, simpan ke arsip, atau ekspor ke Excel.

Data bisnis yang didukung mencakup nama, kategori, alamat, telepon, website,
jam buka, koordinat, rating, dan jumlah ulasan jika teramati. Rating dan jumlah
ulasan adalah metrik agregat, bukan seluruh teks ulasan. Telepon tidak dianggap
otomatis sebagai WhatsApp. URL profil dan waktu pengamatan dipertahankan.

Impor dibatasi 2 MB dan 500 record per file pada backend. Ekstensi mengambil
maksimal 100 bisnis per proses dan dapat menampung 500 bisnis pada rekap dari
beberapa proses. Record dengan URL profil Google Maps yang sama digabung dalam
satu impor. Mengimpor ulang pada sesi lain dapat membuat riwayat baru.

Nilai yang tidak tersedia tidak ditebak. Kolom database metrik memakai `0`
sebagai nilai kompatibilitas untuk data hilang; metadata `insights_json.metrics`
membedakan metrik teramati dari metrik yang tidak tersedia. Ekspor menyertakan
atribusi sumber. Provenance ikut dipertahankan ketika riwayat disalin ke arsip.

## 4. API

- `POST api/source_import.php`: memerlukan login; menerima JSON `records`
  beserta metadata sumber dan `context` opsional. Hasil sukses mengembalikan
  `history_id` dan item tersimpan. Validasi gagal mengembalikan HTTP 400.
- `api/scraper.php?action=google_places_status`: status konfigurasi adapter
  tanpa mengembalikan key.
- `api/scraper.php?action=preview`, `scan`, atau `scrape`: HTTP 409;
  gunakan pengambilan ekstensi dan impor JSON.
- `api/scraper.php?action=import_chrome` dan `get_latest_chrome_import`:
  endpoint lama, HTTP 410; tidak digunakan untuk sinkronisasi otomatis.
- `api/scraper.php?action=open_source_catalog`: katalog sumber legacy untuk
  kompatibilitas, bukan penentu sumber pengambilan pada UI utama.
- `api/auth.php`: login, registrasi, verifikasi akun, dan pemeriksaan sesi.
- `api/history.php` dan `api/archives.php`: riwayat serta pengelolaan arsip.

Detail format, validasi URL Google Maps, dan batas data dijelaskan dalam
[panduan impor](OPEN_SOURCES.md).

## 5. Infrastruktur legacy

Repository masih menyimpan implementasi lama Overpass, Nominatim, Photon,
master database JSONL, dan worker harvest. Berkas terkait antara lain
`api/master_db.php`, `api/harvest_queue.php`, `api/harvest_worker.php`,
`api/full_harvest.php`, `assets/js/harvest.js`, dan `data/places_*.jsonl`.
Alur pengambilan bisnis lama tersebut tidak dijalankan oleh UI utama saat ini.

Data wilayah dan geometri peta tetap dapat dipakai untuk memilih lokasi.
Keberadaan layanan geospasial atau data OSM lama tidak berarti hasil bisnis
Google Maps dilengkapi otomatis dari sumber tersebut. Statistik jumlah bisnis
terpanen dalam dokumentasi versi lama adalah catatan historis dan bukan
ukuran terkini dari hasil Google Maps.

Normalizer backend mempertahankan dukungan format impor publik lama untuk
kompatibilitas. UI pengambilan utama menggunakan Google Maps. Adapter Places
server tetap tersedia untuk integrasi eksplisit dan tidak dipanggil otomatis;
lihat [konfigurasi Places](GOOGLE_PLACES_SETUP.md).

## 6. Autentikasi dan data

Impor memerlukan pengguna terautentikasi dan menyimpan pemilik riwayat.
Penyimpanan batch menggunakan transaksi: kegagalan menyimpan item membatalkan
riwayat dan item pada transaksi tersebut. Provenance mencatat informasi sumber
yang disampaikan pengguna, bukan verifikasi independen atau pemberian lisensi.

Gemini digunakan untuk pesan outreach dari data yang tersedia. Gemini tidak
menebak kontak, website, rating, atau ulasan. Gemini Pro dan Google Maps
Platform memiliki akses, billing, serta kuota terpisah. Ekstensi tidak
memerlukan keduanya untuk membaca halaman yang dibuka pengguna.

## 7. Menjalankan aplikasi

1. Jalankan Apache XAMPP atau server PHP pada folder proyek.
2. Akses `http://localhost/Client_Reach_ai/index.html` untuk XAMPP, atau alamat
   server PHP yang digunakan.
3. Konfigurasikan database instalasi pada `config.local.php` privat bila perlu.
   Jangan menyimpan kredensial ke repository.
4. Login memakai akun instalasi, pasang ekstensi, lalu ikuti alur impor.

Untuk instalasi Supabase, konfigurasi koneksi disimpan pada server dan ekstensi
PHP `pdo_pgsql` harus tersedia. Gunakan prosedur migrasi instalasi yang sesuai;
perubahan kode ini tidak membuktikan koneksi cloud atau migrasi telah dijalankan.

Lihat [panduan ekstensi](extension/README.md) untuk pemasangan dan
[panduan data](OPEN_SOURCES.md) untuk penggunaan harian.
