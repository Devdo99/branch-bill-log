// ============================================================
// EXPORT SEMUA DATA SUPABASE DARI BROWSER CONSOLE
// ============================================================
// CARA PAKAI:
// 1. Login ke Lovable (lovable.dev) di browser
// 2. Buka project NotaKu (pastikan halaman project terbuka)
// 3. Tekan F12 → tab Console
// 4. Paste seluruh script ini → tekan Enter
// 5. Tunggu sampai selesai, file JSON akan otomatis ter-download
// ============================================================

(async () => {
  const SUPABASE_URL = 'https://jkcdofhjuivbxxjdakoa.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprY2RvZmhqdWl2Ynh4amRha29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Nzc3NjgsImV4cCI6MjA5MzU1Mzc2OH0.0ml4gizdjeNR0map7DkwJkG5cYOCDSf8eBMzOI9iKZQ';
  
  const TABLES = [
    'profiles', 'user_roles', 'branches', 'branch_users',
    'admin_permissions', 'invoices', 'daily_revenues',
    'monthly_reports', 'suppliers', 'activity_logs'
  ];

  const allData = {};
  let totalRows = 0;

  for (const table of TABLES) {
    console.log(`📥 Mengambil data dari: ${table}...`);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        console.error(`❌ ${table}: HTTP ${res.status} - ${res.statusText}`);
        continue;
      }
      
      const data = await res.json();
      allData[table] = data;
      totalRows += data.length;
      console.log(`✅ ${table}: ${data.length} baris`);
    } catch (err) {
      console.error(`❌ ${table}: ${err.message}`);
    }
  }

  // Download sebagai JSON
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notaku_database_export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('\n🎉 EXPORT SELESAI!');
  console.log(`📊 Total: ${totalRows} baris dari ${TABLES.length} tabel`);
  console.log('💾 File "notaku_database_export.json" sudah ter-download');
})();
