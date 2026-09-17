# Design spec — Aplikasi manajemen nota

> File ini untuk dibaca AI coding agent (Claude Code / CLI agent lain) yang akan
> memperbaiki UI/UX aplikasi nota yang **sudah jadi alurnya**. Tugas agent:
> terapkan token & pola di bawah ke komponen/halaman existing — **jangan ubah
> logic/flow**, hanya restyle + rapikan struktur visual & interaksi.

## 0. Konteks

- App: manajemen nota (web), flow sudah berfungsi.
- Tema: "Clean Blue Ledger" — primary biru #1D63ED dengan netral dingin.
  Fokus: kejelasan angka & status untuk data keuangan yang dicek harian.
- Target pemakai: staff finance/operasional, dipakai berulang tiap hari, bukan
  landing page. Prioritas: cepat dibaca, rapi saat data banyak, tidak capek
  mata dipakai lama.
- Stack asumsi: React + Tailwind utility classes + lucide-react icons. Kalau
  stack aktual beda, pertahankan pola/token, sesuaikan sintaks saja.

## 1. Design tokens

Simpan sebagai satu sumber kebenaran (`src/index.css` CSS variables +
`tailwind.config.ts`) — jangan hardcode hex di tiap komponen.

```
--color-primary:        #1D63ED   // biru — header, nav aktif, tombol utama
--color-primary-dark:   #1056C6   // hover / versi lebih gelap
--color-primary-soft:   #EAF1FF   // highlight baris terpilih / badge info
--color-bg:              #F7F8FA   // page background
--color-surface:         #FFFFFF   // card, table, modal
--color-border:           #E3E6EB   // hairline antar elemen
--color-text-primary:     #111827
--color-text-secondary:   #5B6472
--color-text-muted:       #8B93A1
--color-sidebar:          #10203F   // sidebar biru gelap (ledger)

--color-success:         #0F9D58
--color-success-bg:      #EBF2EB   // nota lunas / sudah dicatat
--color-warning:         #B45309
--color-warning-bg:      #FFF6E5   // belum lunas / menunggu approval
--color-danger:          #DC2626
--color-danger-bg:       #FEECEC   // lewat jatuh tempo / selisih / nota hilang

--font-ui:      "Inter", system-ui, sans-serif   // semua UI, termasuk judul
--font-numeric: tabular-nums                      // WAJIB untuk nominal & tanggal (di CSS sudah jadi class .num)

--radius-default: 10px    // card, input, button
--radius-badge:    6px

--space: 4 / 8 / 12 / 16 / 24 / 32   // skala spacing, tidak boleh angka acak
--border-weight: 0.5px               // hairline, bukan shadow tebal
```

Aturan: satu warna primary untuk 1 aksi utama per layar. Semantic color
(success/warning/danger) **wajib** dipakai untuk status nota — jangan hanya
warna teks merah/hijau tanpa label teks, supaya tetap jelas untuk staff buta
warna.

Palet yang sama dipakai di laporan PDF (`src/lib/pdf.ts`, objek `C` dalam RGB).
Kalau token di atas berubah, selaraskan juga palet PDF. Nilai HSL persis ada
di `src/index.css` (light & dark).

## 2. Layout global

Pola sama dengan dashboard existing:

```
┌───────────┬─────────────────────────────────────┐
│  Sidebar  │  Topbar: judul halaman + cabang      │
│  (nav,    ├─────────────────────────────────────┤
│  primary  │                                       │
│  bg)      │  Konten: fade-in 0.2–0.25s saat       │
│           │  pindah menu, TIDAK reload halaman    │
└───────────┴─────────────────────────────────────┘
```

- Nav item aktif: indikator biru terang (`--sidebar-primary`) geser halus
  (`transition ease-out 250-300ms`),
  bukan langsung snap.
- Navigasi dangkal: menu nota (Arsip, Buat nota, Rekap) maksimal 1 klik dari
  sidebar, jangan ditumpuk di submenu.

## 3. Halaman inti & hierarki visual

### 3.1 Arsip nota (list/table)

Urutan baca dari atas: filter/search → tabel.

- Tabel: baris dengan hairline border (`0.5px solid --color-border`), **bukan**
  shadow tebal per baris. Zebra striping opsional kalau data padat.
- Kolom angka (nominal) rata kanan, `tabular-nums`. Kolom teks rata kiri.
- Kolom status pakai badge: background `*-bg`, teks warna `*` solid, radius
  `--radius-badge`. Contoh: `Lunas` (success), `Jatuh tempo 3 hari` (warning),
  `Overdue` (danger).
- Sticky header kalau list panjang (>15 baris).
- Search + filter (tanggal, status, cabang) selalu terjangkau di atas tabel,
  bukan disembunyikan di menu lain.
