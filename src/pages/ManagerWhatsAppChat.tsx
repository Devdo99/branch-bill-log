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
  Power,
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

/** Build URL for media proxy */
function mediaUrl(jid: string, msgId: string) {
  return `${GATEWAY_URL}/api/media/${encodeURIComponent(jid)}/${msgId}`;
}

/** Check if JID is a group */
function isGroupJid(jid: string) {
  return jid.endsWith("@g.us");
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
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const lastMsgTimestampRef = useRef<number>(0);

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
    } catch (err: unknown) {
      console.error("Load chats error:", err);
    } finally {
      setLoadingChats(false);
    }
  }, [status]);

  // ── Fetch full history from WhatsApp server ──
  const fetchHistory = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/fetch-history`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal fetch history");
      const data = await res.json();
      setChats(data.chats || []);
      toast.success(`History dimuat: ${data.chatCount} chat, ${data.contactCount} kontak`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal fetch history");
    } finally {
      setLoadingChats(false);
    }
  };

  // ── Refresh chats from server ──
  const refreshChats = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/refresh-chats`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal refresh chat");
      const data = await res.json();
      setChats(data.chats || []);
      toast.success(`Berhasil memuat ${data.loaded || 0} chat dari server`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal refresh chat");
    } finally {
      setLoadingChats(false);
    }
  };

  // ── Force reconnect (triggers fresh history sync) ──
  const handleReconnect = async () => {
    if (!confirm("Reconnect akan memutus koneksi dan meminta scan QR ulang. Lanjutkan?")) return;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/reconnect`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal reconnect");
      toast.info("Sedang reconnect... Scan QR code baru akan muncul");
      setStatus("disconnected");
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal reconnect");
    }
  };

  // ── Load messages for selected chat ──
  const loadMessages = useCallback(async (jid: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/messages/${encodeURIComponent(jid)}?limit=200`);
      if (!res.ok) throw new Error("Gagal memuat pesan");
      const data = await res.json();
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs.length > 0) {
        lastMsgTimestampRef.current = msgs[msgs.length - 1].timestamp;
      }
    } catch (err: unknown) {
      console.error("Load messages error:", err);
      toast.error("Gagal memuat pesan");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Polling: status + chats ──
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

  // ── Polling: new messages in selected chat ──
  useEffect(() => {
    if (!selectedChat) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${GATEWAY_URL}/api/messages/${encodeURIComponent(selectedChat.jid)}?limit=200`
        );
        if (!res.ok) return;
        const data = await res.json();
        const msgs = data.messages || [];
        // Only update if there are new messages
        if (msgs.length > 0 && msgs[msgs.length - 1].timestamp > lastMsgTimestampRef.current) {
          // Merge: keep local pending messages, replace with server data
          setMessages((prev) => {
            const pending = prev.filter((m) => m.id.startsWith("local-"));
            const serverIds = new Set(msgs.map((m: ChatMessage) => m.id));
            // Keep pending msgs not yet confirmed by server
            const stillPending = pending.filter((m) => !serverIds.has(m.id));
            return [...msgs, ...stillPending];
          });
          lastMsgTimestampRef.current = msgs[msgs.length - 1].timestamp;
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedChat]);

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
      lastMsgTimestampRef.current = newMsg.timestamp;
      setReplyText("");

      // Update chat list: move this chat to top with the new last message
      setChats((prev) => {
        const updated = prev.map((c) =>
          c.jid === selectedChat.jid
            ? { ...c, lastMessage: newMsg, messageCount: c.messageCount + 1 }
            : c
        );
        // Sort by last message timestamp descending
        updated.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        return updated;
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  // ── Open image preview ──
  const handleImagePreview = (jid: string, msgId: string) => {
    setImageLoading(true);
    setImagePreviewUrl(mediaUrl(jid, msgId));
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
    const showTime =
      !prevMsg ||
      prevMsg.isFromMe !== msg.isFromMe ||
      msg.timestamp - prevMsg.timestamp > 300000; // 5 min gap
    const isPending = msg.id.startsWith("local-");

    return (
      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[75%] ${isMe ? "ml-12" : "mr-12"}`}>
          {/* Date separator */}
          {showTime && (
            <div
              className={`text-[10px] text-muted-foreground my-2 ${isMe ? "text-right" : "text-left"}`}
            >
              {formatMessageTime(msg.timestamp)}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`relative rounded-lg px-3 py-2 text-sm ${
              isMe
                ? "bg-success/10 text-foreground rounded-tr-sm"
                : "bg-card border border-border text-foreground rounded-tl-sm"
            } ${isPending ? "opacity-70" : ""}`}
          >
            {/* Group sender name */}
            {!isMe && isGroupJid(msg.chatJid) && msg.from && (
              <p className="text-[10px] font-semibold text-primary mb-0.5">
                {msg.from.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "")}
              </p>
            )}

            {/* Image */}
            {msg.type === "image" && (
              <div className="mb-2 cursor-pointer" onClick={() => handleImagePreview(msg.chatJid, msg.id)}>
                <div className="relative w-full max-w-[280px] rounded-md overflow-hidden bg-muted">
                  <img
                    src={mediaUrl(msg.chatJid, msg.id)}
                    alt="Gambar"
                    className="w-full h-auto max-h-[300px] object-cover rounded-md"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback: show icon placeholder on error
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent) {
                        const fallback = document.createElement("div");
                        fallback.className = "flex items-center justify-center h-32 text-muted-foreground text-xs";
                        fallback.innerHTML = '<svg class="h-8 w-8 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> Gambar';
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                </div>
                {msg.caption && <p className="mt-1 text-xs">{msg.caption}</p>}
              </div>
            )}

            {/* Document */}
            {msg.type === "document" && (
              <div
                className="flex items-center gap-2 mb-1 p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => {
                  window.open(mediaUrl(msg.chatJid, msg.id), "_blank");
                }}
              >
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <span className="text-xs truncate">{msg.body || "Document"}</span>
              </div>
            )}

            {/* Audio */}
            {msg.type === "audio" && (
              <div className="mb-1">
                <audio controls preload="none" className="h-8 max-w-[250px]">
                  <source src={mediaUrl(msg.chatJid, msg.id)} />
                </audio>
              </div>
            )}

            {/* Video */}
            {msg.type === "video" && (
              <div className="mb-2">
                <video
                  controls
                  preload="none"
                  className="w-full max-w-[280px] rounded-md"
                >
                  <source src={mediaUrl(msg.chatJid, msg.id)} />
                </video>
                {msg.caption && <p className="mt-1 text-xs">{msg.caption}</p>}
              </div>
            )}

            {/* Sticker */}
            {msg.type === "sticker" && (
              <div className="mb-1">
                <img
                  src={mediaUrl(msg.chatJid, msg.id)}
                  alt="Sticker"
                  className="h-24 w-24 object-contain"
                  loading="lazy"
                />
              </div>
            )}

            {/* Location */}
            {msg.type === "location" && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📍</span>
                <span className="text-xs">Location</span>
              </div>
            )}

            {/* Contact */}
            {msg.type === "contact" && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">👤</span>
                <span className="text-xs">{msg.body}</span>
              </div>
            )}

            {/* Text body */}
            {msg.body && msg.type !== "image" && msg.type !== "document" && msg.type !== "video" && msg.type !== "audio" && msg.type !== "sticker" && (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
            )}

            {/* Read receipt */}
            {isMe && (
              <span className={`absolute -bottom-1 right-1 text-[9px] ${isPending ? "text-muted-foreground" : "text-success"}`}>
                {isPending ? "🕐" : "✓✓"}
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
              <Button variant="outline" onClick={() => (window.location.href = "/manager/whatsapp")}>
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
        <div
          className={`w-full md:w-[340px] border-r flex flex-col ${
            showMobileChat ? "hidden md:flex" : "flex"
          }`}
        >
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
              <Button
                variant="ghost"
                size="sm"
                className="h-7 p-0 text-[10px] gap-1"
                onClick={fetchHistory}
                title="Muat semua chat dari WhatsApp"
              >
                <MessageSquare className="h-3 w-3" />
                <span className="hidden lg:inline">Load All</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={handleReconnect}
                title="Reconnect (scan QR ulang)"
              >
                <Power className="h-3.5 w-3.5" />
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
                    selectedChat?.jid === chat.jid
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : ""
                  }`}
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {isGroupJid(chat.jid) ? "👥" : getInitials(chat.name)}
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
                        {chat.lastMessage?.isFromMe && <span className="text-success">✓ </span>}
                        {chat.lastMessage?.type === "image"
                          ? "📷 Gambar"
                          : chat.lastMessage?.type === "document"
                          ? "📎 Dokumen"
                          : chat.lastMessage?.type === "audio"
                          ? "🎤 Audio"
                          : chat.lastMessage?.type === "video"
                          ? "🎬 Video"
                          : chat.lastMessage?.type === "sticker"
                          ? "🎨 Stiker"
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
                  {isGroupJid(selectedChat.jid) ? "👥" : getInitials(selectedChat.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{selectedChat.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isGroupJid(selectedChat.jid) ? "Grup" : "WhatsApp"} • {selectedChat.messageCount} pesan
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground shrink-0"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground shrink-0"
                  >
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
                  Pilih percakapan dari daftar di sebelah kiri untuk mulai melihat dan membalas
                  pesan.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span>Gateway terhubung • {chats.length} percakapan aktif</span>
              </div>
              {chats.length === 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loadingChats}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Load Semua Chat
                  </Button>
                  <Button variant="ghost" size="sm" onClick={refreshChats} disabled={loadingChats}>
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1 ${loadingChats ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {imagePreviewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => {
            setImagePreviewUrl(null);
            setImageLoading(false);
          }}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            onClick={() => {
              setImagePreviewUrl(null);
              setImageLoading(false);
            }}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {imageLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            )}
            <img
              src={imagePreviewUrl}
              alt="Preview"
              className={`w-full h-auto max-h-[80vh] object-contain rounded-lg ${imageLoading ? "hidden" : ""}`}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                toast.error("Gagal memuat gambar");
              }}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
