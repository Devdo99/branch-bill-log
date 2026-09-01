/**
 * Google Sheets Integration — via Apps Script Webhook
 * No service account needed. Uses a Google Apps Script deployed as web app.
 */

const STORAGE_KEY = "notaku.gsheets_config";

export interface GSheetsConfig {
  enabled: boolean;
  webhookUrl: string; // Apps Script deployment URL
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
 * Test Google Sheets webhook connection
 */
export async function testGSheetsConnection(
  webhookUrl?: string
): Promise<{ success: boolean; message: string }> {
  const url = webhookUrl || loadGSheetsConfig().webhookUrl;
  if (!url) {
    return { success: false, message: "Webhook URL belum dikonfigurasi" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test_connection" }),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message || "Koneksi berhasil" };
    }
    return { success: false, message: data.message || "Test gagal" };
  } catch (err) {
    return {
      success: false,
      message: `Koneksi gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Sync invoice rows to Google Sheets via Apps Script webhook
 */
export async function syncToGSheets(rows: InvoiceRow[]): Promise<{ success: boolean; message: string }> {
  const config = loadGSheetsConfig();

  if (!config.enabled || !config.webhookUrl) {
    return { success: false, message: "Google Sheets belum dikonfigurasi" };
  }

  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_invoices", data: rows }),
    });
    const data = await res.json();

    // Update local config with sync status
    const updatedConfig: GSheetsConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: data.success ? "success" : "error",
      lastSyncMessage: data.message || (data.success ? `Berhasil sync ${rows.length} data` : "Sync gagal"),
      totalSynced: data.success ? config.totalSynced + (data.synced || rows.length) : config.totalSynced,
    };
    saveGSheetsConfig(updatedConfig);

    if (data.success) {
      return { success: true, message: data.message || `Berhasil sync ${rows.length} data ke Google Sheets` };
    }
    return { success: false, message: data.message || "Sync gagal" };
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
