---
name: professional-app-design
description: Panduan mendesain UI/UX aplikasi (mobile React Native/Expo, web dashboard, admin panel, POS) dengan standar profesional — bukan cuma "cantik" tapi juga konsisten secara sistem (design tokens, komponen, information architecture). WAJIB dipakai setiap kali user diminta mendesain, merapikan, atau me-restyle tampilan aplikasi, dashboard, POS, admin panel, atau layar mobile app — bahkan jika user cuma bilang "bikinin UI-nya", "tampilannya kurang niat", "desainnya masih berantakan", atau minta "professional look". Juga trigger saat user menyebut nama produk yang sedang dikerjakan (mis. OrbitPOS, RIDO Control System, aplikasi keuangan pribadi) dan minta perbaikan visual/UX-nya.
---

# Professional App Design

Berperan sebagai product designer senior yang biasa mendesain aplikasi internal/operasional (POS, dashboard, admin tools) yang dipakai orang tiap hari untuk kerja — bukan landing page marketing. Prioritas: jelas, cepat dipakai, tidak bikin capek mata setelah 8 jam, dan terasa "niat" — bukan template generik dari komponen UI library yang ditempel asal.

Skill ini beda fokus dari `frontend-design` (yang lebih ke web/marketing page dengan hero & storytelling). Skill ini fokus ke **aplikasi fungsional**: layar berulang, data padat, banyak state (loading/empty/error), dan dipakai oleh operator/staff, bukan pengunjung sekali klik.

## 1. Pahami dulu siapa pemakainya dan apa tugasnya

Sebelum mendesain, pastikan tahu (kalau belum jelas dari brief, tanyakan singkat atau buat asumsi eksplisit):
- Siapa yang pakai? (kasir vs owner/SPV vs kitchen staff — beda kebutuhan info)
- Device apa? (HP kasir landscape/portrait? Tablet? Laptop untuk dashboard SPV?)
- Tugas paling sering dilakukan di layar ini apa? Itu yang harus paling mudah dan cepat dijangkau, bukan ditumpuk sama fitur sekunder.
- Kondisi pakainya gimana? (POS dipakai buru-buru saat jam sibuk restoran → tombol besar, minim langkah, toleran salah pencet rendah)

Aplikasi operasional dinilai dari kecepatan menyelesaikan tugas berulang, bukan dari kesan pertama. Desain untuk pemakaian ke-500, bukan cuma screenshot pertama.

## 2. Bangun design token dulu, baru komponen

Jangan asal pilih warna/font per layar. Tetapkan sistem kecil di awal supaya semua layar terasa satu keluarga:

- **Warna**: 1 primary (aksi utama), 1 neutral scale (background, border, teks — biasanya 5-7 tingkat abu/slate), 1-2 semantic (success/warning/danger — WAJIB ada untuk app operasional: status pesanan, stok habis, transaksi gagal, dll). Hindari warna "vibrant demo app" kalau konteksnya serius (uang, payroll, transaksi) — condong ke palet yang lebih tenang dan terpercaya (mis. deep blue/slate/emerald), bukan gradient ungu-pink generik AI.
- **Tipografi**: 1 font untuk UI (system font atau Inter/SF Pro sudah cukup profesional — app operasional tidak butuh display font yang "berkarakter", itu mengganggu keterbacaan angka/tabel). Tetapkan scale jelas: judul layar, judul section, body, caption/label, dan style khusus untuk **angka** (uang, quantity) — biasanya tabular-nums, sedikit lebih besar/bold karena itu yang paling sering dibaca cepat.
- **Spacing**: pakai skala konsisten (4/8/12/16/24/32), jangan angka acak. Ini yang bikin layar "rapi" tanpa harus didesain ulang tiap kali.
- **Radius & elevation**: pilih satu radius standar untuk card/button/input (jangan campur tajam & bulat tanpa alasan), dan 1-2 level shadow saja untuk membedakan layer (card di atas background, modal di atas card).

Kalau app-nya punya identitas existing (mis. terinspirasi myBCA, atau brand restoran Saung Bebek Belvr), turunkan token dari situ — jangan bikin token baru yang lepas dari konteks brand.

## 3. Information architecture: hierarki dulu baru dekorasi

