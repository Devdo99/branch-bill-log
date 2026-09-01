import { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  RefreshCw,
  Info,
  Zap,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadGSheetsConfig,
  saveGSheetsConfig,
  testGSheetsConnection,
  type GSheetsConfig,
} from "@/lib/gsheets";

export default function ManagerGoogleSheets() {
  const [config, setConfig] = useState<GSheetsConfig>(() => loadGSheetsConfig());
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setConfig(loadGSheetsConfig());
  }, []);

  // Save config
  const handleSave = () => {
    if (!webhookUrl.trim()) {
      toast.error("Masukkan Webhook URL");
      return;
    }
    // Validate URL format
    try {
      new URL(webhookUrl.trim());
    } catch {
      toast.error("URL tidak valid");
      return;
    }

    const updated: GSheetsConfig = {
      ...config,
      webhookUrl: webhookUrl.trim(),
    };
    saveGSheetsConfig(updated);
    setConfig(updated);
    toast.success("Pengaturan tersimpan!");
  };

  const handleToggle = (checked: boolean) => {
    if (checked && !config.webhookUrl) {
      toast.error("Simpan Webhook URL terlebih dahulu");
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
    const result = await testGSheetsConnection(webhookUrl.trim() || undefined);
    setTestResult(result);
    setTesting(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleReset = () => {
    const updated: GSheetsConfig = {
      enabled: false,
      webhookUrl: "",
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncMessage: null,
      totalSynced: 0,
    };
    saveGSheetsConfig(updated);
    setConfig(updated);
    setWebhookUrl("");
    setTestResult(null);
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
              <h3 className="font-semibold text-primary">Google Sheets — Apps Script Webhook</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Data nota dikirim langsung ke Google Sheets melalui Apps Script yang di-deploy sebagai web app.
                <strong> Tidak perlu Service Account Google.</strong> Cukup deploy Apps Script, copy URL-nya, dan paste di bawah.
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
              Ikuti langkah berikut — tidak perlu Google Cloud atau Service Account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                <div>
                  <h4 className="font-semibold text-sm">Buat Google Sheet Baru</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Buka <a href="https://sheets.google.com" target="_blank" rel="noopener" className="text-primary underline">Google Sheets</a>,
                    buat spreadsheet baru. Nama sheet tidak penting — akan dibuat otomatis oleh script.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                <div>
                  <h4 className="font-semibold text-sm">Deploy Google Apps Script</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Buka spreadsheet → <b>Extensions</b> → <b>Apps Script</b>. Hapus kode default, lalu tempel kode dari file{" "}
                    <code className="bg-muted px-1 rounded">scripts/gs-sync.gs</code>.
                    Klik <b>Deploy</b> → <b>New deployment</b> → pilih <b>Web app</b> → Execute as <b>Me</b> → Who has access <b>Anyone</b> → Deploy.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                <div>
                  <h4 className="font-semibold text-sm">Copy URL & Paste di Bawah</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Setelah deploy, salin URL web app (format: <code className="bg-muted px-1 rounded">https://script.google.com/macros/s/xxx/exec</code>),
                    lalu paste di kolom Webhook URL di bawah ini.
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
              Masukkan Webhook URL dari Apps Script
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

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Webhook URL (Apps Script)
              </Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                URL deployment dari Google Apps Script (format: <code>https://script.google.com/macros/s/.../exec</code>)
              </p>
              {config.webhookUrl && (
                <p className="text-[11px] text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Webhook URL tersimpan
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} size="sm">
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
                <span>Tidak perlu Google Cloud Console atau Service Account</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Data yang di-sync: ID, Cabang, Tanggal, Supplier, Barang, Qty, Harga, Total, Status, Waktu Input</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Anti duplikat — script memeriksa ID nota sebelum menulis</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Sheet akan dibuat otomatis jika belum ada di spreadsheet</span>
              </li>
              <li className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>URL webhook tersimpan di browser (localStorage)</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
