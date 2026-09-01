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
  Link,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Copy,
  Info,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadGSheetsConfig,
  saveGSheetsConfig,
  testGSheetsConnection,
  type GSheetsConfig,
} from "@/lib/gsheets";

const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "test_connection") {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "OK" })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    if (payload.action === "sync_invoices") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName("Daftar Nota");
      if (!sheet) {
        sheet = ss.insertSheet("Daftar Nota");
        const headers = ["ID Nota","Cabang","Tanggal Nota","Supplier","Nama Barang","Qty","Harga Satuan","Total","Status","Dibuat Oleh","Waktu Input"];
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
        sheet.getRange(1,1,1,headers.length).setFontWeight("bold").setBackground("#1a56db").setFontColor("#fff");
        sheet.setFrozenRows(1);
      }
      const rows = (payload.data||[]).map(r => [r.id,r.branch_name,r.invoice_date,r.supplier,r.item_name,r.qty,r.price,r.total,r.status,r.created_by_name,r.created_at]);
      if (rows.length > 0) {
        const lastRow = sheet.getLastRow();
        sheet.getRange(lastRow+1,1,rows.length,rows[0].length).setValues(rows);
      }
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, synced: rows.length })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export default function ManagerGoogleSheets() {
  const [config, setConfig] = useState<GSheetsConfig>(() => loadGSheetsConfig());
  const [webhookInput, setWebhookInput] = useState(config.webhookUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    setConfig(loadGSheetsConfig());
  }, []);

  const handleSave = () => {
    const updated: GSheetsConfig = {
      ...config,
      webhookUrl: webhookInput.trim(),
      enabled: webhookInput.trim() ? config.enabled : false,
    };
    saveGSheetsConfig(updated);
    setConfig(updated);
    toast.success("Pengaturan tersimpan!");
  };

  const handleToggle = (checked: boolean) => {
    if (checked && !config.webhookUrl) {
      toast.error("Masukkan Webhook URL terlebih dahulu");
      return;
    }
    const updated = { ...config, enabled: checked };
    saveGSheetsConfig(updated);
    setConfig(updated);
    toast.success(checked ? "Sinkronisasi Google Sheets diaktifkan" : "Sinkronisasi Google Sheets dinonaktifkan");
  };

  const handleTest = async () => {
    const url = webhookInput.trim();
    if (!url) {
      toast.error("Masukkan Webhook URL terlebih dahulu");
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testGSheetsConnection(url);
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
    setWebhookInput("");
    setTestResult(null);
    toast.success("Pengaturan direset");
  };

  const copyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    toast.success("Kode Apps Script disalin ke clipboard!");
  };

  return (
    <AppShell title="Google Sheets Sync">
      <div className="space-y-6 max-w-3xl">
        {/* Info Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-primary">Tentang Google Sheets Sync</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Aktifkan fitur ini untuk menyinkronkan data nota secara otomatis ke Google Sheets.
                Setiap kali ada data nota baru dari kasir, data akan langsung terkirim ke spreadsheet Anda.
              </p>
            </div>
          </div>
        </div>

        {/* Setup Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Panduan Setup
            </CardTitle>
            <CardDescription>
              Ikuti langkah berikut untuk menghubungkan NotaKu dengan Google Sheets
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
                    Buka <a href="https://sheets.google.com" target="_blank" rel="noopener" className="text-primary underline">Google Sheets</a>, buat spreadsheet baru, lalu beri nama (misal: "NotaKu Data").
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                <div>
                  <h4 className="font-semibold text-sm">Buka Apps Script Editor</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Di Google Sheet, klik <b>Extensions &gt; Apps Script</b>. Hapus kode default, lalu tempel kode di bawah.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                <div>
                  <h4 className="font-semibold text-sm">Deploy sebagai Web App</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Klik <b>Deploy &gt; New deployment</b>. Pilih Type: <b>Web app</b>, Execute as: <b>Me</b>, Who has access: <b>Anyone</b>.
                    Klik Deploy lalu <b>Copy URL</b>.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</div>
                <div>
                  <h4 className="font-semibold text-sm">Paste URL di Bawah</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Salin URL web app yang sudah di-deploy, lalu tempel di kolom Webhook URL di bawah ini.
                  </p>
                </div>
              </div>
            </div>

            {/* Apps Script Code */}
            <div className="mt-4">
              <button
                onClick={() => setShowScript(!showScript)}
                className="text-sm text-primary font-medium hover:underline"
              >
                {showScript ? "Sembunyikan" : "Tampilkan"} Kode Apps Script
              </button>

              {showScript && (
                <div className="mt-3 relative">
                  <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-[300px] overflow-y-auto border">
                    <code>{APPS_SCRIPT_CODE}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={copyScript}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Salin
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-primary" />
              Konfigurasi Koneksi
            </CardTitle>
            <CardDescription>
              Masukkan URL webhook dari Google Apps Script Anda
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
              <Switch
                checked={config.enabled}
                onCheckedChange={handleToggle}
              />
            </div>

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={webhookInput}
                onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/XXXX/exec"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                URL dari Google Apps Script yang sudah di-deploy sebagai Web App
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} size="sm">
                Simpan Pengaturan
              </Button>
              <Button onClick={handleTest} variant="outline" size="sm" disabled={testing || !webhookInput.trim()}>
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
                <span>Data yang di-sync: ID, Cabang, Tanggal, Supplier, Barang, Qty, Harga, Total, Status, dan Waktu Input</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Auto-sync bekerja saat kasir menginput nota baru (sinkron real-time)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>Data tidak akan duplikat — NotaKu memeriksa ID nota sebelum mengirim</span>
              </li>
              <li className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Webhook URL hanya disimpan di browser ini (localStorage). Perangkat lain perlu setting ulang.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