- Layar dengan banyak data (dashboard, laporan, tabel transaksi) butuh **hierarki visual yang jelas**: satu angka/insight paling penting di atas (mis. total omzet hari ini), lalu breakdown di bawahnya. Jangan taruh 10 angka sama besar sama pentingnya — mata pengguna butuh tahu ke mana harus lihat duluan.
- Navigasi app operasional harus **dangkal** (shallow): fitur yang sering dipakai maksimal 1-2 tap/klik dari home, bukan terkubur di menu berlapis. Kalau ada >5 menu utama di bottom nav mobile, pertimbangkan digabung atau pindah ke menu sekunder.
- Untuk layar dengan banyak state (POS order: kosong → diisi → dibayar → selesai), desain **setiap state secara eksplisit**: empty state (ajak aksi, bukan cuma "tidak ada data"), loading (skeleton, bukan spinner generik kalau contentnya terstruktur), error (jelaskan apa yang salah + cara perbaiki, jangan cuma "terjadi kesalahan").
- Tabel/list data padat: gunakan zebra-striping atau border tipis antar baris (bukan shadow tebal), align angka ke kanan, teks ke kiri, sticky header kalau list panjang, dan sediakan filter/sort yang gampang dijangkau — ini yang paling sering diabaikan di app "buatan sendiri" yang jadi berantakan begitu datanya banyak.

## 4. Komponen & interaksi level profesional

- **Tombol**: hierarki jelas — 1 primary action per layar/section (paling menonjol), secondary lebih redup (outline/ghost), destructive (hapus, batal transaksi) pakai warna danger + biasanya perlu konfirmasi kalau aksinya tidak bisa diundo.
- **Form input**: label selalu terlihat (jangan cuma placeholder yang hilang saat diketik), validasi inline dekat field yang error (bukan cuma alert di atas), dan untuk input angka/uang di app finansial — format otomatis (pemisah ribuan) saat mengetik itu detail kecil yang sangat menaikkan kesan "niat".
- **Feedback aksi**: setiap aksi (simpan, hapus, kirim) butuh konfirmasi visual (toast/snackbar singkat), bukan diam saja atau alert modal untuk hal remeh. Reserve modal blocking untuk aksi berisiko/butuh keputusan.
- **Konsistensi bahasa tombol**: nama aksi konsisten dari tombol → hasil. Tombol "Simpan Perubahan" hasilnya toast "Perubahan disimpan", bukan "Data berhasil diupdate" — device dan bahasa harus konsisten sepanjang alur.
- **Motion**: dipakai secukupnya untuk memberi konteks (transisi antar state, feedback tap), bukan hiasan. Untuk app operasional, animasi berlebihan justru terasa lambat dan mengganggu saat dipakai berulang-ulang seharian.

## 5. Yang bikin desain terasa "template AI" — hindari ini

- Card dengan shadow besar + radius besar + gradient random tanpa alasan konten.
- Semua angka penting ditulis ukuran sama, tanpa hierarki.
- Ikon generik (emoji atau icon set default) ditumpuk banyak tanpa makna — pilih 1 icon set konsisten, dan pakai hanya kalau menambah kejelasan, bukan dekorasi.
- Empty state yang cuma tulisan "No data" di tengah layar kosong — beri ilustrasi/CTA kecil yang mengarahkan aksi berikutnya.
- Dashboard yang menumpuk chart berwarna-warni tanpa insight — chart harus menjawab pertanyaan spesifik ("tren omzet 30 hari terakhir naik/turun"), bukan sekadar ada karena "dashboard harus ada chart".

## 6. Proses kerja singkat

1. **Klarifikasi** peran pengguna + tugas utama layar (kalau ambigu, buat asumsi eksplisit dan sebutkan, lanjut jalan).
2. **Token dulu**: tentukan warna, tipografi, spacing dalam beberapa baris singkat sebelum coding/mendesain layar.
3. **Wireframe hierarki** (boleh cuma deskripsi/ASCII singkat): apa yang paling penting di layar ini, urutan baca dari atas ke bawah.
4. **Build** komponen sesuai token, termasuk semua state (loading/empty/error) — jangan cuma happy path.
5. **Self-review** sebelum dikasih ke user: apakah tombol utama jelas, apakah angka penting menonjol, apakah konsisten dengan layar lain di app yang sama, apakah tetap jelas kalau datanya banyak (bukan cuma bagus saat data dummy sedikit).

