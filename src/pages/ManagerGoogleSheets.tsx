import { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Info,
  Zap,
  Upload,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadGSheetsConfig,
  saveGSheetsConfig,
  saveConfigToBackend,
  testGSheetsConnection,
  getConfigFromBackend,
  type GSheetsConfig,
} from "@/lib/gsheets";

export default function ManagerGoogleSheets() {
  const [config, setConfig] = useState<GSheetsConfig>(() => loadGSheetsConfig());
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId);
  const [sheetName, setSheetName] = useState(config.sheetName || "Daftar Nota");
  const [saJsonText, setSaJsonText] = useState(config.serviceAccountJson || "");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [backendConfigured, setBackendConfigured] = useState(false);

  useEffect(() => {
    setConfig(loadGSheetsConfig());
    // Check if backend already has config
    getConfigFromBackend().then((bc) => {
      setBackendConfigured(bc.configured);
      if (bc.configured && !spreadsheetId) {
        setSpreadsheetId(bc.spreadsheetId);
        setSheetName(bc.sheetName);
      }
    });
  }, []);

  // Save config to both backend and localStorage
  const handleSave = async () => {
    if (!spreadsheetId.trim()) {
      toast.error("Masukkan Spreadsheet ID");
      return;
    }
    if (!saJsonText.trim()) {
      toast.error("Masukkan Service Account JSON");
      return;
    }
    setSaving(true);
    try {
      const result = await saveConfigToBackend(spreadsheetId.trim(), sheetName.trim(), saJsonText.trim());
      if (!result.success) {
        toast.error(result.message);
        setSaving(false);
        return;
      }
      const updated: GSheetsConfig = {
        ...config,
        spreadsheetId: spreadsheetId.trim(),
        sheetName: sheetName.trim() || "Daftar Nota",
        serviceAccountJson: saJsonText.trim(),
        serviceAccountEmail: extractEmail(saJsonText),
      };
      saveGSheetsConfig(updated);
      setConfig(updated);
      setBackendConfigured(true);
      toast.success("Pengaturan tersimpan!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const extractEmail = (json: string): string => {
    try {
      const obj = JSON.parse(json);
      return obj.client_email || "";
    } catch {
      return "";
    }
  };

  const handleToggle = (checked: boolean) => {
    if (checked && (!config.spreadsheetId || !config.serviceAccountEmail)) {
      toast.error("Simpan pengaturan terlebih dahulu");
      return;
    }
    const updated = { ...config, enabled: checked };
    saveGSheetsConfig(updated);
    setConfig(updated);
    toast.success(checked ? "Sinkronisasi Google Sheets diaktifkan" : "Sinkronisasi Google Sheets dinonaktifkan");
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testGSheetsConnection(
      spreadsheetId.trim() || undefined,
      saJsonText.trim() || undefined
    );
    setTestResult(result);
    setTesting(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleReset = () => {
    const updated: GSheetsConfig = {
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
    saveGSheetsConfig(updated);
    setConfig(updated);
    setSpreadsheetId("");
    setSheetName("Daftar Nota");
    setSaJsonText("");
    setTestResult(null);
    setBackendConfigured(false);
    toast.success("Pengaturan direset");
  };

  return (
    <AppShell title="Google Sheets Sync">
      <div className="space-y-6 max-w-3xl">
        {/* Info Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-primary">Google Sheets — Direct API</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Data nota dikirim langsung ke Google Sheets menggunakan Service Account.
                <strong> Tidak perlu Apps Script.</strong> Cukup buat Service Account, bagikan sheet-nya, dan paste kredensialnya.
              </p>
            </div>
          </div>
        </div>

        {/* Setup Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Panduan Setup (3 Langkah)
            </CardTitle>
            <CardDescription>
              Ikuti langkah berikut — tidak perlu Apps Script
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                <div>
                  <h4 className="font-semibold text-sm">Buat Google Cloud Service Account</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Buka <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener" className="text-primary underline">Google Cloud Console</a>,
                    buat Service Account baru. Aktifkan <b>Google Sheets API</b> di APIs & Services.
                    Buat <b>JSON key</b> dan download file-nya.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                <div>
                  <h4 className="font-semibold text-sm">Bagikan Google Sheet ke Service Account</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Buka Google Sheet Anda, klik <b>Share</b>, lalu masukkan email Service Account
                    (terlihat di file JSON, field <code>client_email</code>). Berikan akses <b>Editor</b>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                <div>
                  <h4 className="font-semibold text-sm">Isi Konfigurasi di Bawah</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Copy <b>Spreadsheet ID</b> dari URL sheet
                    (<code>https://docs.google.com/spreadsheets/d/<b>SPREADSHEET_ID</b>/edit</code>),
                    lalu paste JSON key Service Account di kolom yang tersedia.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Konfigurasi
            </CardTitle>
            <CardDescription>
              Masukkan Spreadsheet ID dan Service Account JSON
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold">Aktifkan Sinkronisasi</div>
                <p className="text-xs text-muted-foreground">
                  {config.enabled ? "Sync aktif — data nota baru akan otomatis terkirim" : "Sync nonaktif — data tidak dikirim ke Google Sheets"}
                </p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={handleToggle} />
            </div>

            {/* Spreadsheet ID */}
            <div className="space-y-2">
              <Label>Spreadsheet ID</Label>
              <Input
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                ID dari URL: docs.google.com/spreadsheets/d/<b className="text-foreground">INI_IDNYA</b>/edit
              </p>
            </div>

            {/* Sheet Name */}
            <div className="space-y-2">
              <Label>Nama Sheet (Tab)</Label>
              <Input
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Daftar Nota"
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Nama tab di spreadsheet. Akan dibuat otomatis jika belum ada.
              </p>
            </div>

            {/* Service Account JSON */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Service Account JSON
              </Label>
              <Textarea
                value={saJsonText}
                onChange={(e) => setSaJsonText(e.target.value)}
                placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"...@...iam.gserviceaccount.com",...}'
                className="font-mono text-[10px] min-h-[120px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Paste isi file JSON yang didownload dari Google Cloud Console.
                <span className="text-warning ml-1">⚠ Disimpan di server backend (bukan browser).</span>
              </p>
              {config.serviceAccountEmail && (
                <p className="text-[11px] text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Service Account: {config.serviceAccountEmail}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Simpan Pengaturan
              </Button>
              <Button onClick={handleTest} variant="outline" size="sm" disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Test Koneksi
              </Button>
              <Button onClick={handleReset} variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                Reset
              </Button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`rounded-lg border p-3 ${testResult.success ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className={`flex items-center gap-2 text-sm font-semibold ${testResult.success ? "text-success" : "text-destructive"}`}>
                  {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {testResult.message}
                </div>
              </div>
            )}

            <Separator />

            {/* Sync Status */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Status Sinkronisasi</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="font-medium mt-0.5">
                    {config.enabled ? (
                      <Badge className="bg-success text-success-foreground">Aktif</Badge>
                    ) : (
                      <Badge variant="outline">Nonaktif</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Total Data Tersync</div>
                  <div className="font-semibold mt-0.5">{config.totalSynced} data</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Sync Terakhir</div>
                  <div className="font-medium mt-0.5">
                    {config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString("id-ID") : "Belum pernah"}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Hasil Sync Terakhir</div>
                  <div className="font-medium mt-0.5">
                    {config.lastSyncStatus === "success" ? (
                      <span className="text-success">{config.lastSyncMessage}</span>
                    ) : config.lastSyncStatus === "error" ? (
                      <span className="text-destructive">{config.lastSyncMessage}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Tidak perlu Apps Script — data langsung dikirim via Google Sheets API</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Data yang di-sync: ID, Cabang, Tanggal, Supplier, Barang, Qty, Harga, Total, Status, Waktu Input</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Anti duplikat — NotaKu memeriksa ID nota sebelum menulis</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Sheet akan dibuat otomatis jika belum ada di spreadsheet</span>
              </li>
              <li className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Service Account JSON tersimpan di server backend (bukan di browser)</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
