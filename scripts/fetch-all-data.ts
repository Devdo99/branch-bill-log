/**
 * Script untuk mengambil semua data dari database Supabase
 * 
 * CARA PAKAI:
 * 1. Pastikan file .env sudah terisi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY
 * 2. Jalankan: npx tsx scripts/fetch-all-data.ts
 * 
 * Output akan disimpan di folder ./exports/
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Konfigurasi - ganti dengan credentials Supabase Anda
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'YOUR_SUPABASE_KEY';

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
] as const;

type TableName = typeof TABLES[number];

async function fetchAllData(tableName: TableName) {
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
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  const allData: Record<string, { data: any[]; count: number }> = {};
  
  // Ambil data dari setiap tabel
  for (const table of TABLES) {
    const result = await fetchAllData(table);
    if (result) {
      allData[table] = result;
      
      // Simpan per tabel
      const filePath = path.join(exportDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2));
      console.log(`   💾 Disimpan ke ${filePath}`);
    }
  }
  
  // Simpan semua data gabungan
  const allDataPath = path.join(exportDir, '_all_data.json');
  fs.writeFileSync(allDataPath, JSON.stringify(allData, null, 2));
  
  // Ringkasan
  console.log('\n📊 RINGKASAN:');
  console.log('=' .repeat(50));
  
  let totalRows = 0;
  for (const table of TABLES) {
    const count = allData[table]?.count ?? 0;
    totalRows += count;
    console.log(`  ${table.padEnd(20)} : ${count} baris`);
  }
  
  console.log('=' .repeat(50));
  console.log(`  TOTAL              : ${totalRows} baris`);
  console.log('\n💾 Semua data disimpan di folder: ./exports/');
  console.log('✨ Selesai!');
}

// Jalankan
main().catch(console.error);