Kalau task-nya justru web/marketing page (landing page, halaman promosi, undangan), pakai skill `frontend-design`, bukan skill ini — beda tujuan desainnya (storytelling & kesan pertama vs efisiensi pemakaian berulang).

## 7. Standar "top-tier" — bukan cuma kelihatan bagus, tapi dibangun benar

Desainer/developer top tidak berhenti di visual. Ini yang membedakan hasil "kelihatan bagus di screenshot" vs "layak dipakai production":

- **Ikuti platform convention, jangan reinvent tanpa alasan.** Untuk React Native/Expo: rujuk Apple Human Interface Guidelines (iOS) dan Material Design 3 (Android) untuk pola navigasi, gesture, dan komponen native (tab bar, action sheet, pull-to-refresh) — pengguna sudah punya ekspektasi dari OS-nya, jangan bikin pola aneh sendiri kecuali ada alasan kuat. Kalau app harus terasa sama di iOS & Android (umum untuk app internal), pilih satu bahasa desain konsisten (biasanya condong Material karena lebih fleksibel lintas platform) daripada setengah-setengah.
- **Desain sebagai sistem di kode, bukan style per layar.** Token warna/spacing/tipografi harus jadi satu sumber kebenaran di kode (`theme.ts`/`constants/colors.ts`, atau `tailwind.config` kalau pakai NativeWind) yang dipakai ulang, bukan hex code/angka ditulis manual di tiap komponen. Kalau lihat kode dengan warna hardcoded berulang atau magic number spacing di banyak file — itu tanda desain belum "sistem", perbaiki ke token dulu sebelum lanjut nambah layar baru.
- **Komponen reusable, bukan copy-paste layar.** Button, Card, Input, EmptyState, ErrorState harus jadi komponen bersama dengan varian (primary/secondary/danger, size), bukan di-style ulang tiap dipakai. Ini juga yang bikin konsistensi visual terjaga otomatis walau app-nya berkembang jadi banyak layar.
- **Accessibility bukan opsional.** Kontras teks minimal WCAG AA (4.5:1 untuk teks normal), target sentuh minimal ~44x44pt, semua elemen interaktif punya label yang terbaca screen reader (`accessibilityLabel` di RN), dan jangan sampaikan informasi hanya lewat warna (mis. status "gagal" harus ada ikon/teks juga, bukan cuma teks merah — penting buat staff yang buta warna).
- **Performa adalah bagian dari UX, bukan urusan terpisah.** List panjang (riwayat transaksi, daftar menu) pakai `FlatList`/`FlashList` dengan windowing, bukan render semua sekaligus. Image pakai ukuran/format sesuai kebutuhan (jangan load gambar 4K untuk thumbnail). Skeleton loading untuk data yang biasanya lambat (network call), supaya app terasa responsif walau data belum sampai — ini bedanya app yang "terasa cepat" vs yang terasa berat padahal secara visual sama.
- **Uji di kondisi nyata, bukan cuma data dummy rapi.** Cek tampilan saat: teks nama panjang (nama menu/pelanggan kepanjangan), angka besar (omzet jutaan, jangan sampai layout jebol), list kosong, list dengan 1 item, list dengan 200 item, koneksi lambat/offline. Top-tier design justru diuji di edge case ini, bukan di kondisi ideal.
- **Dark mode & orientasi kalau relevan.** Kalau app dipakai di kondisi dapur/lampu redup (mis. kitchen display), pertimbangkan dark mode dari awal sebagai bagian dari sistem token (bukan tempelan belakangan). Untuk POS/kasir, cek juga perilaku di landscape kalau device-nya bisa dirotasi.

Checklist cepat sebelum bilang desain "selesai": token dipakai konsisten dari kode (bukan hardcode) → semua state layar ada (bukan cuma happy path) → kontras & target sentuh aman → sudah dicoba dengan data ekstrem (panjang/kosong/banyak) → konsisten dengan platform convention (iOS/Android) yang dituju.