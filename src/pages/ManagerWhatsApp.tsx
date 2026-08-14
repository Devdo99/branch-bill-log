import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  MessageSquare, 
  QrCode, 
  Power, 
  LogOut, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  WifiOff, 
  Send 
} from "lucide-react";

type ConnectionState = "offline" | "disconnected" | "connecting" | "connected";

export default function ManagerWhatsApp() {
  const [status, setStatus] = useState<ConnectionState>("offline");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [spawning, setSpawning] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  
  // Test message form
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Halo, ini adalah pesan tes dari WhatsApp Gateway aplikasi NotaKu!");
  const [sendingTest, setSendingTest] = useState(false);

  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const checkStatus = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/status");
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setStatus(data.status);
      setQrCode(data.qr);
    } catch (err) {
      setStatus("offline");
      setQrCode(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSpawn = async () => {
    setSpawning(true);
    try {
      const res = await fetch("/api/spawn-whatsapp", { method: "POST" });
      if (!res.ok) throw new Error("Gagal memicu server");
      toast.success("Memicu server WhatsApp backend...");
      setTimeout(checkStatus, 2000);
    } catch (err: any) {
      toast.error(err.message || "Gagal menyalakan server");
    } finally {
      setSpawning(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Apakah Anda yakin ingin memutuskan koneksi? Sesi masuk akan dihapus.")) return;
    setLoggingOut(true);
    try {
      const res = await fetch("http://localhost:5000/api/logout", { method: "POST" });
      if (!res.ok) throw new Error("Gagal logout");
      toast.success("Koneksi diputuskan. Sesi telah dihapus.");
      checkStatus();
    } catch (err: any) {
      toast.error(err.message || "Gagal memutuskan koneksi");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/connect", { method: "POST" });
      if (!res.ok) throw new Error("Gagal menginisialisasi");
      toast.success("Memulai koneksi Baileys...");
      checkStatus();
    } catch (err: any) {
      toast.error(err.message || "Gagal menghubungkan");
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Nomor HP tujuan harus diisi");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("http://localhost:5000/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim pesan");
      toast.success("Pesan tes berhasil dikirim!");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim pesan tes");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <AppShell title="WhatsApp Gateway">
      <div className="space-y-6">
        {/* Status Panel */}
        <div className="app-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`grid h-12 w-12 place-items-center rounded-md ${
              status === "connected" 
                ? "bg-success/10 text-success" 
                : status === "offline"
                ? "bg-destructive/10 text-destructive"
                : "bg-warning-bg text-warning"
            }`}>
              {status === "connected" && <CheckCircle2 className="h-6 w-6" />}
              {status === "offline" && <WifiOff className="h-6 w-6" />}
              {(status === "disconnected" || status === "connecting") && <RefreshCw className="h-6 w-6 animate-spin" />}
            </div>
            <div>
              <h2 className="font-semibold text-lg">Status Gateway WhatsApp</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                  status === "connected" ? "bg-success animate-pulse" : status === "offline" ? "bg-destructive" : "bg-warning animate-pulse"
                }`} />
                <span className="text-sm font-medium">
                  {status === "connected" && "Terhubung (Online)"}
                  {status === "offline" && "Server Mati (Offline)"}
                  {status === "connecting" && "Menghubungkan..."}
                  {status === "disconnected" && "Terputus (Memerlukan Pemindaian QR)"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 max-w-xl">
                {status === "connected" && "Sistem gateway aktif. Pesan rincian tagihan akan dikirim di latar belakang secara otomatis."}
                {status === "offline" && "Server backend lokal tidak merespon. Jalankan server secara manual atau gunakan tombol pemicu di sebelah kanan."}
                {status === "connecting" && "Sedang menginisialisasi pustaka Baileys dan memproses sesi yang tersimpan."}
                {status === "disconnected" && "Silakan pindai QR Code di bawah untuk menautkan perangkat WhatsApp Anda."}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            {status === "offline" && isLocalhost && (
              <Button onClick={handleSpawn} disabled={spawning} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Power className="h-4 w-4 mr-2" />
                {spawning ? "Mengaktifkan..." : "Aktifkan Server WhatsApp"}
              </Button>
            )}
            {status === "disconnected" && !qrCode && (
              <Button onClick={handleConnect} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" /> Hubungkan
              </Button>
            )}
            {status === "connected" && (
              <Button onClick={handleLogout} disabled={loggingOut} variant="destructive">
                <LogOut className="h-4 w-4 mr-2" />
                {loggingOut ? "Mengeluarkan..." : "Putuskan Koneksi / Keluar"}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code and Instructions */}
        {status === "disconnected" && qrCode && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="app-card p-6 flex flex-col items-center justify-center text-center">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" /> Pindai Kode QR
              </h3>
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64 object-contain" />
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Kode QR diperbarui otomatis. Pindai sebelum kode kedaluwarsa.
              </p>
            </div>

            <div className="app-card p-6">
              <h3 className="font-semibold mb-4">Langkah Menghubungkan:</h3>
              <ol className="space-y-4 text-sm text-muted-foreground list-decimal pl-4">
                <li>
                  Buka aplikasi <strong>WhatsApp</strong> di HP Anda.
                </li>
                <li>
                  Ketuk menu <strong>Titik Tiga</strong> di pojok kanan atas (Android) atau <strong>Pengaturan</strong> di pojok kanan bawah (iOS).
                </li>
                <li>
                  Pilih menu <strong>Perangkat Tertaut (Linked Devices)</strong>.
                </li>
                <li>
                  Ketuk tombol <strong>Tautkan Perangkat (Link a Device)</strong>.
                </li>
                <li>
                  Arahkan kamera HP Anda ke <strong>QR Code</strong> di layar sebelah kiri.
                </li>
                <li>
                  Tunggu hingga proses sinkronisasi selesai dan status di atas berubah menjadi <strong>Terhubung</strong>.
                </li>
              </ol>
              
              <div className="mt-6 p-4 rounded-md bg-accent/60 border border-accent flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-accent-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-accent-foreground/90">
                  <strong>Catatan Sesi:</strong> Sesi masuk Anda akan disimpan di folder <code>backend/auth_session/</code>. Setelah terhubung sekali, Anda tidak perlu mengulang proses pemindaian QR ini meskipun komputer dimatikan atau aplikasi dimulai ulang.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Informational State: Connecting */}
        {status === "connecting" && (
          <div className="app-card p-12 text-center flex flex-col items-center justify-center">
            <RefreshCw className="h-10 w-10 text-primary animate-spin mb-4" />
            <h3 className="font-semibold text-lg">Menghubungkan ke WhatsApp...</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Sistem sedang mencoba mengautentikasi menggunakan sesi tersimpan. Harap tunggu beberapa saat.
            </p>
          </div>
        )}

        {/* Informational State: Offline */}
        {status === "offline" && (
          <div className="app-card p-12 text-center flex flex-col items-center justify-center">
            <WifiOff className="h-10 w-10 text-destructive mb-4" />
            <h3 className="font-semibold text-lg">Server Backend Offline</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              WhatsApp Gateway backend server belum aktif pada <code>http://localhost:5000</code>.
            </p>
            {isLocalhost ? (
              <Button onClick={handleSpawn} disabled={spawning} className="mt-6">
                <Power className="h-4 w-4 mr-2" />
                {spawning ? "Mengaktifkan..." : "Aktifkan Server WhatsApp"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground mt-4">
                Hubungi administrator Anda untuk menjalankan server WhatsApp Gateway pada mesin lokal server.
              </p>
            )}
          </div>
        )}

        {/* Test Message Panel */}
        {status === "connected" && (
          <div className="app-card p-6">
            <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Kirim Pesan Tes
            </h3>
            <form onSubmit={handleSendTest} className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <Label htmlFor="test_phone">Nomor HP Tujuan (Format Internasional)</Label>
                <Input 
                  id="test_phone" 
                  value={testPhone} 
                  onChange={(e) => setTestPhone(e.target.value)} 
                  placeholder="Contoh: 628123456789" 
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Gunakan kode negara (misal 62 untuk Indonesia). Jangan gunakan tanda "+" atau spasi.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="test_msg">Isi Pesan</Label>
                <textarea 
                  id="test_msg" 
                  value={testMessage} 
                  onChange={(e) => setTestMessage(e.target.value)} 
                  rows={3} 
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>

              <Button type="submit" disabled={sendingTest}>
                <Send className="h-4 w-4 mr-2" />
                {sendingTest ? "Mengirim..." : "Kirim Pesan Tes"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}
