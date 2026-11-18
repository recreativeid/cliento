# cliento Google Maps Scraper 1.5.0

Ekstensi mengambil informasi yang tampil di Google Maps setelah pengguna
mengeklik **Mulai scraping**. Rekap dapat diunduh sebagai JSON dan diimpor ke
cliento untuk disimpan dalam riwayat, ditampilkan dalam tabel, dan diekspor
ke Excel. Ekstensi tidak memerlukan Google Places API.

1. Buka `chrome://extensions`, aktifkan **Developer mode**, lalu **Load unpacked**
   folder `C:\xampp\htdocs\Client_Reach_ai\extension`.
   Jika sudah terpasang, klik **Reload** agar memakai versi 1.5.0.
2. Muat ulang tab Google Maps (`www.google.com/maps` atau `www.google.co.id/maps`).
3. Cari jenis bisnis dan wilayah yang diinginkan, misalnya `klinik Magelang`.
4. Atur batas 1–100 hasil per proses (default 30), lalu klik **Mulai scraping**
   pada panel cliento. Opsi detail membuka profil satu per satu untuk
   membaca kontak, website, kategori dan jam yang ditampilkan. Opsi gulir memuat
   hasil berikutnya dari pencarian yang sama, maksimal 20 kali gulir.
5. Klik **Hentikan** kapan saja. Hasil yang sudah terkumpul tetap tersedia.
   Untuk satu bisnis, buka profilnya lalu **Ambil profil yang terbuka**.
6. Klik **Unduh rekap JSON**. Di aplikasi cliento, buka **Impor Google Maps**,
   pilih file tersebut, periksa jumlah record, lalu klik tombol impor.

Rekap menggabungkan bisnis berdasarkan identitas URL Maps; mengambil bisnis yang
sama kembali memperbarui datanya. Rekap disimpan dalam memori tab dan hilang jika
tab dimuat ulang atau ditutup. Unduh sebelum meninggalkan halaman. Maksimal
500 record per file untuk batas impor sistem; kosongkan rekap setelah diunduh
apabila perlu melanjutkan pencarian lain.

Nama, alamat, kategori, telepon, website, jam, koordinat, rating dan jumlah ulasan
hanya diisi ketika terbaca dari halaman. Data yang tidak tampil atau tidak dapat
dipastikan tetap kosong. Nomor seluler tidak dianggap sebagai WhatsApp. Review
teks tidak dikumpulkan. Rating dan jumlah ulasan dapat berubah dari waktu ke waktu.

Tidak ada pengambilan sebelum klik pengguna, kirim otomatis ke server, rotasi
pencarian, atau bypass CAPTCHA. Jika pembatasan muncul, proses berhenti. Gunakan
data sesuai ketentuan Google Maps dan izin penggunaan Anda. Perubahan tampilan
Google Maps dapat membuat sebagian kolom tidak terbaca; verifikasi hasil sebelum
dipakai. Ekstensi ini belum diuji langsung pada semua variasi tampilan Google Maps.
