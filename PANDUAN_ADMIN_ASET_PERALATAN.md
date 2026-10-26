# 📘 BUKU PANDUAN OPERASIONAL ADMIN ASET LAPANGAN
# Pengelolaan & Pelacakan Inventaris Alat (MTERP)

> **Khusus untuk:** Admin Aset Lapangan, Petugas Gudang & Logistik, Site Supervisor, dan Mandor Lapangan  
> **Tujuan:** Panduan langkah demi langkah penggunaan fitur Peralatan tanpa istilah teknis pemograman. Siap pakai untuk operasional harian di proyek konstruksi.

---

## 📋 DAFTAR ISI

1. [Peran Penting Anda Sebagai Admin Aset Lapangan](#1-peran-penting-anda-sebagai-admin-aset-lapangan)
2. [Cara Masuk ke Menu Peralatan](#2-cara-masuk-ke-menu-peralatan)
3. [Mengenal Bagian-Bagian Layar Utama](#3-mengenal-bagian-bagian-layar-utama)
4. [Menyiapkan Gudang & Pos Penyimpanan Baru](#4-menyiapkan-gudang--pos-penyimpanan-baru)
5. [Mendaftarkan Alat Baru ke Sistem](#5-mendaftarkan-alat-baru-ke-sistem)
   - [5.1 Input Satu per Satu (Manual)](#51-input-satu-per-satu-manual)
   - [5.2 Input Sekaligus Banyak Menggunakan File Excel](#52-input-sekaligus-banyak-menggunakan-file-excel)
   - [5.3 Mengunduh Laporan ke Excel (.xlsx)](#53-mengunduh-laporan-ke-excel-xlsx)
6. [Mengatur Tampilan Daftar Alat di Lapangan](#6-mengatur-tampilan-daftar-alat-di-lapangan)
   - [6.1 Mengelompokkan Data (Grup)](#61-mengelompokkan-data-grup)
   - [6.2 Memilih Kerapatan Baris Tabel](#62-memilih-kerapatan-baris-tabel)
   - [6.3 Mode Tabel vs Mode Kartu (Khusus Layar HP)](#63-mode-tabel-vs-mode-kartu-khusus-layar-hp)
   - [6.4 Pencarian dan Tombol Filter Cepat](#64-pencarian-dan-tombol-filter-cepat)
7. [Aksi Massal (Memproses Banyak Alat Sekaligus)](#7-aksi-massal-memproses-banyak-alat-sekaligus)
8. [Panduan Gerakkan & Pindahkan Alat (8 Jenis Pergerakan)](#8-panduan-gerakkan--pindahkan-alat-8-jenis-pergerakan)
   - [8.1 Kapan Menggunakan Masing-Masing Jenis Aksi?](#81-kapan-menggunakan-masing-masing-jenis-aksi)
   - [8.2 Langkah-Langkah Mengisi Form Pemindahan](#82-langkah-langkah-mengisi-form-pemindahan)
9. [Cara Mengambil Foto Bukti dengan Watermark GPS](#9-cara-mengambil-foto-bukti-dengan-watermark-gps)
10. [Melihat Peta Lokasi & Geofence Gudang](#10-melihat-peta-lokasi--geofence-gudang)
11. [Tab "Alat Saya" (Khusus Peminjaman Pribadi)](#11-tab-alat-saya-khusus-peminjaman-pribadi)
12. [Melihat Riwayat & Foto Bukti Masa Lalu (Audit Lapangan)](#12-melihat-riwayat--foto-bukti-masa-lalu-audit-lapangan)
13. [Solusi Masalah Lapangan yang Sering Terjadi](#13-solusi-masalah-lapangan-yang-sering-terjadi)

---

## 1. Peran Penting Anda Sebagai Admin Aset Lapangan

Sebagai Admin Aset atau Petugas Logistik Lapangan, Anda adalah **benteng pertahanan utama perusahaan** agar barang-barang berharga tidak hilang, tidak tertukar, dan tidak rusak tanpa kejelasan:
- **Mencegah Alat Hilang Tanpa Jejak:** Setiap kali alat berpindah tangan, harus ada catatan siapa yang membawa dan bukti fotonya.
- **Menghindari Tuduhan Sepihak:** Bukti foto berstempel waktu dan koordinat GPS membuktikan bahwa alat diserahkan dalam kondisi baik saat keluar dari gudang.
- **Mempercepat Kerja Tim:** Mandor dan surveyor tidak perlu bingung mencari alat, karena sistem mencatat letak gudang dan kode raknya secara rinci.
- **Laporan Otomatis untuk Manajemen:** Direktur dan Site Manager dapat memantau kesehatan alat langsung dari kantor pusat tanpa perlu bolak-balik menelpon lapangan.

---

## 2. Cara Masuk ke Menu Peralatan

### Lewat Komputer / Laptop Kantor:
1. Buka browser (Google Chrome atau Microsoft Edge) dan masuk ke MTERP.
2. Perhatikan menu di bilah sebelah kiri (**Sidebar**).
3. Cari kelompok **"LOGISTIK & ASET"**.
4. Klik menu berikon kunci pas: **"Peralatan"**.

### Lewat HP Lapangan / Smartphone:
1. Buka MTERP di browser HP Anda.
2. Tekan tombol menu tiga garis (garis burger) di pojok kiri atas layar.
3. Gulir ke bawah ke bagian **"LOGISTIK & ASET"** lalu pilih **"Peralatan"**.

---

## 3. Mengenal Bagian-Bagian Layar Utama

Saat halaman Peralatan terbuka, Anda akan melihat beberapa bagian utama:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [Inventaris Alat]                                [Kelola Gudang] [Impor] [Export] [+ Tambah]│
├──────────────────────────────────────────────────────────────────────────────────┤
│  (•) Semua Inventaris     (•) Alat Saya (Peminjaman)     (•) Peta Lokasi & Geofence │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [Total Alat: 45]     [Tersedia: 30]     [Digunakan: 12]     [Perlu Perhatian: 3]│
├──────────────────────────────────────────────────────────────────────────────────┤
│  [Cari alat...] 🔍    Kategori: [Semua ▼]  Grup: [Gudang ▼]   [Buka] [Tutup]     │
│  [Semua] [Tersedia] [Digunakan] [Servis] [Rusak]      [Tabel | Kartu] [Rapat...] │
├──────────────────────────────────────────────────────────────────────────────────┤
│  DAFTAR TABEL INVENTARIS ALAT LENGKAP                                            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. **Tombol Aksi Kanan Atas:**
   - **Kelola Gudang:** Mengatur daftar gudang, bengkel, dan pos penyimpanan.
   - **Impor Excel:** Memasukkan puluhan atau ratusan alat sekaligus dari file Excel.
   - **Export .xlsx:** Mengunduh seluruh daftar alat saat ini ke format Excel untuk laporan.
   - **+ Tambah Alat:** Mendaftarkan satu alat baru secara manual.
2. **3 Pilihan Tab Tampilan:**
   - **Semua Inventaris:** Menampilkan seluruh alat milik perusahaan di semua proyek.
   - **Alat Saya (Peminjaman):** Menampilkan alat yang saat ini sedang Anda bawa/tanggung jawabkan sendiri.
   - **Peta Lokasi & Geofence:** Menampilkan peta satelit/jalan dan lokasi gudang-gudang proyek.
3. **Kartu Ringkasan (KPI):**
   - **Total Alat:** Jumlah jenis alat yang terdaftar.
   - **Tersedia:** Alat yang siap dipinjamkan dan berada di gudang.
   - **Digunakan:** Alat yang sedang aktif dipakai di proyek/pekerja.
   - **Perlu Perhatian:** Alat yang sedang rusak atau butuh perbaikan di bengkel.
4. **Diagram Donat:** Menampilkan porsi visual kondisi alat (Hijau = Baik, Kuning = Servis, Merah = Rusak).

---

## 4. Menyiapkan Gudang & Pos Penyimpanan Baru

Sebelum Anda mengatur alat, pastikan tempat penyimpanannya sudah terdaftar di sistem.

### Kapan Harus Menambah Gudang?
- Saat proyek baru dimulai (misal: *Gudang Site Smelter Pomalaa*).
- Saat menyewa workshop atau bengkel rekanan di luar kota.
- Saat ada pos/kontainer penyimpanan khusus di lapangan.

### Langkah-langkah Menambah Gudang:
1. Klik tombol **"Kelola Gudang"** di pojok kanan atas.
2. Jendela daftar gudang akan muncul. Klik tombol **"+ Tambah Gudang / Fasilitas"**.
3. Isi data gudang:
   - **Nama Gudang:** Tulis nama yang mudah dikenali (Contoh: `Gudang Logistik Soreang`, `Workshop Fabrikasi Balaraja`).
   - **Tipe Fasilitas:**
     - **Head Office** (Biru Muda): Khusus untuk kantor pusat.
     - **Gudang Proyek** (Biru Tua): Tempat penyimpanan di area proyek.
     - **Workshop** (Kuning/Oranye): Tempat reparasi dan bengkel kerja.
   - **Alamat:** Tulis alamat jalan atau area proyek.
   - **Titik Koordinat (Latitude & Longitude):** Masukkan titik GPS lokasi gudang. *(Tips: Anda bisa melihat koordinat ini langsung dari Google Maps di HP dengan menekan lama titik lokasi gudang).*
   - **Jadikan Gudang Utama:** Aktifkan tombol ini jika gudang ini merupakan tempat penampungan pusat perusahaan.
4. Klik **"Simpan Gudang"**. Gudang baru langsung terdaftar dan muncul di peta.

---

## 5. Mendaftarkan Alat Baru ke Sistem

### 5.1 Input Satu per Satu (Manual)
Gunakan cara ini jika hanya ada 1 atau 2 alat baru yang baru dibeli atau tiba di proyek.

1. Klik tombol **"+ Tambah Alat"** di pojok kanan atas.
2. Isi formulir pendaftaran:
   - **Nama Alat:** Tuliskan nama lengkap beserta merk atau serinya.  
     *(Contoh yang baik: `Total Station Leica TS07`, `Jack Hammer Listrik Bosch GSH 500`). Hindari menulis hanya "Alat Survey" atau "Mesin".*
   - **Kategori:** Pilih atau ketik jenis alat (misal: *Surveying*, *Alat Berat*, *Power Tools*, *Alat Ukur*).
   - **Stok:** Masukkan angka jumlah fisik barang (misal: `1`, `5`, `10`).
   - **Satuan:** Pilih satuan barang (biasanya `unit`, `set`, atau `pcs`).
   - **Kondisi:** Pilih status fisik barang saat diterima:
     - `Baik` (Alat normal siap kerja)
     - `Maintenance` (Alat butuh servis/kalibrasi)
     - `Rusak` (Alat tidak berfungsi)
   - **Gudang:** Pilih gudang tempat alat tersebut disimpan sekarang.
   - **Bin / Rak:** Tuliskan nomor rak atau kotak tempat alat diletakkan (Contoh: `RAK-A1-03`). Hal ini sangat penting agar orang lain bisa langsung menemukan alat tanpa bertanya.
   - **Foto Alat:** Klik kotak foto untuk memotret atau memilih foto alat dari galeri HP/laptop.
   - **Catatan / Nomor Seri:** Tuliskan nomor seri mesin (Serial Number/SN) atau tanggal kadaluarsa sertifikat kalibrasi.
3. Klik tombol **"Simpan Alat"**.

---

### 5.2 Input Sekaligus Banyak Menggunakan File Excel
Gunakan cara ini jika Anda baru pertama kali merapikan inventaris atau menerima pengiriman massal puluhan alat sekaligus.

1. Klik tombol **"Impor Excel"** di toolbar atas.
2. Klik tombol hijau: **"Unduh Template Excel (.xlsx)"**. File contoh akan terunduh ke komputer Anda.
3. Buka file Excel tersebut, lalu isi baris-barisnya:
   - Kolom **Nama Alat**: Wajib diisi.
   - Kolom **Kategori**: Jenis alat.
   - Kolom **Stok**: Isi angka (contoh: `2`).
   - Kolom **Satuan**: unit / set / pcs.
   - Kolom **Kondisi**: Tulis persis `Baik`, `Maintenance`, atau `Rusak`.
   - Kolom **Nama Gudang**: Harus sama persis dengan nama gudang yang sudah Anda buat di menu Kelola Gudang.
   - Kolom **Bin / Rak**: Posisi rak (contoh: `RAK-B2`).
   - Kolom **Catatan**: Keterangan tambahan (nomor seri, kondisi baterai, dll).
4. Simpan file Excel Anda.
5. Kembali ke jendela MTERP, lalu seret (drag & drop) file Excel Anda ke dalam kotak upload atau klik **"Pilih File"**.
6. **Periksa Pratinjau (Preview) Interaktif:**
   - Sistem akan menampilkan tabel sementara.
   - Jika ada kolom yang salah ketik (misal nama gudang tidak cocok), baris tersebut akan berwarna merah dengan tanda peringatan.
   - Anda bisa langsung memperbaiki kesalahan di layar sebelum disimpan.
7. Klik tombol biru: **"Konfirmasi & Impor Data"**. Seluruh alat akan masuk ke database secara otomatis.

---

### 5.3 Mengunduh Laporan ke Excel (.xlsx)
Jika diminta oleh Site Manager, Project Manager, atau Auditor untuk menyerahkan daftar alat:
1. Pastikan Anda sudah memfilter data yang ingin diekspor (misal khusus Gudang Proyek A atau seluruh alat).
2. Klik tombol **"Export .xlsx"** di pojok kanan atas.
3. File Excel rapi yang berisi seluruh data alat, letak rak, kondisi, dan penanggung jawab langsung terunduh ke perangkat Anda.

---

## 6. Mengatur Tampilan Daftar Alat di Lapangan

Di lapangan, Anda mungkin harus mencari alat tertentu di antara ratusan barang dengan cepat. MTERP menyediakan fitur navigasi praktis:

### 6.1 Mengelompokkan Data (Grup)
Gunakan dropdown **Grup** untuk menyusun tampilan:
- **Grup: Lokasi / Gudang:** Sangat disarankan! Seluruh alat akan dikelompokkan berdasarkan tempat penyimpanannya. Anda bisa melihat langsung: Gudang A ada 20 alat, Gudang B ada 15 alat.
- **Grup: Kategori:** Alat dikelompokkan menurut fungsinya (Alat Ukur, Alat Cor, Perkakas Listrik).
- **Grup: Status:** Dikelompokkan berdasarkan kondisi (Baik, Servis, Rusak).
- **Grup: Proyek:** Dikelompokkan berdasarkan nama proyek yang sedang meminjam alat tersebut.

> **Tips Lapangan:**  
> Pada setiap baris kelompok (header grup), Anda bisa melihat jumlah alat dan total stok secara langsung. Gunakan tombol **"Buka Semua"** untuk membuka semua rincian alat atau **"Tutup Semua"** untuk melipatnya agar layar terlihat rapi.

---

### 6.2 Memilih Kerapatan Baris Tabel
Di sebelah kanan tombol Tabel, terdapat pilihan kerapatan baris:
- **Rapat:** Baris tipis dan padat. Cocok saat Anda bekerja di laptop monitor lebar dan ingin melihat 30-50 alat sekaligus di satu layar tanpa sering menggulir (*scroll*).
- **Standar:** Jarak baris sedang. Sangat nyaman untuk penggunaan harian.
- **Lapang:** Baris lebih lebar dengan tombol yang besar. Cocok jika Anda menggunakan tablet dengan jari tangan.

---

### 6.3 Mode Tabel vs Mode Kartu (Khusus Layar HP)
- Di layar laptop: Tampilan otomatis berupa **Tabel Lengkap** dengan kolom yang dapat dikunci (*sticky*).
- Di layar HP: Sistem secara cerdas akan langsung mengubah tampilan menjadi **Mode Kartu**.
  - Mengapa? Agar Anda tidak perlu menggeser-geser layar ke kanan dan ke kiri secara merepotkan.
  - Setiap kartu alat di HP menampilkan Nama Alat, Kondisi, Letak Gudang, Stok, serta tombol aksi cepat yang mudah ditekan jempol.

---

### 6.4 Pencarian dan Tombol Filter Cepat
- **Kotak Cari Alat:** Ketik nama alat, nomor seri, atau merk (contoh: ketik `Leica` atau `Bosch`). Tabel langsung menyaring dalam sekejap tanpa perlu menekan tombol Enter.
- **Pill Filter Status:** Klik tombol filter cepat:
  - `Semua`: Menampilkan seluruh alat.
  - `Tersedia`: Khusus alat yang menganggur di gudang dan siap digunakan.
  - `Digunakan`: Khusus alat yang sedang dibawa pekerja atau berada di proyek.
  - `Servis`: Alat yang sedang dalam perbaikan.
  - `Rusak`: Alat yang afkir atau butuh penggantian suku cadang.

---

## 7. Aksi Massal (Memproses Banyak Alat Sekaligus)

Bayangkan sebuah proyek telah selesai, dan ada **15 alat sekaligus** yang harus dipindahkan kembali ke Gudang Pusat. Anda tidak perlu memindahkannya satu per satu!

```
Langkah Aksi Massal:
1. Centang kotak [✓] pada alat-alat yang ingin diproses bersamaan.
   (Atau klik kotak centang di paling atas untuk "Pilih Semua").
   
2. Bilah Melayang Berwarna Biru akan muncul di bagian bawah layar:
   ┌───────────────────────────────────────────────────────────────┐
   │ 15 Alat Terpilih │ [Pindahkan Gudang] [Ubah Status] [Hapus] │ ✕ │
   └───────────────────────────────────────────────────────────────┘

3. Pilih aksi yang diinginkan:
   - [Pindahkan Gudang]: Pilih gudang tujuan baru, lalu simpan. 15 alat langsung pindah lokasi bersamaan.
   - [Ubah Status]: Ubah kondisi 15 alat tersebut sekaligus (misal semuanya diubah menjadi "Baik").
   - [Hapus Massal]: Menghapus alat yang sudah tidak dipakai (dengan konfirmasi keamanan).
```

---

## 8. Panduan Gerakkan & Pindahkan Alat (8 Jenis Pergerakan)

Setiap kali fisik alat berpindah tangan, Anda **WAJIB** menekan ikon **Kamera** (`Gerakkan / Pindahkan Alat`) yang ada di baris alat tersebut.

### 8.1 Kapan Menggunakan Masing-Masing Jenis Aksi?

| Jenis Aksi | Kapan Harus Memilih Ini? | Contoh Nyata di Proyek |
| :--- | :--- | :--- |
| **1. Check-out (Serahkan ke Teknisi / Proyek)** | Alat keluar dari gudang untuk dipinjamkan ke pekerja atau dikirim ke area proyek. | Surveyor mengambil Theodolite untuk mengukur patok di Zona 2. |
| **2. Pengembalian ke Gudang (Return)** | Pekerja mengembalikan alat yang sebelumnya dipinjam kembali ke gudang penyimpanan. | Mandor mengembalikan mesin potong besi ke gudang setelah jam kerja selesai. |
| **3. Oper Alih Lapangan (Hand-Over)** | Alat berpindah tangan antar dua pekerja langsung di lapangan tanpa dikembalikan ke gudang terlebih dahulu. | Tukang Las A menyerahkan trafo las ke Tukang Las B di lantai 4. |
| **4. Transfer Antar Gudang** | Alat dikirim dari satu gudang proyek ke gudang proyek yang lain. | Mengirim Scaffolding dari Gudang Pusat di Soreang ke Site di Karawang. |
| **5. Relokasi Bin / Rak** | Alat tetap berada di gudang yang sama, tetapi dipindahkan posisi raknya agar lebih rapi. | Memindahkan gerinda dari Rak Kayu A ke Rak Besi C-01. |
| **6. Kirim Servis / Perbaikan** | Alat rusak atau tidak akurat dan harus dikirim ke bengkel perbaikan atau pihak ketiga. | Genset macet dikirim ke bengkel dinamo rekanan. |
| **7. Selesai Servis (Siap Pakai)** | Alat yang tadinya di bengkel sudah selesai diperbaiki dan siap digunakan kembali. | Genset kembali dari bengkel dalam kondisi normal dan masuk ke gudang lagi. |
| **8. Ubah Status Fisik** | Mengubah catatan kondisi alat setelah dilakukan inspeksi rutin mingguan. | Bor listrik kabelnya terkelupas, diubah statusnya dari "Baik" menjadi "Maintenance". |

---

### 8.2 Langkah-Langkah Mengisi Form Pemindahan
1. Cari alat yang bersangkutan di daftar tabel.
2. Klik tombol berikon **Kamera** (`Gerakkan / Pindahkan Alat`) di kolom paling kanan.
3. Jendela **"Formulir Pergerakan Alat"** akan terbuka:
   - **Pilih Jenis Aksi:** Pilih salah satu dari 8 aksi di atas sesuai kenyataan lapangan.
   - **Jumlah (Qty):** Tentukan berapa banyak unit yang dipindahkan (bisa 1 atau sebagian stok).
   - **Kondisi Terkini:** Pastikan kondisi fisik barang dipilih dengan jujur (`Baik`, `Maintenance`, atau `Rusak`).
   - **Tentukan Tujuan:**
     - Jika *Check-Out*: Pilih nama pekerja penerima dan/atau nama proyeknya.
     - Jika *Return* atau *Transfer*: Pilih nama gudang tujuan dan ketik kode rak barunya.
   - **Catatan:** Berikan catatan singkat (misal: *"Dipinjam untuk pengecoran balok zona utara"*).
4. Klik tombol biru: **"Ambil Foto Bukti (Watermark GPS)"**. Jendela kamera akan terbuka.
5. Ambil foto alat (lihat Bab 9 untuk panduan pengambilan foto).
6. Setelah foto selesai diambil, klik tombol **"Konfirmasi & Simpan Pergerakan"**.

---

## 9. Cara Mengambil Foto Bukti dengan Watermark GPS

Fitur ini adalah keunggulan utama MTERP. Anda tidak perlu repot mengetik keterangan pada foto, karena sistem akan secara otomatis **mencetak stempel digital permanen langsung di atas foto**.

```
Contoh Hasil Foto Ber-Watermark MTERP:
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                     [ FOTO FISIK ALAT NYATA ]                    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ ■ MTERP ASSET MOVEMENT EVIDENCE                                  │
│ Alat      : Total Station Leica TS07                             │
│ Aksi      : Pengembalian ke Gudang (Return)                      │
│ Lokasi    : Gudang Logistik Soreang (Rak: B-02)                  │
│ Petugas   : Ahmad Dani (Admin Aset Lapangan)                     │
│ Koordinat : -7.175077, 107.570899 (Akurasi: ±4 meter)            │
│ Waktu     : 26 Oktober 2026, Pukul 15:30:12 WIB                  │
│ Status    : BUKTI DIGITAL TERVERIFIKASI                          │
└──────────────────────────────────────────────────────────────────┘
```

### Langkah Mengambil Foto yang Benar:
1. Saat jendela kamera terbuka, browser HP Anda akan meminta izin: **"Izinkan MTERP mengakses kamera dan lokasi Anda?"** -> Klik **IZINKAN (ALLOW)**.
2. Perhatikan indikator sinyal GPS di layar:
   - **Lingkaran Hijau:** Sinyal GPS sangat akurat (akurasi di bawah 15 meter). Sangat baik!
   - **Lingkaran Kuning:** Sinyal GPS sedang (akurasi 15 - 50 meter). Masih bisa diterima.
   - **Lingkaran Merah:** Sinyal GPS lemah atau belum terkunci. Tunggu 3-5 detik di tempat terbuka.
3. Arahkan kamera ke alat secara jelas. Pastikan merk, tipe, atau fisik barang terlihat terang.
4. Tekan tombol bulat **"Ambil Foto"**.
5. Sistem akan membakar stempel watermark secara otomatis.
6. Periksa pratinjau foto. Jika foto buram atau goyang, klik **"Foto Ulang"**. Jika sudah jelas, klik **"Gunakan Foto Ini"**.

> **PENTING UNTUK ADMIN:**  
> Foto ini tidak bisa dipalsukan karena mengambil koordinat satelit GPS dan jam server secara langsung. Jangan pernah memotret layar laptop lain atau memotret foto lama, karena hal tersebut dapat terdeteksi saat audit proyek.

---

## 10. Melihat Peta Lokasi & Geofence Gudang

Untuk melihat gambaran besar sebaran seluruh aset perusahaan di berbagai pulau atau kota:
1. Klik tab **"Peta Lokasi & Geofence"** di bagian atas halaman Peralatan.
2. Peta interaktif akan terbuka di layar Anda:
   - **Pin Biru Muda bertuliskan [HQ]:** Kantor Pusat perusahaan.
   - **Pin Biru Tua bertuliskan [GUD]:** Gudang Proyek di lapangan.
   - **Pin Kuning/Oranye bertuliskan [WS]:** Bengkel / Workshop perbaikan.
3. **Mengganti Jenis Peta:**
   - Di pojok kanan atas peta, terdapat kotak pemilih lapisan (*Layer Switcher*).
   - Pilih **"Peta Jalan (OSM)"** jika ingin melihat peta rute jalan dan nama daerah.
   - Pilih **"Satelit (Esri)"** jika ingin melihat foto udara satelit asli untuk melihat kondisi lapangan proyek secara nyata.
4. **Melihat Rincian Alat di Gudang Tertentu:**
   - Klik salah satu pin gudang di peta.
   - Jendela kecil (popup) akan muncul menampilkan: Nama Gudang, Alamat, Total Alat, dan rincian kondisinya (Berapa yang Baik, Servis, atau Rusak).
   - Klik tombol **"Tampilkan Alat di Gudang Ini"** di dalam popup tersebut. Sistem akan otomatis membawa Anda kembali ke daftar tabel yang sudah disaring khusus untuk alat di gudang tersebut saja!

---

## 11. Tab "Alat Saya" (Khusus Peminjaman Pribadi)

Sebagai staf lapangan, Anda mungkin juga memegang alat kerja pribadi (misal: meteran laser, kamera inspeksi, atau laptop lapangan).

1. Klik tab **"Alat Saya (Peminjaman)"**.
2. Di sini hanya akan muncul alat yang status tanggung jawabnya tercatat atas nama akun login Anda sendiri.
3. Anda bisa memantau tanggal berapa Anda mengambil alat tersebut.
4. Jika pekerjaan Anda sudah selesai, Anda bisa langsung menekan tombol **"Kembalikan Alat"** dari tab ini untuk memulangkan alat ke gudang resmi.

---

## 12. Melihat Riwayat & Foto Bukti Masa Lalu (Audit Lapangan)

Jika Site Manager atau Auditor bertanya:  
*"Siapa yang membawa Genset 5 KVA minggu lalu? Mengapa saat kembali kondisinya rusak?"*

Anda bisa membuktikannya dalam hitungan detik:
1. Cari alat tersebut di tabel daftar alat.
2. Klik tombol berikon **Jam / Riwayat** (`Lihat Riwayat Pergerakan & Bukti Foto`) di kolom paling kanan.
3. Bilah laci riwayat (**Drawer**) akan meluncur keluar dari sisi kanan layar.
4. Di sini tercatat seluruh kronologi perjalanan alat sejak pertama kali dibeli:
   - Tanggal dan jam pergerakan.
   - Jenis aksi (Check-Out, Return, dll).
   - Siapa petugas yang memproses.
   - Siapa pekerja yang menerima.
   - Foto bukti fisik saat kejadian berlangsung.
5. Klik pada foto untuk memperbesarnya ke ukuran layar penuh (*Full Screen Zoom*). Anda bisa melihat stempel watermark untuk membuktikan kondisi alat saat diserahkan.

---

## 13. Solusi Masalah Lapangan yang Sering Terjadi

### Masalah 1: Kamera HP Tidak Mau Terbuka atau Layar Hitam
- **Penyebab:** Izin akses kamera pada browser HP Anda tidak sengaja dimatikan atau terblokir.
- **Solusi:**
  1. Lihat bilah alamat website di bagian atas browser HP Anda (tempat tulisan `http://...`).
  2. Tekan ikon gembok kecil atau ikon setelan di sebelah kiri alamat web tersebut.
  3. Cari menu **Izin Situs (Site Permissions)** -> cari **Kamera** -> ubah dari *Blokir* menjadi **Izinkan (Allow)**.
  4. Muat ulang (*refresh*) halaman MTERP Anda.

---

### Masalah 2: Sinyal GPS Terus Berputar ("Mendeteksi Lokasi...")
- **Penyebab:** Anda sedang berada di dalam gedung bertingkat, di dalam kontainer besi tebal, atau di ruang bawah tanah (*basement*) yang tidak terjangkau satelit GPS.
- **Solusi:**
  1. Buka pintu atau melangkah beberapa meter ke area terbuka dekat jendela.
  2. Pastikan fitur **Lokasi / GPS** pada HP Anda sudah dalam posisi aktif (ON).
  3. Jika Anda memiliki hak akses khusus Admin Aset / Manager, Anda bisa mencentang kotak **"Gunakan Koordinat Manual"** untuk melanjutkan proses jika sinyal satelit benar-benar terhalang.

---

### Masalah 3: Ada Alat Rusak tapi di Sistem Masih Tertulis "Baik"
- **Solusi:**
  1. Cari alat tersebut di tabel.
  2. Klik tombol berikon **Kamera** (`Gerakkan / Pindahkan Alat`).
  3. Pilih jenis pergerakan: **"Ubah Status Fisik"** atau **"Kirim Servis / Perbaikan"**.
  4. Ubah kondisi menjadi **Rusak** atau **Maintenance**.
  5. Potret bagian alat yang mengalami kerusakan sebagai bukti laporan.
  6. Simpan. Angka stok siap pakai di dasbor kantor pusat akan langsung berkurang secara otomatis sehingga tidak ada orang lain yang salah meminjam alat rusak tersebut.

---

### Masalah 4: Salah Memilih Nama Penerima saat Check-Out
- **Solusi:**
  - Segera lakukan pergerakan baru dengan memilih jenis aksi **"Oper Alih Lapangan (Hand-Over)"**.
  - Masukkan nama penerima yang sebenarnya dan berikan catatan singkat pada kolom keterangan (*"Koreksi penerima"*).
  - Sistem akan memperbarui pemegang sah saat ini tanpa menghapus jejak pencatatan sebelumnya.

---

*Buku panduan ini disusun oleh Tim Logistik & Operasional MTERP untuk memastikan seluruh aset proyek terlindungi dan tercatat dengan tertib. Simpan panduan ini di perangkat lapangan Anda untuk referensi harian.*
