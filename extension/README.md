# cliento Google Maps Scraper 1.6.0

Ekstensi mengambil informasi yang tampil di Google Maps setelah pengguna
mengeklik **Mulai scraping**. Mulai v1.6.0, hasil dapat langsung dikirim
otomatis ke tab cliento (`localhost` atau `recreativeid.github.io`) maupun
diunduh sebagai JSON cadangan untuk diekspor ke Excel. Ekstensi tidak memerlukan Google Places API.

1. Buka `chrome://extensions`, aktifkan **Developer mode**, lalu **Load unpacked**
   folder `C:\xampp\htdocs\Client_Reach_ai\extension`.
   Jika sudah terpasang versi lama, klik **Reload** agar memakai versi 1.6.0.
2. Muat ulang tab cliento dan tab Google Maps (`www.google.com/maps` atau `www.google.co.id/maps`).
3. Cari jenis bisnis dan wilayah yang diinginkan, misalnya `klinik Magelang`.
4. Atur batas 1–100 hasil per proses (default 30), pastikan **Kirim otomatis ke tab cliento**
   aktif jika ingin sinkron instan, lalu klik **Mulai scraping**.
5. Klik **Hentikan** kapan saja, atau **Kirim ke Tab cliento** / **Unduh rekap JSON** untuk impor manual.

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
