/**
 * Google Sheets Integration via Google Apps Script Webhook
 *
 * Cara pakai:
 * 1. Buat Google Sheet baru
 * 2. Buka Extensions > Apps Script
 * 3. Tempel kode.gs dari scripts/gs-sync.gs
 * 4. Deploy > New deployment > Web app (akses: Anyone)
 * 5. Copy URL web app dan paste di Pengaturan Google Sheets NotaKu
 */

const STORAGE_KEY = "notaku.gsheets_config";

export interface GSheetsConfig {
  enabled: boolean;
  webhookUrl: string;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "error" | null;
  lastSyncMessage: string | null;
  totalSynced: number;
}

export const defaultConfig: GSheetsConfig = {
  enabled: false,
  webhookUrl: "",
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncMessage: null,
  totalSynced: 0,
};

export function loadGSheetsConfig(): GSheetsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultConfig };
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return { ...defaultConfig };
  }
}

export function saveGSheetsConfig(config: GSheetsConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export interface InvoiceRow {
  id: string;
  branch_name: string;
  invoice_date: string;
  supplier: string;
  item_name: string;
  qty: number;
  price: number;
  total: number;
  status: string;
  created_by_name: string;
  created_at: string;
}

/**
 * Sync a batch of invoice rows to Google Sheets via Apps Script webhook
 */
export async function syncToGSheets(rows: InvoiceRow[]): Promise<{ success: boolean; message: string }> {
  const config = loadGSheetsConfig();

  if (!config.enabled || !config.webhookUrl) {
    return { success: false, message: "Google Sheets belum dikonfigurasi" };
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync_invoices",
        data: rows,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json().catch(() => ({ success: true }));

    // Update config with sync status
    const updatedConfig: GSheetsConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      lastSyncMessage: `Berhasil sync ${rows.length} data`,
      totalSynced: config.totalSynced + rows.length,
    };
    saveGSheetsConfig(updatedConfig);

    return { success: true, message: `Berhasil sync ${rows.length} data ke Google Sheets` };
  } catch (err) {
    const updatedConfig: GSheetsConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "error",
      lastSyncMessage: err instanceof Error ? err.message : "Unknown error",
    };
    saveGSheetsConfig(updatedConfig);

    return {
      success: false,
      message: `Gagal sync: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Test the webhook connection
 */
export async function testGSheetsConnection(webhookUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test_connection",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json().catch(() => ({}));
    return { success: true, message: "Koneksi berhasil! Google Sheets siap menerima data." };
  } catch (err) {
    return {
      success: false,
      message: `Koneksi gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
