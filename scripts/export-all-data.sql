-- ============================================
-- SQL EXPORT: Ambil Semua Data dari NotaKu DB
-- ============================================
-- CARA PAKAI:
-- 1. Unpause project Supabase di https://supabase.com/dashboard
-- 2. Buka SQL Editor di dashboard
-- 3. Jalankan query di bawah satu per satu
-- 4. Hasilnya bisa di-download sebagai CSV
-- ============================================

-- 1. PROFILES
SELECT * FROM profiles;

-- 2. USER ROLES
SELECT * FROM user_roles;

-- 3. BRANCHES
SELECT * FROM branches;

-- 4. BRANCH USERS (relasi user ↔ branch)
SELECT * FROM branch_users;

-- 5. ADMIN PERMISSIONS
SELECT * FROM admin_permissions;

-- 6. INVOICES
SELECT * FROM invoices ORDER BY created_at DESC;

-- 7. DAILY REVENUES
SELECT * FROM daily_revenues ORDER BY revenue_date DESC;

-- 8. MONTHLY REPORTS
SELECT * FROM monthly_reports ORDER BY report_month DESC;

-- 9. SUPPLIERS
SELECT * FROM suppliers ORDER BY created_at DESC;

-- 10. ACTIVITY LOGS
SELECT * FROM activity_logs ORDER BY created_at DESC;

-- ============================================
-- BONUS: Export Gabungan (semua data sekaligus)
-- ============================================
-- Jalankan ini untuk export JSON per tabel
-- Bisa juga export langsung dari Table Editor:
-- Klik tabel > click menu (3 titik) > Export data > CSV/JSON

-- ============================================
-- INFO: Cara unpause project Supabase
-- ============================================
-- 1. Login ke https://supabase.com/dashboard
-- 2. Pilih project NotaKu (jkcdofhjuivbxxjdakoa)
-- 3. Klik "Restore project" / "Unpause"
-- 4. Tunggu beberapa menit sampai project aktif
-- 5. Buka SQL Editor dan jalankan query di atas
-- ============================================
