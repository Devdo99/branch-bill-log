# NotaKu - Progres & Rencana Update Aplikasi

Dokumen ini mencatat status pengembangan saat ini, arsitektur sistem, serta rencana fitur baru ke depannya untuk aplikasi **NotaKu (Branch Bill Log)**.

---

## 📌 Ringkasan Proyek

**NotaKu** adalah aplikasi manajemen nota tagihan operasional supplier, pembayaran, dan pencatatan omset harian yang dirancang untuk bisnis dengan model **multi-cabang**. 

Aplikasi ini membagi pengguna ke dalam 3 peran (role) utama:
1. **Manager (Owner)**: Pemilik bisnis yang memegang kendali penuh atas konfigurasi sistem, cabang, admin, kasir, supplier, omset, dan laporan keuangan keseluruhan.
2. **Admin**: Staf manajerial yang ditugaskan ke cabang-cabang tertentu dengan izin akses (permission) yang dapat dikonfigurasi secara dinamis oleh Manager.
3. **Kasir**: Operator lapangan di cabang yang bertugas mencatat pengeluaran operasional (nota supplier) dan melampirkan foto bukti nota.

---

## 🛠️ Tech Stack (Teknologi)

- **Frontend**: React (v18) + TypeScript + Vite
- **Styling**: Tailwind CSS + Shadcn UI + Lucide React (Icons)
- **State & Data Fetching**: TanStack React Query (v5) + React Context
- **Routing**: React Router DOM (v6)
- **Backend / Database**: Supabase (Database PostgreSQL, Auth, Storage untuk foto nota, Edge Functions)
- **Validasi**: Zod + React Hook Form
- **Utilitas**: html2canvas, jspdf (untuk ekspor laporan)

---

## 📂 Struktur Database (Supabase Schema)

Aplikasi ini menggunakan beberapa tabel utama di PostgreSQL (Supabase):

1. **`profiles`**: Menyimpan data dasar profil pengguna (ID, nama lengkap).
2. **`user_roles`**: Mengaitkan user dengan perannya (`manager`, `admin`, `kasir`).
3. **`branches`**: Daftar cabang yang dibuat oleh Manager beserta `pin_hash` untuk keamanan transaksi.
4. **`branch_users`**: Menghubungkan kasir dengan cabang tempat ia bertugas.
5. **`admin_permissions`**: Mengatur hak akses admin untuk cabang tertentu (toggles: `manage_invoices`, `mark_paid`, `manage_suppliers`, `manage_revenues`, `manage_cashiers`, `view_reports`).
6. **`suppliers`**: Database supplier per cabang, lengkap dengan data bank untuk transfer pembayaran.
7. **`invoices`**: Data nota tagihan (tanggal, supplier, nama barang, qty, harga satuan, total, status `BELUM`/`SUDAH` dibayar, foto bukti, pembuat, pembayar).
8. **`daily_revenues`**: Pencatatan omset/pendapatan harian per cabang.
9. **`activity_logs`**: Log aktivitas transaksi/nota untuk kebutuhan audit.

---

## ✅ Fitur yang Sudah Selesai (Current Features)

### 🔐 Autentikasi & Pengaturan Awal
- [x] Login dan registrasi menggunakan Supabase Auth.
- [x] Deteksi otomatis jika user baru belum memiliki role, lalu diarahkan ke halaman **Setup Manager** (`/manager/setup`) untuk menginisialisasi bisnis pertamanya.
- [x] Sistem proteksi halaman berdasarkan hak akses (`RequireAuth`).

### 🏢 Dashboard Manager
- [x] **Manajemen Cabang**: Tambah cabang baru beserta pengaturan PIN unik.
- [x] **Dashboard Konsolidasi**: Melihat total tagihan (belum/sudah dibayar) secara real-time untuk cabang yang dipilih.
- [x] **Manajemen Admin**: Mengundang admin dan mengatur izin cabang secara detail (misal: Admin A hanya boleh melihat laporan di Cabang X, tetapi tidak boleh membayar nota).
- [x] **Manajemen Kasir**: Menugaskan kasir ke cabang tertentu.
- [x] **Manajemen Supplier**: Menyimpan database supplier cabang lengkap dengan nomor rekening bank.
- [x] **Pencatatan & Analisis Omset**: Grafik visual mingguan/bulanan dari pendapatan harian.
- [x] **Laporan Keuangan & Arus Kas**: Menyajikan analisis arus kas bersih (net cash flow), diagram area komparasi pemasukan vs pengeluaran harian, ikhtisar laba rugi cabang, serta rincian data rekening bank supplier untuk mempermudah transfer pembayaran hutang.
- [x] **Manajemen Nota (Invoices)**: 
  - Filter nota berdasarkan rentang tanggal, status pembayaran, dan pencarian supplier.
  - Pembayaran nota (mengubah status dari BELUM ke SUDAH dibayar, memerlukan verifikasi PIN Cabang).
  - Preview foto bukti nota yang diunggah kasir.
  - Ekspor ringkasan tagihan supplier ke format PDF/Excel.

### 👥 Dashboard Admin
- [x] **Pilih Cabang**: Admin dapat berpilih di antara cabang-cabang yang ditugaskan kepadanya.
- [x] **Akses Dinamis**: Navigasi sidebar disesuaikan secara otomatis berdasarkan izin (permissions) yang diberikan Manager untuk cabang aktif tersebut.

### 🛒 Dashboard Kasir
- [x] **Ringkasan Harian**: Melihat jumlah nota yang diinput hari ini dan total nominal pengeluaran hari ini.
- [x] **Input Nota Cepat**: 
  - Form teroptimasi untuk perangkat mobile.
  - Pilihan supplier (pilih dari database cabang atau ketik manual sebagai supplier baru).
  - Kalkulasi otomatis total harga (Qty * Harga Satuan).
  - Unggah foto nota langsung dari kamera HP atau galeri (disimpan ke Supabase Storage bucket `nota-photos`).

