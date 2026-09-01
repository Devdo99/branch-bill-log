import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MessageSquare,
  Search,
  Send,
  Image as ImgIcon,
  FileText,
  RefreshCw,
  WifiOff,
  CheckCircle2,
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  Paperclip,
  Smile,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: "text" | "image" | "video" | "document" | "audio" | "sticker" | "contact" | "location" | "protocol";
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  isFromMe: boolean;
  chatJid: string;
}

interface Chat {
  jid: string;
  name: string;
  lastMessage: ChatMessage;
  unreadCount: number;
  messageCount: number;
}

type ConnectionState = "offline" | "disconnected" | "connecting" | "connected";

// ── Helpers ────────────────────────────────────────────────────────
const GATEWAY_URL = "http://localhost:5000";

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 2 * dayMs) return "Kemarin";
  if (diff < 7 * dayMs) {
    return d.toLocaleDateString("id-ID", { weekday: "short" });
  }
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMessageTime(ts: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────
export default function ManagerWhatsAppChat() {
  const [status, setStatus] = useState<ConnectionState>("offline");
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // ── Check gateway status ──
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/status`);
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setStatus(data.status);
    } catch {
      setStatus("offline");
    }
  }, []);

  // ── Load chats ──
  const loadChats = useCallback(async () => {
    if (status !== "connected") {
      setLoadingChats(false);
      return;
    }
    try {
      const res = await fetch(`${GATEWAY_URL}/api/chats`);
      if (!res.ok) throw new Error("Gagal memuat chat");
      const data = await res.json();
      setChats(data.chats || []);
    } catch (err: any) {
      console.error("Load chats error:", err);
    } finally {
      setLoadingChats(false);
    }
  }, [status]);

  // ── Refresh chats from server ──
  const refreshChats = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/refresh-chats`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal refresh chat");
      const data = await res.json();
      setChats(data.chats || []);
      toast.success(`Berhasil memuat ${data.loaded || 0} chat dari server`);
    } catch (err: any) {
      toast.error(err.message || "Gagal refresh chat");
    } finally {
      setLoadingChats(false);
    }
  };

  // ── Load messages for selected chat ──
  const loadMessages = useCallback(async (jid: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/messages/${encodeURIComponent(jid)}?limit=100`);
      if (!res.ok) throw new Error("Gagal memuat pesan");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Load messages error:", err);
      toast.error("Gagal memuat pesan");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Polling ──
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  useEffect(() => {
    if (status === "connected") {
      loadChats();
      const interval = setInterval(loadChats, 10000);
      return () => clearInterval(interval);
    }
  }, [status, loadChats]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Select chat ──
  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
    setShowMobileChat(true);
    loadMessages(chat.jid);
    setTimeout(() => replyInputRef.current?.focus(), 100);
  };

  // ── Send reply ──
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedChat) return;
    setSending(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jid: selectedChat.jid,
          message: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim");

      // Add to local messages immediately
      const newMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        from: "me",
        to: selectedChat.jid,
        body: replyText.trim(),
        timestamp: Date.now(),
        type: "text",
        mediaUrl: null,
        mediaType: null,
        caption: null,
        isFromMe: true,
        chatJid: selectedChat.jid,
      };
      setMessages((prev) => [...prev, newMsg]);
      setReplyText("");
      toast.success("Pesan terkirim!");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  // ── Filtered chats ──
  const filteredChats = chats.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q) ||
      (c.lastMessage?.body || "").toLowerCase().includes(q)
    );
  });

  // ── Render message bubble ──
  const renderMessage = (msg: ChatMessage, prevMsg: ChatMessage | null) => {
    const isMe = msg.isFromMe;
    const showTime = !prevMsg || prevMsg.isFromMe !== msg.isFromMe ||
      msg.timestamp - prevMsg.timestamp > 300000; // 5 min gap

    return (
      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[75%] ${isMe ? "ml-12" : "mr-12"}`}>
          {/* Date separator */}
          {showTime && (
            <div className={`text-[10px] text-muted-foreground my-2 ${isMe ? "text-right" : "text-left"}`}>
              {formatMessageTime(msg.timestamp)}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`relative rounded-lg px-3 py-2 text-sm ${
              isMe
                ? "bg-success/10 text-foreground rounded-tr-sm"
                : "bg-card border border-border text-foreground rounded-tl-sm"
            }`}
          >
            {/* Media */}
            {msg.type === "image" && (
              <div className="mb-2 cursor-pointer" onClick={() => setImagePreview(msg.chatJid + msg.id)}>
                <div className="relative w-full max-w-[280px] rounded-md overflow-hidden bg-muted">
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                    <ImgIcon className="h-8 w-8 mr-2" /> Gambar
                  </div>
                </div>
                {msg.caption && <p className="mt-1 text-xs">{msg.caption}</p>}
              </div>
            )}

            {msg.type === "document" && (
              <div className="flex items-center gap-2 mb-1 p-2 rounded bg-muted/50">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <span className="text-xs truncate">{msg.body || "Document"}</span>
              </div>
            )}

            {msg.type === "sticker" && (
              <div className="mb-1">
                <span className="text-2xl">🎨</span>
              </div>
            )}

            {msg.type === "location" && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📍</span>
                <span className="text-xs">Location</span>
              </div>
            )}

            {/* Text body */}
            {msg.body && msg.type !== "image" && msg.type !== "document" && (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
            )}

            {/* Read receipt */}
            {isMe && (
              <span className="absolute -bottom-1 right-1 text-[9px] text-success">
                ✓✓
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Not connected state ──
  if (status !== "connected") {
    return (
      <AppShell title="WhatsApp Chat">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          {status === "offline" ? (
            <>
              <WifiOff className="h-12 w-12 text-destructive" />
              <h2 className="text-lg font-semibold">Gateway WhatsApp Offline</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Server WhatsApp Gateway tidak aktif. Jalankan server backend terlebih dahulu
                dari halaman <strong>WhatsApp Gateway</strong> di menu Pengaturan.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/manager/whatsapp"}>
                <RefreshCw className="h-4 w-4 mr-2" /> Buka Pengaturan Gateway
              </Button>
            </>
          ) : (
            <>
              <RefreshCw className="h-12 w-12 text-warning animate-spin" />
              <h2 className="text-lg font-semibold">Menghubungkan...</h2>
              <p className="text-sm text-muted-foreground">
                Menunggu koneksi WhatsApp Gateway...
              </p>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="WhatsApp Chat">
      <div className="flex h-[calc(100vh-12rem)] rounded-lg border overflow-hidden bg-card">
        {/* ── Left Panel: Chat List ── */}
        <div className={`w-full md:w-[340px] border-r flex flex-col ${showMobileChat ? "hidden md:flex" : "flex"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm">Chat</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {chats.length} percakapan
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={refreshChats}
                disabled={loadingChats}
                title="Muat ulang chat"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingChats ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari chat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Chat list */}
          <ScrollArea className="flex-1">
            {loadingChats ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 bg-muted rounded" />
                      <div className="h-2.5 w-36 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title="Tidak ada chat"
                description={searchQuery ? "Tidak ditemukan chat yang cocok" : "Belum ada percakapan"}
                compact
              />
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.jid}
                  onClick={() => handleSelectChat(chat)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 ${
                    selectedChat?.jid === chat.jid ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {getInitials(chat.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{chat.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(chat.lastMessage?.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.lastMessage?.isFromMe && (
                          <span className="text-success">✓ </span>
                        )}
                        {chat.lastMessage?.type === "image"
                          ? "📷 Gambar"
                          : chat.lastMessage?.type === "document"
                          ? "📎 Dokumen"
                          : chat.lastMessage?.body || "Pesan"}
                      </p>
                      {chat.unreadCount > 0 && (
                        <Badge className="h-5 min-w-5 px-1 text-[10px] bg-success text-success-foreground">
                          {chat.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* ── Right Panel: Messages ── */}
        <div className={`flex-1 flex flex-col ${showMobileChat ? "flex" : "hidden md:flex"}`}>
          {selectedChat ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-8 w-8 p-0"
                  onClick={() => setShowMobileChat(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {getInitials(selectedChat.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{selectedChat.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedChat.messageCount} pesan
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages area */}
              <ScrollArea className="flex-1 bg-[#e5ddd5]/30 dark:bg-muted/20">
                <div className="px-4 py-3 space-y-0.5">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                      Belum ada pesan
                    </div>
                  ) : (
                    <>
                      {/* Encryption notice */}
                      <div className="flex justify-center mb-4">
                        <div className="bg-warning/10 border border-warning/20 rounded-md px-3 py-1.5 text-[10px] text-warning text-center">
                          🔒 Pesan terenkripsi end-to-end
                        </div>
                      </div>
                      {messages.map((msg, idx) =>
                        renderMessage(msg, idx > 0 ? messages[idx - 1] : null)
                      )}
                    </>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply input */}
              <div className="px-4 py-3 border-t bg-card">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground shrink-0">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground shrink-0">
                    <Smile className="h-4 w-4" />
                  </Button>
                  <Input
                    ref={replyInputRef}
                    placeholder="Ketik pesan..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    className="flex-1 h-9 text-sm"
                    disabled={sending}
                  />
                  <Button
                    size="sm"
                    className="h-9 w-9 p-0 bg-success text-success-foreground hover:bg-success/90 shrink-0"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* No chat selected */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">WhatsApp Chat</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Pilih percakapan dari daftar di sebelah kiri untuk mulai melihat dan membalas pesan.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span>Gateway terhubung • {chats.length} percakapan aktif</span>
              </div>
              {chats.length === 0 && (
                <Button variant="outline" size="sm" onClick={refreshChats} disabled={loadingChats}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingChats ? "animate-spin" : ""}`} />
                  Muat Ulang Chat
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setImagePreview(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="bg-card rounded-lg p-4 max-w-lg w-full text-center">
            <ImgIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Gambar akan dimuat dari server</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
