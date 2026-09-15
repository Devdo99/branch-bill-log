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
    // PENTING: jangan set header "Content-Type: application/json".
    // Header custom memicu CORS preflight (OPTIONS) yang tidak didukung
    // Apps Script sehingga fetch gagal dengan "Failed to fetch".
    // Tanpa header custom, request dianggap "simple request" (no preflight)
    // dan Apps Script tetap menerima JSON lewat e.postData.contents.
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ action: "test_connection" }),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message || "Koneksi berhasil" };
    }
    return { success: false, message: data.message || "Test gagal" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Failed to fetch") {
      return {
        success: false,
        message:
          "Failed to fetch — periksa: (1) URL harus diakhiri /exec, (2) Deployment access harus \"Anyone\", (3) Setelah mengubah kode Apps Script, buat deployment versi baru",
      };
    }
    return {
      success: false,
      message: `Koneksi gagal: ${msg}`,
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
    // Sama seperti testGSheetsConnection: tanpa header Content-Type custom
    // agar tidak memicu CORS preflight.
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      redirect: "follow",
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

    const msg = err instanceof Error ? err.message : "Unknown error";
    const hint =
      msg === "Failed to fetch"
        ? " — periksa URL /exec, access \"Anyone\", dan deployment versi terbaru"
        : "";
    return {
      success: false,
      message: `Gagal sync: ${msg}${hint}`,
    };
  }
}
