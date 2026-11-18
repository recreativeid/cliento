# Pengambilan dan rekap data Google Maps

Alur utama cliento mengambil data bisnis dari **Google Maps melalui ekstensi
Chrome**, lalu mengimpor hasilnya ke sistem. Pengguna memulai scraping sendiri.
Ekstensi tidak memerlukan Google Cloud, Google Places API key, atau Gemini key.
Alur utama tidak mengambil atau melengkapi data bisnis dari OSM.

## Cara menggunakan

1. Pasang atau muat ulang ekstensi versi 1.5.0 sesuai
   [panduan ekstensi](extension/README.md).
2. Pilih lokasi dan kategori di cliento, lalu buka pencarian Google Maps.
3. Di Google Maps, tentukan batas hasil, maksimal **100 bisnis per proses**,
   lalu klik **Mulai scraping**. Untuk profil tunggal, gunakan
   **Ambil profil yang terbuka**.
4. Tunggu pengambilan selesai, atau klik **Hentikan**.
5. Klik **Unduh rekap JSON** pada panel ekstensi.
6. Login ke cliento, pilih JSON tersebut pada bagian **Impor Google Maps**,
   periksa ringkasannya, lalu jalankan impor.
7. Hasil tersimpan dalam riwayat dan tampil pada tabel rekap. Hasil dapat
   difilter, disimpan ke arsip, dan diekspor ke Excel.

Ekstensi mengumpulkan hasil setelah pengguna memulai proses. Data tidak dikirim
otomatis ke server. Impor adalah tindakan terpisah yang memerlukan login.
Duplikat dengan URL profil Google Maps yang sama digabung dalam satu impor.
Impor ulang file yang sama pada sesi berbeda dapat membuat riwayat baru.

## Data yang disimpan

Nama, kategori, alamat, telepon, website, jam buka, koordinat, rating, dan jumlah
ulasan disimpan jika terbaca pada Google Maps. URL sumber dan waktu pengamatan
disertakan agar asal data tetap dapat ditelusuri. Rating dan jumlah ulasan
adalah nilai agregat yang terlihat, bukan unduhan seluruh teks ulasan.

Data yang tidak terlihat atau tidak berhasil dibaca tetap kosong/tidak tersedia.
Nomor telepon tidak otomatis dianggap sebagai WhatsApp. Sistem dan Gemini
tidak menebak nomor, website, rating, atau ulasan.

Struktur halaman Google Maps dapat berubah; sebagian hasil mungkin tidak
memiliki data lengkap. Jika CAPTCHA atau pembatasan muncul, pengambilan
berhenti. Ekstensi tidak melewati CAPTCHA atau mekanisme pembatasan akses.
Pengguna tetap bertanggung jawab mengikuti ketentuan Google Maps dan dasar
penggunaan data yang berlaku. Pencatatan `usage_basis` bukan pemberian lisensi
atau verifikasi independen oleh aplikasi.

## Format JSON

Ekstensi menghasilkan JSON dengan `records`. Metadata dapat berada di setiap
record atau menjadi default melalui `source`. Contoh berikut hanya format,
bukan bisnis nyata:

```json
{
  "context": {
    "query_name": "Cafe di Jakarta",
    "location_name": "Jakarta",
    "target_category": "Cafe"
  },
  "source": {
    "source_type": "google_maps_extension",
    "source_name": "Google Maps (Chrome)",
    "usage_basis": "Pengambilan data publik Google Maps dimulai pengguna"
  },
  "records": [
    {
      "name": "NAMA BISNIS DARI GOOGLE MAPS",
      "category": "KATEGORI DARI GOOGLE MAPS",
      "address": "ALAMAT DARI GOOGLE MAPS",
      "phone": "",
      "whatsapp": "",
      "website": "",
      "lat": null,
      "lng": null,
      "source_url": "https://www.google.com/maps/place/NAMA+BISNIS",
      "observed_at": ""
    }
  ]
}
```

Tambahkan `rating` hanya jika diamati, bernilai 1 sampai 5. Tambahkan
`reviews_count` hanya jika diamati, berupa bilangan bulat nonnegatif. Untuk
data yang tidak tersedia, hilangkan kolom tersebut atau gunakan `null`.
Jangan mengisi rating `0` sebagai pengganti data yang tidak tersedia.

`name`, `source_name`, `source_type`, `source_url`, dan salah satu
`license`/`usage_basis` wajib diisi. Untuk `google_maps_extension`, URL wajib
HTTPS menuju profil bisnis Google Maps pada domain Google `.com` atau
`.co.id` yang didukung. Koordinat boleh kosong; jika diisi, kedua koordinat
harus valid. Kontak hanya disertakan jika tercantum pada sumber.

Endpoint impor menerima maksimal 2 MB dan 500 record per file. Ekstensi dapat
menampung maksimal 500 bisnis pada rekap dari beberapa proses, dengan batas
100 bisnis setiap proses scraping.
Provenance dan status ketersediaan metrik disimpan dalam `insights_json`,
dipertahankan saat penyimpanan ke arsip, dan atribusi disertakan pada ekspor.

## Kompatibilitas dan integrasi lama

Normalizer backend masih mendukung `government_directory`, `official_business`,
`community`, `company_website`, dan `browser_manual` untuk kompatibilitas impor
lama. Jenis tersebut tidak menjadi sumber pengambilan bisnis pada UI utama.
Data historis OSM tetap merupakan data historis, tidak diubah menjadi data
Google Maps. Katalog sumber terbuka dan kode harvester lama adalah infrastruktur
legacy; tidak ada fallback OSM pada pengambilan utama.

Endpoint `preview`, `scan_territory`, dan `scrape` server mengembalikan HTTP 409 dan
mengarahkan pengguna ke impor ekstensi. Endpoint Chrome lama `import_chrome`
dan `get_latest_chrome_import` tetap HTTP 410. Gunakan
`api/source_import.php` melalui tombol impor aplikasi.

Adapter Google Places server tetap opsional dan tidak dipanggil otomatis.
Lihat [konfigurasi Google Places](GOOGLE_PLACES_SETUP.md). Gemini hanya dipakai
untuk menyusun pesan dari data yang tersedia; akses dan kuotanya terpisah dari
Google Maps Platform.