---

## 🔮 Rencana Update & Fitur Masa Depan (Roadmap)

### 📈 Fase 1: Analytics & Integrasi Laporan (Short-term)
- [ ] **Laporan Gabungan Multi-Cabang**: Halaman khusus manager untuk membandingkan performa omset dan pengeluaran antar cabang secara berdampingan.
- [ ] **Grafik Margin & Profitabilitas**: Visualisasi perbandingan antara Omset Harian vs Total Pengeluaran Nota Supplier.
- [ ] **Ekspor Laporan Lebih Kaya**: Template PDF laporan yang lebih rapi dilengkapi dengan logo bisnis dan format slip yang siap dicetak.

### 🤖 Fase 2: Otomatisasi & Kecerdasan Buatan (Medium-term)
- [ ] **AI OCR Reader untuk Nota**: Kasir cukup memfoto nota, lalu AI secara otomatis mengekstrak nama supplier, daftar barang, qty, harga satuan, dan total nominal (mengurangi kesalahan input manual).
- [ ] **Notifikasi WhatsApp / Telegram**:
  - Kirim pemberitahuan otomatis ke Manager/Admin ketika kasir menginput nota bernilai besar.
  - Kirim notifikasi bukti bayar ke supplier secara otomatis begitu status nota diubah menjadi `SUDAH` dibayar.
- [ ] **Integrasi Bank API (Mutasi Rekening)**: Pengecekan otomatis mutasi rekening bank untuk pencocokan pembayaran supplier (jika menggunakan bank yang didukung).

### 🛡️ Fase 3: Skalabilitas & Keamanan (Long-term)
- [ ] **Audit Trail Viewer (Activity Logs UI)**: Tampilan visual untuk log aktivitas pengguna guna memantau siapa yang mengubah status nota, siapa yang menghapus data, dsb.
- [ ] **Sistem Approvals (Persetujuan)**: Nota di atas nominal tertentu memerlukan approval/persetujuan digital dari Manager/Admin sebelum bisa dibayarkan oleh staf lain.
- [ ] **Offline Mode untuk Kasir**: Kasir tetap bisa menginput nota saat sinyal buruk, data akan disinkronkan otomatis ketika perangkat terhubung ke internet.

---

## 📝 Catatan Perubahan & Progres Harian (Changelog)

| Tanggal | Versi | Perubahan / Update | Keterangan |
| :--- | :--- | :--- | :--- |
| 2026-07-06 | `1.3.1` | Perbaikan Bug Tag Penutup HTML | Memperbaiki tag penutup HTML yang tidak lengkap pada berkas KasirDashboard.tsx akibat perubahan visual sebelumnya. |
| 2026-07-06 | `1.3.0` | Halaman Khusus Laporan Laba Rugi | Membuat berkas ManagerProfitLoss, mereset perutean di App.tsx dan sidebar, mengintegrasikan ringkasan pendapatan harian vs total pengeluaran nota supplier, analisis kontribusi biaya supplier, serta ekspor PDF laporan resmi. |
| 2026-07-06 | `1.2.3` | Desain Ulang PNG Ikon Aplikasi PWA | Menggenerasi gambar 3D berestetika BCA melalui AI dan mengonversinya ke semua resolusi ikon PNG aplikasi (512px, 192px, maskable, apple-touch-icon) untuk standarisasi aplikasi seluler/PWA. |
| 2026-07-06 | `1.2.2` | Pembaruan Visual & Struktur Urusan Nota | Meningkatkan estetika status pill dengan ikon status check/clock di tabel nota kasir & manager, serta mendesain ulang antarmuka area unggah foto nota kasir agar lebih interaktif dan profesional. |
| 2026-07-06 | `1.2.1` | Implementasi Tema UI BCA Global | Mengubah variabel warna global di index.css menggunakan palet perbankan korporat BCA (BCA Blue, Navy, dan Gold) serta border-radius yang lebih luas untuk tampilan modern. |
| 2026-07-06 | `1.2.0` | Desain Ulang Identitas Visual & Ikon Aplikasi | Mengubah logo dan ikon aplikasi menjadi desain premium berestetika BCA (gradasi biru royal, lencana putih melayang, dan lambang bunga cengkeh dengan aksen emas). |
| 2026-07-06 | `1.1.3` | Persistensi State Sidebar | Mengintegrasikan state sidebar dengan localStorage agar posisinya (terbuka/tertutup) tetap bertahan saat berpindah halaman dan tidak menutup otomatis. |
| 2026-07-06 | `1.1.2` | Menu Sub-Item (Collapsible Dropdowns) | Mengubah navigasi sidebar menjadi sub-menu lipat (collapsible) untuk memisahkan urusan Nota, Keuangan, dan Pengaturan. |
| 2026-07-06 | `1.1.1` | Pengelompokkan Navigasi Sidebar | Memisahkan bagian Keuangan & Laporan dari bagian Operasional Cabang di sidebar menggunakan SidebarGroup. |
| 2026-07-06 | `1.1.0` | Implementasi Menu Keuangan & Arus Kas | Membuat halaman ManagerFinance, mengintegrasikan grafik arus kas, laba rugi, dan data salin rekening bank supplier. |
| 2026-07-06 | `1.0.0` | Inisialisasi Dokumentasi Progres & Analisis Aplikasi | Membuat file `PROGRESS.md` untuk mencatat arsitektur dan roadmap aplikasi. |

---
*Dokumen ini diperbarui secara berkala seiring dengan berjalannya proses pengembangan.*
