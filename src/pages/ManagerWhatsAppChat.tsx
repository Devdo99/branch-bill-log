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
interface QuotedMessage {
  body: string;
  type: string;
  participant: string | null;
}

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
  quotedMessage: QuotedMessage | null;
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

/** Build a JID → display-name map from the contacts/map endpoint */
function useContactMap(status: ConnectionState) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/api/contacts/map`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.map) setMap(data.map);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [status]);
  return map;
}

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
  const [pendingFiles, setPendingFiles] = useState<{ file: File; dataUrl: string; preview: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState<ChatMessage | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null);

  const contactMap = useContactMap(status);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSearchRef = useRef<HTMLInputElement>(null);
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

  // ── Cancel reply ──
  const cancelReply = () => setReplyToMsg(null);

  // ── Send reply (text + optional media) ──
  const handleSendReply = async () => {
    if ((!replyText.trim() && pendingFiles.length === 0) || !selectedChat) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        jid: selectedChat.jid,
        message: replyText.trim() || (pendingFiles.length > 0 ? " " : ""),
      };
      // Attach media data URIs
      if (pendingFiles.length > 0) {
        body.media = pendingFiles.map((f) => f.dataUrl);
      }
      // Attach reply context
      if (replyToMsg) {
        body.quotedMsgId = replyToMsg.id;
      }
      const res = await fetch(`${GATEWAY_URL}/api/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim");

      // Determine the type of the first media for display
      const hasMedia = pendingFiles.length > 0;
      const firstFile = pendingFiles[0]?.file;
      let msgType: ChatMessage["type"] = "text";
      let mediaTypeVal: string | null = null;
      if (hasMedia && firstFile) {
        if (firstFile.type.startsWith("image/")) { msgType = "image"; mediaTypeVal = "image"; }
        else if (firstFile.type.startsWith("video/")) { msgType = "video"; mediaTypeVal = "video"; }
        else if (firstFile.type.startsWith("audio/")) { msgType = "audio"; mediaTypeVal = "audio"; }
        else { msgType = "document"; mediaTypeVal = "document"; }
      }

      // Add to local messages immediately
      const newMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        from: "me",
        to: selectedChat.jid,
        body: replyText.trim() || (hasMedia ? (firstFile?.name || "Media") : ""),
        timestamp: Date.now(),
        type: msgType,
        mediaUrl: hasMedia ? pendingFiles[0]?.dataUrl || null : null,
        mediaType: mediaTypeVal,
        caption: replyText.trim() || null,
        isFromMe: true,
        chatJid: selectedChat.jid,
        quotedMessage: replyToMsg ? {
          body: replyToMsg.body || (replyToMsg.type === "image" ? "[Gambar]" : replyToMsg.type === "video" ? "[Video]" : "[Pesan]"),
          type: replyToMsg.type,
          participant: replyToMsg.from,
        } : null,
      };
      setMessages((prev) => [...prev, newMsg]);
      lastMsgTimestampRef.current = newMsg.timestamp;
      setReplyText("");
      setPendingFiles([]);
      setReplyToMsg(null);

      // Update chat list: move this chat to top with the new last message
      setChats((prev) => {
        const updated = prev.map((c) =>
          c.jid === selectedChat.jid
            ? { ...c, lastMessage: newMsg, messageCount: c.messageCount + 1 }
            : c
        );
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

  // ── File upload helpers ──
  const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB per file
  const MAX_FILES = 5;

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, MAX_FILES - pendingFiles.length);
    for (const file of arr) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} terlalu besar (maks 16MB)`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        const preview = isImage ? dataUrl : isVideo ? "" : "";
        setPendingFiles((prev) => [...prev, { file, dataUrl, preview }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Drag and drop ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // ── Resolve name from JID for display ──
  const resolveName = useCallback((jid: string) => {
    if (!jid) return jid;
    // 1) Check the contact map from backend (most reliable)
    if (contactMap[jid]) return contactMap[jid];
    // 2) Check the chats list for a matching name
    const chatEntry = chats.find((c) => c.jid === jid);
    if (chatEntry && chatEntry.name && !chatEntry.name.startsWith(jid.split("@")[0])) return chatEntry.name;
    // 3) Strip JID suffix as last resort
    return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "") || jid;
  }, [contactMap, chats]);

  // ── Start reply on message click ──
  const handleStartReply = (msg: ChatMessage) => {
    setReplyToMsg(msg);
    setTimeout(() => replyInputRef.current?.focus(), 100);
  };

  // ── Context menu (right-click / long-press) ──
  const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ msg, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // ── Delete message ──
  const handleDeleteMessage = async (msg: ChatMessage) => {
    setContextMenu(null);
    if (!confirm("Hapus pesan ini?")) return;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/delete-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: msg.chatJid, msgId: msg.id, forMe: msg.isFromMe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      toast.success("Pesan dihapus");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus pesan");
    }
  };

  // ── Copy message text ──
  const handleCopyMessage = (msg: ChatMessage) => {
    setContextMenu(null);
    navigator.clipboard.writeText(msg.body || "");
    toast.success("Teks disalin");
  };

  // ── Format full date for separators ──
  const formatDateSeparator = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const dayMs = 86400000;
    const diff = now.getTime() - d.getTime();
    if (diff < dayMs && now.getDate() === d.getDate()) return "Hari ini";
    if (diff < 2 * dayMs) return "Kemarin";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };

  const shouldShowDateSeparator = (msg: ChatMessage, prevMsg: ChatMessage | null) => {
    if (!prevMsg) return true;
    const d1 = new Date(prevMsg.timestamp);
    const d2 = new Date(msg.timestamp);
    return d1.getFullYear() !== d2.getFullYear() || d1.getMonth() !== d2.getMonth() || d1.getDate() !== d2.getDate();
  };

  // ── Filtered messages by search ──
  const filteredMessages = chatSearchQuery
    ? messages.filter((m) => (m.body || "").toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : messages;

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
    const showDate = shouldShowDateSeparator(msg, prevMsg);
    const isPending = msg.id.startsWith("local-");

    const handleQuotedClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleStartReply(msg);
    };

    return (
      <div key={msg.id}>
      {/* Date separator */}
      {showDate && (
        <div className="flex justify-center my-3">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-full px-3 py-1 text-[10px] text-muted-foreground">
            {formatDateSeparator(msg.timestamp)}
          </div>
        </div>
      )}
      <div
        className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1 group/msg cursor-pointer`}
        onContextMenu={(e) => handleContextMenu(e, msg)}
        onClick={() => handleStartReply(msg)}
      >
        <div className={`max-w-[75%] ${isMe ? "ml-12" : "mr-12"}`}>
          {/* Local media preview for sent messages */}
          {isMe && msg.mediaUrl && msg.type === "image" && (
            <div className="mb-1">
              <img
                src={msg.mediaUrl}
                alt="Sent"
                className="w-full max-w-[250px] rounded-md object-cover"
                loading="lazy"
              />
            </div>
          )}
          {isMe && msg.mediaUrl && msg.type === "video" && (
            <div className="mb-1">
              <video controls preload="none" className="w-full max-w-[250px] rounded-md">
                <source src={msg.mediaUrl} />
              </video>
            </div>
          )}
          {isMe && msg.mediaUrl && msg.type === "audio" && (
            <div className="mb-1">
              <audio controls preload="none" className="h-8 max-w-[250px]">
                <source src={msg.mediaUrl} />
              </audio>
            </div>
          )}
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
            {/* Quoted message */}
            {msg.quotedMessage && (
              <div className="mb-1 px-2 py-1 rounded bg-primary/5 border-l-2 border-primary/30 cursor-pointer">
                <p className="text-[10px] font-semibold text-primary">
                  {msg.quotedMessage.participant
                    ? resolveName(msg.quotedMessage.participant)
                    : "Anda"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {msg.quotedMessage.type !== "text" && (
                    <span className="mr-1">
                      {msg.quotedMessage.type === "image" ? "📷" : msg.quotedMessage.type === "video" ? "🎬" : msg.quotedMessage.type === "audio" ? "🎤" : "📎"}
                    </span>
                  )}
                  {msg.quotedMessage.body || "Pesan"}
                </p>
              </div>
            )}
            {/* Group sender name */}
            {!isMe && isGroupJid(msg.chatJid) && msg.from && (
              <p className="text-[10px] font-semibold text-primary mb-0.5">
                {resolveName(msg.from)}
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
      <div className="flex h-[calc(100vh-9rem)] sm:h-[calc(100vh-10rem)] rounded-lg border overflow-hidden bg-card shadow-sm">
        {/* ── Left Panel: Chat List ── */}
        <div
          className={`w-full md:w-[340px] lg:w-[380px] border-r flex flex-col ${
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
                    {isGroupJid(chat.jid) ? "👥" : getInitials(resolveName(chat.jid) || chat.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{resolveName(chat.jid) || chat.name}</span>
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
              <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card/95 backdrop-blur sticky top-0 z-10">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-8 w-8 p-0"
                  onClick={() => setShowMobileChat(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {isGroupJid(selectedChat.jid) ? "👥" : getInitials(resolveName(selectedChat.jid) || selectedChat.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{resolveName(selectedChat.jid) || selectedChat.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isGroupJid(selectedChat.jid) ? "Grup" : "WhatsApp"} • {selectedChat.messageCount} pesan
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground"
                    onClick={() => {
                      setShowChatSearch(!showChatSearch);
                      if (!showChatSearch) setTimeout(() => chatSearchRef.current?.focus(), 100);
                    }}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Chat search bar */}
              {showChatSearch && (
                <div className="px-4 py-2 border-b bg-card">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      ref={chatSearchRef}
                      placeholder="Cari di percakapan ini..."
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      className="h-8 pl-8 pr-8 text-xs"
                    />
                    {chatSearchQuery && (
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setChatSearchQuery("")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {chatSearchQuery && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {filteredMessages.length} pesan ditemukan
                    </p>
                  )}
                </div>
              )}

              {/* Messages area */}
              <ScrollArea
                className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] bg-repeat dark:bg-muted/10"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Drag overlay */}
                {isDragging && (
                  <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <ImgIcon className="h-10 w-10 text-primary mx-auto mb-2" />
                      <p className="text-sm font-medium text-primary">Lepas file di sini</p>
                    </div>
                  </div>
                )}
                <div className="px-4 py-3 space-y-0.5 relative">
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
                      {!chatSearchQuery && (
                        <div className="flex justify-center mb-4">
                          <div className="bg-warning/10 border border-warning/20 rounded-md px-3 py-1.5 text-[10px] text-warning text-center">
                            🔒 Pesan terenkripsi end-to-end
                          </div>
                        </div>
                      )}
                      {filteredMessages.map((msg, idx) =>
                        renderMessage(msg, idx > 0 ? filteredMessages[idx - 1] : null)
                      )}
                      {chatSearchQuery && filteredMessages.length === 0 && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                          Tidak ditemukan pesan yang cocok
                        </div>
                      )}
                    </>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply input */}
              <div className="px-4 py-3 border-t bg-card">
                {/* Reply-to preview */}
                {replyToMsg && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-md bg-primary/5 border-l-2 border-primary/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-primary">
                        Membalas {replyToMsg.isFromMe ? "diri sendiri" : (selectedChat?.name || "")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {replyToMsg.type !== "text" && (
                          <span className="mr-1">
                            {replyToMsg.type === "image" ? "📷" : replyToMsg.type === "video" ? "🎬" : replyToMsg.type === "audio" ? "🎤" : "📎"}
                          </span>
                        )}
                        {replyToMsg.body || "Pesan"}
                      </p>
                    </div>
                    <button onClick={cancelReply} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {/* Pending files preview */}
                {pendingFiles.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                    {pendingFiles.map((f, idx) => (
                      <div key={idx} className="relative shrink-0">
                        {f.file.type.startsWith("image/") ? (
                          <img
                            src={f.dataUrl}
                            alt={f.file.name}
                            className="h-16 w-16 object-cover rounded-md border"
                          />
                        ) : f.file.type.startsWith("video/") ? (
                          <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center">
                            <Video className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <button
                          onClick={() => removePendingFile(idx)}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-[9px] text-muted-foreground truncate w-16 mt-0.5">
                          {f.file.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    multiple
                    onChange={(e) => {
                      handleFileSelect(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    title="Lampirkan file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    title="Kirim gambar"
                  >
                    <ImgIcon className="h-4 w-4" />
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
                    disabled={(!replyText.trim() && pendingFiles.length === 0) || sending}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[60] bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 flex items-center gap-2"
            onClick={() => handleStartReply(contextMenu.msg)}
          >
            <Send className="h-3.5 w-3.5" />
            Balas
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 flex items-center gap-2"
            onClick={() => handleCopyMessage(contextMenu.msg)}
          >
            <FileText className="h-3.5 w-3.5" />
            Salin teks
          </button>
          <div className="border-t my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
            onClick={() => handleDeleteMessage(contextMenu.msg)}
          >
            <X className="h-3.5 w-3.5" />
            Hapus
          </button>
        </div>
      )}

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
