/**
 * Google Sheets Integration — Direct API via backend
 * No Apps Script needed. Uses service account via /api/gsheets/* endpoints.
 */

const STORAGE_KEY = "notaku.gsheets_config";
const GATEWAY_URL = "http://localhost:5000";

export interface GSheetsConfig {
  enabled: boolean;
  spreadsheetId: string;
  sheetName: string;
  serviceAccountJson: string; // raw JSON string from user
  serviceAccountEmail: string;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "error" | null;
  lastSyncMessage: string | null;
  totalSynced: number;
}

export const defaultConfig: GSheetsConfig = {
  enabled: false,
  spreadsheetId: "",
  sheetName: "Daftar Nota",
  serviceAccountJson: "",
  serviceAccountEmail: "",
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
 * Save Google Sheets config to backend (service account + spreadsheet ID)
 */
export async function saveConfigToBackend(
  spreadsheetId: string,
  sheetName: string,
  serviceAccountJson: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/gsheets/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId, sheetName, serviceAccountJson }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menyimpan config");
    return { success: true, message: data.message || "Config tersimpan" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Gagal menyimpan config",
    };
  }
}

/**
 * Get config status from backend
 */
export async function getConfigFromBackend(): Promise<{
  configured: boolean;
  spreadsheetId: string;
  sheetName: string;
  serviceAccountEmail: string;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/gsheets/config`);
    return await res.json();
  } catch {
    return { configured: false, spreadsheetId: "", sheetName: "", serviceAccountEmail: "" };
  }
}

/**
 * Test Google Sheets connection via backend
 */
export async function testGSheetsConnection(
  spreadsheetId?: string,
  serviceAccountJson?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const body: Record<string, string> = {};
    if (spreadsheetId) body.spreadsheetId = spreadsheetId;
    if (serviceAccountJson) body.serviceAccountJson = serviceAccountJson;

    const res = await fetch(`${GATEWAY_URL}/api/gsheets/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, message: data.error || data.message || "Test gagal" };
    }
    return { success: true, message: data.message || "Koneksi berhasil" };
  } catch (err) {
    return {
      success: false,
      message: `Koneksi gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Sync invoice rows to Google Sheets via backend (direct API)
 */
export async function syncToGSheets(rows: InvoiceRow[]): Promise<{ success: boolean; message: string }> {
  const config = loadGSheetsConfig();

  if (!config.enabled || !config.spreadsheetId) {
    return { success: false, message: "Google Sheets belum dikonfigurasi" };
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/api/gsheets/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sync gagal");

    // Update local config with sync status
    const updatedConfig: GSheetsConfig = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      lastSyncMessage: data.message || `Berhasil sync ${rows.length} data`,
      totalSynced: config.totalSynced + (data.synced || rows.length),
    };
    saveGSheetsConfig(updatedConfig);

    return { success: true, message: data.message || `Berhasil sync ${rows.length} data ke Google Sheets` };
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
