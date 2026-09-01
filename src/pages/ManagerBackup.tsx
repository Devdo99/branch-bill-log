import { useState, useRef, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Upload,
  Database,
  Image,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Archive,
  RefreshCw,
  Trash2,
  Info,
} from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";

// Semua tabel yang perlu di-backup
const TABLES = [
  "profiles",
  "user_roles",
  "branches",
  "branch_users",
  "admin_permissions",
  "invoices",
  "daily_revenues",
  "monthly_reports",
  "suppliers",
  "activity_logs",
] as const;

type TableName = (typeof TABLES)[number];

interface BackupMeta {
  version: string;
  createdAt: string;
  branchId: string | null;
  branchName: string | null;
  tables: Record<TableName, number>;
  photoCount: number;
  totalRecords: number;
}

export default function ManagerBackup() {
  const { activeBranch } = useBranch();

  // Backup state
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStatus, setBackupStatus] = useState("");
  const [lastBackup, setLastBackup] = useState<BackupMeta | null>(null);

  // Restore state
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreMeta, setRestoreMeta] = useState<BackupMeta | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================
  // BACKUP: Download semua data sebagai ZIP
  // ============================================
  const handleBackup = useCallback(async () => {
    setBackupLoading(true);
    setBackupProgress(0);
    setBackupStatus("Memulai backup...");
    setLastBackup(null);

    try {
      const zip = new JSZip();
      const allData: Record<string, any[]> = {};
      let totalRecords = 0;

      // Step 1: Fetch semua data dari setiap tabel
      setBackupStatus("Mengambil data dari database...");
      for (let i = 0; i < TABLES.length; i++) {
        const table = TABLES[i];
        setBackupStatus(`Mengambil data tabel: ${table}`);
        setBackupProgress(((i + 0.5) / (TABLES.length + 2)) * 100);

        const { data, error } = await supabase
          .from(table)
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error(`Error fetching ${table}:`, error);
          toast.error(`Gagal mengambil data tabel: ${table}`);
          continue;
        }

        allData[table] = data ?? [];
        totalRecords += (data ?? []).length;
      }

      // Step 2: Simpan semua data JSON ke ZIP
      setBackupStatus("Menyimpan data ke file backup...");
      setBackupProgress(((TABLES.length + 0.5) / (TABLES.length + 2)) * 100);

      for (const table of TABLES) {
        zip.file(`data/${table}.json`, JSON.stringify(allData[table], null, 2));
      }

      // Step 3: Download semua foto dari Supabase Storage
      setBackupStatus("Mengunduh foto nota...");
      const photoFolder = zip.folder("photos");
      let photoCount = 0;

      // Ambil daftar foto dari invoices yang punya photo_path
      const invoicePhotos = allData["invoices"]
        ?.filter((inv: any) => inv.photo_path)
        .map((inv: any) => inv.photo_path as string) ?? [];

      // Download setiap foto
      for (let i = 0; i < invoicePhotos.length; i++) {
        const photoPath = invoicePhotos[i];
        setBackupStatus(`Mengunduh foto (${i + 1}/${invoicePhotos.length}): ${photoPath}`);
        setBackupProgress(
          ((TABLES.length + 1 + (i + 1) / invoicePhotos.length) / (TABLES.length + 2)) * 100
        );

        try {
          const { data: photoData, error: photoError } = await supabase.storage
            .from("nota-photos")
            .download(photoPath);

          if (!photoError && photoData) {
            photoFolder?.file(photoPath, photoData);
            photoCount++;
          }
        } catch (err) {
          console.warn(`Gagal mengunduh foto ${photoPath}:`, err);
        }
      }

      // Step 4: Buat metadata backup
      const meta: BackupMeta = {
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        branchId: activeBranch?.id ?? null,
        branchName: activeBranch?.name ?? null,
        tables: {} as Record<TableName, number>,
        photoCount,
        totalRecords,
      };

      for (const table of TABLES) {
        meta.tables[table] = allData[table]?.length ?? 0;
      }

      zip.file("_meta.json", JSON.stringify(meta, null, 2));

      // Step 5: Generate dan download ZIP
      setBackupStatus("Membuat file ZIP...");
      setBackupProgress(95);

      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (metadata) => {
          setBackupProgress(95 + (metadata.percent / 100) * 5);
        }
      );

      // Trigger download
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `notaku-backup-${timestamp}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupProgress(100);
      setBackupStatus("Backup selesai!");
      setLastBackup(meta);

      toast.success(`Backup berhasil! ${totalRecords} data & ${photoCount} foto tersimpan.`);
    } catch (err) {
      console.error("Backup error:", err);
      toast.error("Terjadi kesalahan saat backup. Silakan coba lagi.");
      setBackupStatus("Gagal melakukan backup.");
    } finally {
      setBackupLoading(false);
    }
  }, [activeBranch]);

  // ============================================
  // RESTORE: Upload ZIP dan pulihkan data
  // ============================================
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    setRestoreMeta(null);
    setRestoreResult(null);

    // Baca metadata dari ZIP
    try {
      const zip = await JSZip.loadAsync(file);
      const metaFile = zip.file("_meta.json");
      if (metaFile) {
        const metaText = await metaFile.async("text");
        const meta = JSON.parse(metaText) as BackupMeta;
        setRestoreMeta(meta);
      }
    } catch (err) {
      console.error("Gagal membaca backup file:", err);
      toast.error("File backup tidak valid.");
      setRestoreFile(null);
    }
  }, []);

  const handleRestore = useCallback(async () => {
    if (!restoreFile) return;

    const confirmRestore = window.confirm(
      "📦 Proses sync data akan mengunggah data dari backup ke sistem.\n\n• Data baru akan ditambahkan\n• Data yang sudah ada akan diupdate\n• Data lama TIDAK akan dihapus\n\nLanjutkan?"
    );
    if (!confirmRestore) return;

    setRestoreLoading(true);
    setRestoreProgress(0);
    setRestoreStatus("Memulai sync data...");
    setRestoreResult(null);

    try {
      const zip = await JSZip.loadAsync(restoreFile);

      // Step 1: Baca metadata
      setRestoreStatus("Membaca metadata backup...");
      setRestoreProgress(5);
      const metaFile = zip.file("_meta.json");
      let meta: BackupMeta | null = null;
      if (metaFile) {
        const metaText = await metaFile.async("text");
        meta = JSON.parse(metaText) as BackupMeta;
      }

      // Step 2: Upload foto terlebih dahulu (upsert - update jika sudah ada)
      setRestoreStatus("Mengunggah foto...");
      const photoFolder = zip.folder("photos");
      let uploadedPhotos = 0;
      const photoFiles = photoFolder ? Object.keys(photoFolder.files).filter(f => !f.endsWith("/")) : [];

      for (let i = 0; i < photoFiles.length; i++) {
        const photoPath = photoFiles[i];
        setRestoreStatus(`Mengunggah foto (${i + 1}/${photoFiles.length})...`);
        setRestoreProgress(
          ((1 + (i + 1) / Math.max(photoFiles.length, 1)) * 10) / 100
        );

        try {
          const fileData = await photoFolder!.file(photoPath)!.async("blob");

          const ext = photoPath.split(".").pop() || "jpg";
          const contentType = ext === "png" ? "image/png" : "image/jpeg";

          const { error } = await supabase.storage
            .from("nota-photos")
            .upload(photoPath, fileData, {
              contentType,
              upsert: true,
            });

          if (!error) uploadedPhotos++;
        } catch (err) {
          console.warn(`Gagal mengunggah foto ${photoPath}:`, err);
        }
      }

      // Step 3: Upsert data ke tabel (insert on conflict update)
      // Urutan upsert: profiles -> user_roles -> branches -> branch_users -> admin_permissions
      //              -> suppliers -> invoices -> daily_revenues -> monthly_reports -> activity_logs
      setRestoreStatus("Menyinkronkan data...");
      const upsertOrder: TableName[] = [
        "profiles",
        "user_roles",
        "branches",
        "branch_users",
        "admin_permissions",
        "suppliers",
        "invoices",
        "daily_revenues",
        "monthly_reports",
        "activity_logs",
      ];

      let totalUpserted = 0;
      let totalSkipped = 0;
      for (let i = 0; i < upsertOrder.length; i++) {
        const table = upsertOrder[i];
        setRestoreStatus(`Menyinkronkan tabel: ${table}...`);
        setRestoreProgress(10 + ((i + 0.5) / upsertOrder.length) * 85);

        const dataFile = zip.file(`data/${table}.json`);
        if (!dataFile) continue;

        const dataText = await dataFile.async("text");
        const rows = JSON.parse(dataText) as any[];

        if (rows.length === 0) continue;

        // Upsert dalam batch kecil
        const BATCH_SIZE = 50;
        for (let j = 0; j < rows.length; j += BATCH_SIZE) {
          const batch = rows.slice(j, j + BATCH_SIZE);
          const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
          if (error) {
            console.error(`Gagal upsert batch ke ${table}:`, error);
            // Fallback: coba insert satu per satu
            for (const row of batch) {
              const { error: insertErr } = await supabase.from(table).upsert(row, { onConflict: "id" });
              if (insertErr) {
                console.warn(`Gagal upsert row di ${table}:`, insertErr);
                totalSkipped++;
              } else {
                totalUpserted++;
              }
            }
          } else {
            totalUpserted += batch.length;
          }
        }
      }

      setRestoreProgress(100);
      setRestoreStatus("Sync selesai!");
      setRestoreResult({
        success: true,
        message: `Berhasil menyinkronkan ${totalUpserted} data & ${uploadedPhotos} foto.${totalSkipped > 0 ? ` (${totalSkipped} data dilewati karena error).` : ""}`,
      });

      toast.success(`Sync berhasil! ${totalUpserted} data tersinkronisasi.`);
    } catch (err) {
      console.error("Restore error:", err);
      setRestoreResult({
        success: false,
        message: `Gagal menyinkronkan data: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      toast.error("Terjadi kesalahan saat sync data.");
    } finally {
      setRestoreLoading(false);
    }
  }, [restoreFile]);

  return (
    <AppShell title="Backup & Restore">
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-primary">Tentang Backup & Restore</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Fitur ini memungkinkan Anda mengunduh seluruh data aplikasi (termasuk foto nota) sebagai
                file ZIP, serta memulihkan data dari file backup sebelumnya. Gunakan fitur ini untuk
                keperluan migrasi, cadangan data, atau pemulihan setelah masalah teknis.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ===== BACKUP SECTION ===== */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Backup Data
              </CardTitle>
              <CardDescription>
                Unduh seluruh data aplikasi sebagai file ZIP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Yang termasuk dalam backup:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <span>Semua data database ({TABLES.length} tabel)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    <span>Semua foto nota dari storage</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>Metadata backup untuk verifikasi</span>
                  </li>
                </ul>
              </div>

              {backupLoading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{backupStatus}</span>
                    <span className="font-medium">{Math.round(backupProgress)}%</span>
                  </div>
                  <Progress value={backupProgress} className="h-2" />
                </div>
              )}

              {lastBackup && !backupLoading && (
                <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-success font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Backup Berhasil
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Waktu:</span>{" "}
                      <span className="font-medium">
                        {new Date(lastBackup.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total data:</span>{" "}
                      <span className="font-medium">{lastBackup.totalRecords} record</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Foto:</span>{" "}
                      <span className="font-medium">{lastBackup.photoCount} file</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Versi:</span>{" "}
                      <span className="font-medium">{lastBackup.version}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="text-xs text-muted-foreground">
                    Detail per tabel:
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {TABLES.map((table) => (
                      <div key={table} className="flex justify-between">
                        <span className="text-muted-foreground">{table}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {lastBackup.tables[table] ?? 0}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleBackup}
                disabled={backupLoading}
                className="w-full"
                size="lg"
              >
                {backupLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" />
                    Unduh Backup Sekarang
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ===== RESTORE SECTION ===== */}
          <Card className="border-warning/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-warning" />
                Restore Data
              </CardTitle>
              <CardDescription>
                Sinkronisasi data dari file backup ke sistem
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-success">Mode Sync Aman</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Data dari backup akan ditambahkan ke sistem. Data yang sudah ada akan diupdate.
                      Data lama TIDAK akan dihapus — aman untuk sinkronisasi antar perangkat.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoreLoading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {restoreFile ? "Ganti File Backup" : "Pilih File Backup (ZIP)"}
                </Button>

                {restoreFile && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Archive className="h-4 w-4 text-primary" />
                        <span className="font-medium">{restoreFile.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRestoreFile(null);
                          setRestoreMeta(null);
                          setRestoreResult(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ukuran: {(restoreFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    {restoreMeta && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Tanggal backup:</span>{" "}
                          <span className="font-medium">
                            {new Date(restoreMeta.createdAt).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total data:</span>{" "}
                          <span className="font-medium">{restoreMeta.totalRecords} record</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Foto:</span>{" "}
                          <span className="font-medium">{restoreMeta.photoCount} file</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Versi:</span>{" "}
                          <span className="font-medium">{restoreMeta.version}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {restoreLoading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{restoreStatus}</span>
                    <span className="font-medium">{Math.round(restoreProgress)}%</span>
                  </div>
                  <Progress value={restoreProgress} className="h-2" />
                </div>
              )}

              {restoreResult && !restoreLoading && (
                <div
                  className={`rounded-lg border p-4 ${
                    restoreResult.success
                      ? "border-success/30 bg-success/5"
                      : "border-destructive/30 bg-destructive/5"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-semibold ${
                      restoreResult.success ? "text-success" : "text-destructive"
                    }`}
                  >
                    {restoreResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {restoreResult.success ? "Sync Berhasil" : "Sync Gagal"}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{restoreResult.message}</p>
                </div>
              )}

              <Button
                onClick={handleRestore}
                disabled={!restoreFile || restoreLoading}
                className="w-full"
                size="lg"
              >
                {restoreLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Menyinkronkan Data...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Data Sekarang
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Tips Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tips & Catatan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Backup Rutin</h4>
                <ul className="space-y-1">
                  <li>• Lakukan backup secara berkala (minimal mingguan)</li>
                  <li>• Simpan file backup di tempat yang aman</li>
                  <li>• Beri nama file backup dengan tanggal yang jelas</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Sebelum Restore</h4>
                <ul className="space-y-1">
                  <li>• Pastikan backup terbaru sudah diunduh</li>
                  <li>• Beri tahu tim sebelum melakukan restore</li>
                  <li>• Proses restore tidak bisa dibatalkan</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
