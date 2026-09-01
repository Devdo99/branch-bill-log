/**
 * Script untuk mengambil semua data dari database Supabase
 * 
 * CARA PAKAI:
 * 1. Jalankan: node scripts/fetch-all-data.mjs
 * 
 * Output akan disimpan di folder ./exports/
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Konfigurasi dari environment
const SUPABASE_URL = 'https://jkcdofhjuivbxxjdakoa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprY2RvZmhqdWl2Ynh4amRha29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Nzc3NjgsImV4cCI6MjA5MzU1Mzc2OH0.0ml4gizdjeNR0map7DkwJkG5cYOCDSf8eBMzOI9iKZQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Daftar semua tabel
const TABLES = [
  'profiles',
  'user_roles',
  'branches',
  'branch_users',
  'admin_permissions',
  'invoices',
  'daily_revenues',
  'monthly_reports',
  'suppliers',
  'activity_logs',
];

async function fetchAllData(tableName) {
  console.log(`📥 Mengambil data dari tabel: ${tableName}...`);
  
  const { data, error, count } = await supabase
    .from(tableName)
    .select('*', { count: 'exact' });
  
  if (error) {
    console.error(`❌ Error mengambil ${tableName}:`, error.message);
    return null;
  }
  
  console.log(`✅ ${tableName}: ${count} baris`);
  return { data, count };
}

async function main() {
  console.log('🚀 Memulai pengambilan semua data dari Supabase...\n');
  
  // Buat folder exports
  const exportDir = join(process.cwd(), 'exports');
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
  }
  
  const allData = {};
  
  // Ambil data dari setiap tabel
  for (const table of TABLES) {
    const result = await fetchAllData(table);
    if (result) {
      allData[table] = result;
      
      // Simpan per tabel
      const filePath = join(exportDir, `${table}.json`);
      writeFileSync(filePath, JSON.stringify(result.data, null, 2));
      console.log(`   💾 Disimpan ke ${filePath}`);
    }
  }
  
  // Simpan semua data gabungan
  const allDataPath = join(exportDir, '_all_data.json');
  writeFileSync(allDataPath, JSON.stringify(allData, null, 2));
  
  // Ringkasan
  console.log('\n📊 RINGKASAN:');
  console.log('='.repeat(50));
  
  let totalRows = 0;
  for (const table of TABLES) {
    const count = allData[table]?.count ?? 0;
    totalRows += count;
    console.log(`  ${table.padEnd(20)} : ${count} baris`);
  }
  
  console.log('='.repeat(50));
  console.log(`  TOTAL              : ${totalRows} baris`);
  console.log('\n💾 Semua data disimpan di folder: ./exports/');
  console.log('✨ Selesai!');
}

// Jalankan
main().catch(console.error);