- Row punya aksi cepat (lihat/cetak/hapus) muncul on-hover, ikon konsisten satu
  set (lucide), bukan campur emoji.

### 3.2 Detail nota

- Hierarki: nomor nota + status di paling atas (paling besar/menonjol), lalu
  info pihak terkait, lalu rincian item, lalu total di bagian bawah (nominal
  total ukurannya paling besar di antara semua angka di halaman ini).
- Tombol aksi utama (mis. "Tandai lunas" / "Cetak nota") — 1 primary,
  sisanya secondary/ghost. Aksi destruktif (batalkan nota) pakai warna danger
  + konfirmasi modal, tidak boleh 1 klik langsung tereksekusi.

### 3.3 Buat / edit nota

- Label field selalu terlihat (bukan cuma placeholder).
- Input nominal: auto-format ribuan saat mengetik.
- Validasi inline di dekat field yang error, bukan alert di atas form.
- Simpan → toast singkat konsisten dengan nama tombol (tombol "Simpan nota" →
  toast "Nota disimpan"), bukan generic "berhasil update".

### 3.4 Rekap / laporan nota

- Satu angka paling penting di atas (mis. total piutang belum lunas), baru
  breakdown di bawahnya. Jangan taruh 8 angka sama besar tanpa hierarki.
- Chart (kalau ada) harus jawab pertanyaan spesifik (tren piutang naik/turun),
  bukan chart dekoratif tanpa insight.

## 4. State wajib (bukan cuma happy path)

Setiap halaman list/detail perlu 4 state eksplisit:

- **Loading**: skeleton row/card sesuai bentuk kontennya, bukan spinner
  generik di tengah layar.
- **Empty**: ajakan aksi (mis. "Belum ada nota — buat nota pertama" + tombol),
  bukan cuma teks "No data" kosong.
- **Error**: jelaskan apa yang salah + cara perbaiki (mis. "Gagal memuat nota.
  Coba lagi." + tombol retry), bukan pesan error mentah dari sistem.
- **Data ekstrem**: nama pelanggan/item panjang tidak merusak layout, nominal
  besar (puluhan juta) tetap rapi, list dengan 1 item vs 200 item sama-sama
  rapi.

## 5. Komponen & interaksi

- Tombol: hierarki jelas — 1 primary per section, secondary outline/ghost
  untuk sisanya, danger untuk aksi merusak/tidak bisa diundo.
- Motion: dipakai untuk kasih konteks (transisi state, fade antar panel),
  bukan hiasan — durasi pendek (~200-300ms), jangan animasi berlebihan yang
  bikin app terasa lambat dipakai berulang.
- Ikon: satu set konsisten (lucide/tabler outline), dipakai hanya kalau
  menambah kejelasan.
- Kontras teks minimal WCAG AA (4.5:1), target sentuh/klik minimal ~40px
  tinggi untuk tombol aksi di tabel.

## 6. Yang harus dihindari (ciri "template AI generik")

- Card dengan shadow besar + radius besar + gradient tanpa alasan.
- Status hanya diwakili warna tanpa teks/badge.
- Semua angka di layar sama besar tanpa hierarki.
- Empty state kosong tanpa CTA.
- Warna vibrant/playful untuk konteks finansial — tetap di palet tenang di
  atas (biru/netral dingin), bukan gradient ungu-pink.

## 7. Instruksi untuk AI agent

1. Baca komponen/halaman existing dulu, petakan mana yang setara dengan
   section 3.1–3.4 di atas.
2. Ekstrak semua warna/spacing hardcoded ke token di section 1 — ganti
   pemakaian di seluruh file, jangan tempel token cuma di satu komponen.
3. Terapkan pola layout section 2 ke shell aplikasi (kalau sidebar/topbar
   belum ada, tambahkan; kalau sudah ada, restyle sesuai token).
4. Perbaiki tiap halaman sesuai hierarki di section 3, tanpa mengubah
   binding data/state management yang sudah ada.
5. Pastikan 4 state di section 4 ada di setiap halaman list/detail yang
   fetch data.
6. Jalankan checklist section 5–6 sebagai review terakhir sebelum
   melaporkan selesai.

## 8. Checklist selesai

- [ ] Semua warna dari token, tidak ada hex hardcoded baru
- [ ] Semua angka nominal pakai `tabular-nums` + format Rupiah
- [ ] Status nota selalu badge (warna + teks), bukan warna teks saja
- [ ] Loading/empty/error state ada di semua halaman data
- [ ] Navigasi maksimal 1 klik ke fitur utama (arsip, buat nota, rekap)
- [ ] Kontras teks & ukuran tombol memenuhi target aksesibilitas minimal
- [ ] Diuji dengan data ekstrem (nama panjang, nominal besar, list kosong/panjang)