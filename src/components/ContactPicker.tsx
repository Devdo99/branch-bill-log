import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Users,
  RefreshCw,
  Phone,
  MessageSquare,
  X,
} from "lucide-react";

const GATEWAY_URL = "http://localhost:5000";

interface Contact {
  jid: string;
  name: string;
  lastMessage?: {
    body: string;
    timestamp: number;
    isFromMe: boolean;
  };
}

interface ContactPickerProps {
  /** Callback when a contact is selected, receives the phone number (without @s.whatsapp.net) */
  onSelect: (phone: string, name: string) => void;
  /** Current selected phone number */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the trigger button */
  disabled?: boolean;
}

export default function ContactPicker({
  onSelect,
  value,
  placeholder = "Pilih kontak...",
  disabled = false,
}: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gatewayConnected, setGatewayConnected] = useState(false);

  // Check gateway status
  const checkGateway = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/status`);
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setGatewayConnected(data.status === "connected");
    } catch {
      setGatewayConnected(false);
    }
  }, []);

  // Load contacts from gateway
  const loadContacts = useCallback(async () => {
    if (!gatewayConnected) return;
    setLoading(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/chats`);
      if (!res.ok) throw new Error("Gagal memuat kontak");
      const data = await res.json();
      setContacts(data.chats || []);
    } catch (err: any) {
      console.error("Load contacts error:", err);
      toast.error("Gagal memuat daftar kontak");
    } finally {
      setLoading(false);
    }
  }, [gatewayConnected]);

  useEffect(() => {
    checkGateway();
  }, [checkGateway]);

  useEffect(() => {
    if (open && gatewayConnected) {
      loadContacts();
    }
  }, [open, gatewayConnected, loadContacts]);

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q)
    );
  });

  // Extract phone number from JID
  const getPhoneFromJid = (jid: string): string => {
    return jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  };

  // Format phone for display
  const formatPhone = (phone: string): string => {
    if (phone.startsWith("62")) {
      return "+62 " + phone.slice(2).replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
    }
    return phone;
  };

  // Handle contact selection
  const handleSelect = (contact: Contact) => {
    const phone = getPhoneFromJid(contact.jid);
    onSelect(phone, contact.name);
    setOpen(false);
    setSearchQuery("");
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  };

  // Format time
  const formatTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const dayMs = 86400000;

    if (diff < dayMs && now.getDate() === d.getDate()) {
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 2 * dayMs) return "Kemarin";
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !gatewayConnected}
          className="h-9 gap-2"
          title={!gatewayConnected ? "WhatsApp Gateway tidak aktif" : "Pilih dari kontak WhatsApp"}
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Kontak</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-success" />
            Pilih Kontak WhatsApp
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau nomor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Contact list */}
        <ScrollArea className="h-[400px]">
          {!gatewayConnected ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <Phone className="h-10 w-10 text-destructive" />
              <div>
                <p className="text-sm font-medium">Gateway tidak aktif</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aktifkan WhatsApp Gateway terlebih dahulu
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <Users className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Tidak ada kontak</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery
                    ? "Tidak ditemukan kontak yang cocok"
                    : "Mulai chat di WhatsApp untuk melihat kontak di sini"}
                </p>
              </div>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const phone = getPhoneFromJid(contact.jid);
              const isGroup = contact.jid.includes("@g.us");
              const isSelected = value === phone;

              return (
                <button
                  key={contact.jid}
                  onClick={() => handleSelect(contact)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 ${
                    isSelected ? "bg-success/5" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isGroup
                      ? "bg-primary/10 text-primary"
                      : "bg-success/10 text-success"
                  }`}>
                    {isGroup ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      getInitials(contact.name)
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {contact.name}
                      </span>
                      {contact.lastMessage?.timestamp && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTime(contact.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {formatPhone(phone)}
                      </span>
                      {isGroup && (
                        <span className="text-[10px] text-primary font-medium">
                          Grup
                        </span>
                      )}
                    </div>
                    {contact.lastMessage?.body && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {contact.lastMessage.isFromMe && (
                          <span className="text-success">✓ </span>
                        )}
                        {contact.lastMessage.body}
                      </p>
                    )}
                  </div>

                  {/* Check mark if selected */}
                  {isSelected && (
                    <div className="h-5 w-5 rounded-full bg-success flex items-center justify-center">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2 border-t flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {contacts.length} kontak • Gateway {gatewayConnected ? "✓" : "✗"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={loadContacts}
            disabled={loading || !gatewayConnected}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
