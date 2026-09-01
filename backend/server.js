const express = require('express');
const cors = require('cors');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { google } = require('googleapis');

const app = express();
app.use(cors());
// Limit besar karena payload bisa berisi beberapa gambar base64 (data URI) dari laptop
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5000;
const AUTH_SESSION_DIR = path.join(__dirname, 'auth_session');

let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let latestQr = null;

// In-memory stores (populated from Baileys events)
const chatStore = new Map(); // chatId -> Chat object
const contactStore = new Map(); // contactId -> Contact object

// ── Message Cache (in-memory) ──────────────────────────────────────────
// Menyimpan pesan real-time dari Baileys agar bisa dibaca dari frontend.
// Struktur: Map<chatJid, Array<{ id, from, to, body, timestamp, type, mediaUrl, mediaType, caption, isFromMe }>>
const messageCache = new Map();
const MAX_MESSAGES_PER_CHAT = 200;
const MAX_CHATS = 200;

function cacheMessage(msg) {
  if (!msg || !msg.key || !msg.key.remoteJid) return;
  const jid = msg.key.remoteJid;
  if (jid === 'status@broadcast') return;

  const chatJid = jid;
  if (!messageCache.has(chatJid)) {
    messageCache.set(chatJid, []);
  }
  const chatMessages = messageCache.get(chatJid);

  const isFromMe = !!msg.key.fromMe;
  const msgId = msg.key.id || '';
  const timestamp = msg.messageTimestamp || Date.now() / 1000;

  // Extract content
  let body = '';
  let type = 'text';
  let mediaUrl = null;
  let mediaType = null;
  let caption = null;
  const m = msg.message;

  if (m) {
    if (m.conversation) { body = m.conversation; }
    else if (m.extendedTextMessage?.text) { body = m.extendedTextMessage.text; }
    else if (m.imageMessage) { type = 'image'; body = m.imageMessage.caption || ''; caption = m.imageMessage.caption || ''; mediaType = 'image'; }
    else if (m.videoMessage) { type = 'video'; body = m.videoMessage.caption || ''; caption = m.videoMessage.caption || ''; mediaType = 'video'; }
    else if (m.documentMessage) { type = 'document'; body = m.documentMessage.fileName || 'document'; mediaType = 'document'; }
    else if (m.audioMessage) { type = 'audio'; mediaType = 'audio'; }
    else if (m.stickerMessage) { type = 'sticker'; mediaType = 'sticker'; }
    else if (m.contactMessage) { body = m.contactMessage.displayName || 'contact'; type = 'contact'; }
    else if (m.locationMessage) { body = 'Location'; type = 'location'; }
    else if (m.protocolMessage) { type = 'protocol'; body = 'System message'; }
    else if (m.buttonsResponseMessage) { body = m.buttonsResponseMessage.selectedDisplayText || ''; }
    else if (m.listResponseMessage) { body = m.listResponseMessage.singleSelectReply?.selectedRowId || ''; }
    else { body = JSON.stringify(m).slice(0, 200); }

    // Extract quoted message (reply)
    let quotedMessage = null;
    const contextInfo = m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo || m?.documentMessage?.contextInfo || m?.conversation?.contextInfo;
    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      let qBody = '';
      let qType = 'text';
      if (qm.conversation) qBody = qm.conversation;
      else if (qm.extendedTextMessage?.text) qBody = qm.extendedTextMessage.text;
      else if (qm.imageMessage) { qType = 'image'; qBody = qm.imageMessage.caption || '[Gambar]'; }
      else if (qm.videoMessage) { qType = 'video'; qBody = qm.videoMessage.caption || '[Video]'; }
      else if (qm.documentMessage) { qType = 'document'; qBody = qm.documentMessage.fileName || '[Dokumen]'; }
      else if (qm.audioMessage) { qType = 'audio'; qBody = '[Audio]'; }
      else if (qm.stickerMessage) { qType = 'sticker'; qBody = '[Stiker]'; }
      else qBody = '[Pesan]';
      quotedMessage = {
        body: qBody,
        type: qType,
        participant: contextInfo.participant || null,
      };
    }
  }

  const entry = {
    id: msgId,
    from: isFromMe ? (msg.key.participant || msg.key.remoteJid) : msg.key.remoteJid,
    to: isFromMe ? msg.key.remoteJid : (msg.key.participant || msg.key.remoteJid),
    body,
    timestamp: typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp,
    type,
    mediaUrl: null, // will be resolved on demand
    mediaType,
    caption,
    isFromMe,
    chatJid,
    quotedMessage,
  };

  chatMessages.push(entry);
  if (chatMessages.length > MAX_MESSAGES_PER_CHAT) {
    chatMessages.splice(0, chatMessages.length - MAX_MESSAGES_PER_CHAT);
  }
}

function isGroupJid(jid) {
  return jid && jid.endsWith('@g.us');
}

function resolveContactName(jid) {
  if (!jid) return jid;
  // For groups, try chatStore subject
  if (isGroupJid(jid)) {
    const chat = chatStore.get(jid);
    if (chat) {
      if (chat.subject) return chat.subject;
      if (chat.name) return chat.name;
    }
    return jid.replace(/@g\.us$/, '') || jid;
  }
  // For personal contacts, try contactStore first (most reliable)
  const contact = contactStore.get(jid);
  if (contact) {
    if (contact.name) return contact.name;
    if (contact.notify) return contact.notify;
  }
  // Try chatStore (pushName from chat events)
  const chat = chatStore.get(jid);
  if (chat) {
    if (chat.pushName) return chat.pushName;
    if (chat.name) return chat.name;
  }
  // Fallback to phone number (strip @s.whatsapp.net)
  const phone = jid.replace(/@s\.whatsapp\.net$/, '');
  return phone || jid;
}

function getChatList() {
  const chats = [];
  
  // Include chats from messageCache
  for (const [jid, messages] of messageCache.entries()) {
    if (jid === 'status@broadcast') continue;
    const lastMsg = messages[messages.length - 1];
    const name = resolveContactName(jid);
    const unread = messages.filter(m => !m.isFromMe && !m.read).length;
    chats.push({
      jid,
      name,
      lastMessage: lastMsg || null,
      unreadCount: unread,
      messageCount: messages.length,
    });
  }    // Also include chats from chatStore that have no messages yet
  for (const [jid] of chatStore) {
    if (jid === 'status@broadcast') continue;
    if (messageCache.has(jid)) continue; // already added above
    const name = resolveContactName(jid);
    
    chats.push({
      jid,
      name,
      lastMessage: null,
      unreadCount: 0,
      messageCount: 0,
    });
  }
  
  chats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
  return chats.slice(0, MAX_CHATS);
}

async function connectToWhatsApp() {
  try {
    connectionStatus = 'connecting';
    console.log('Initializing WhatsApp connection...');

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'error' }),
    });

    sock.ev.on('creds.update', saveCreds);

    // ── Cache incoming & outgoing messages ────────────────────────────────
    sock.ev.on('messages.upsert', (upsert) => {
      if (upsert.type !== 'notify') return;
      for (const msg of upsert.messages) {
        cacheMessage(msg);
        // Also capture pushName from incoming messages to resolve contact names
        const senderJid = msg.key.fromMe ? (msg.key.participant || msg.key.remoteJid) : msg.key.remoteJid;
        const pushName = msg.pushName;
        if (pushName && senderJid && !senderJid.includes('@g.us')) {
          // Update contactStore with pushName if not already set
          const existing = contactStore.get(senderJid);
          if (!existing || (!existing.name && !existing.notify)) {
            contactStore.set(senderJid, { id: senderJid, name: pushName, notify: pushName, ...(existing || {}) });
          }
        }
        // For group messages, capture participant pushName
        if (msg.key.participant && msg.pushName && isGroupJid(msg.key.remoteJid)) {
          const partJid = msg.key.participant;
          const existing = contactStore.get(partJid);
          if (!existing || (!existing.name && !existing.notify)) {
            contactStore.set(partJid, { id: partJid, name: msg.pushName, notify: msg.pushName, ...(existing || {}) });
          }
        }
      }
    });

    // ── Store chat history from initial sync ──────────────────────────────
    sock.ev.on('messaging-history.set', (history) => {
      console.log(`History sync: ${history.messages?.length || 0} msgs, ${history.chats?.length || 0} chats, ${history.contacts?.length || 0} contacts`);
      
      // Store chats
      if (history.chats) {
        for (const chat of history.chats) {
          if (chat.id) chatStore.set(chat.id, chat);
        }
      }
      
      // Store contacts
      if (history.contacts) {
        for (const contact of history.contacts) {
          if (contact.id) contactStore.set(contact.id, contact);
        }
      }
      
      // Cache messages
      if (history.messages) {
        for (const msg of history.messages) {
          if (msg && msg.key) {
            cacheMessage(msg);
          }
        }
      }
      
      console.log(`Store: ${chatStore.size} chats, ${contactStore.size} contacts`);
    });

    // ── Chat lifecycle events ──────────────────────────────────────────────
    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        if (chat.id) chatStore.set(chat.id, chat);
      }
    });
    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const existing = chatStore.get(update.id);
          chatStore.set(update.id, { ...existing, ...update });
        }
      }
    });
    sock.ev.on('chats.delete', (jids) => {
      for (const jid of jids) {
        chatStore.delete(jid);
      }
    });

    // ── Contact lifecycle events ───────────────────────────────────────────
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (contact.id) contactStore.set(contact.id, contact);
      }
    });
    sock.ev.on('contacts.update', (updates) => {
      for (const update of updates) {
        if (update.id) {
          const existing = contactStore.get(update.id);
          contactStore.set(update.id, { ...existing, ...update });
        }
      }
    });

    // ── Resolve push names (contact names) ────────────────────────────────
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) {
        const jid = c.id;
        if (!jid) continue;
        const pushName = c.name || c.notify || '';
        if (!pushName) continue;
        // Update chat name in cache
        const chatMsgs = messageCache.get(jid);
        if (chatMsgs) {
          for (const m of chatMsgs) {
            if (m.name === undefined) m.name = pushName;
          }
        }
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        console.log('\n--- SCAN QR CODE TO CONNECT WHATSAPP ---');
        qrcodeTerminal.generate(qr, { small: true });
        
        try {
          // Generate QR as base64 for frontend
          latestQr = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('Error generating base64 QR:', err);
        }
        
        connectionStatus = 'disconnected';
      }

      if (connection === 'connecting') {
        connectionStatus = 'connecting';
        console.log('Connecting to WhatsApp...');
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        latestQr = null;
        console.log('WhatsApp connected successfully!');
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error;
        const statusCode = error instanceof Boom ? error.output?.statusCode : null;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`Connection closed. Reason: ${error?.message || 'unknown'}. Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          connectionStatus = 'connecting';
          setTimeout(connectToWhatsApp, 3000);
        } else {
          connectionStatus = 'disconnected';
          latestQr = null;
          console.log('Logged out from WhatsApp. Cleaning up session files...');
          try {
            fs.rmSync(AUTH_SESSION_DIR, { recursive: true, force: true });
          } catch (e) {
            console.error('Failed to clear session folder:', e);
          }
        }
      }
    });

  } catch (err) {
    console.error('Error in connectToWhatsApp:', err);
    connectionStatus = 'disconnected';
  }
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: latestQr
  });
});

// Apakah buffer berisi gambar (jpeg/png/webp) berdasarkan magic bytes
function isImageBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x52 && buf[1] === 0x49) return true; // RIFF....WEBP
  return false;
}

// Ambil buffer gambar dari URL (signed URL Supabase) atau data URI base64.
// Hanya buffer gambar yang diterima; media non-gambar dilewati agar satu
// foto rusak tidak menggagalkan seluruh pengiriman.
async function fetchRemoteBuffer(url, timeoutMs = 15000) {
  try {
    if (typeof url === 'string' && url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma === -1) return null;
      const base64 = url.slice(comma + 1);
      if (!base64) return null;
      const buf = Buffer.from(base64, 'base64');
      return isImageBuffer(buf) ? buf : null;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error('Failed to fetch media, status:', res.status, url.slice(0, 80));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return isImageBuffer(buf) ? buf : null;
  } catch (err) {
    console.error('Error fetching media:', err.message);
    return null;
  }
}

// Tebak mimetype dari magic bytes (jpeg/png/webp), default jpeg
function guessImageMime(buf) {
  if (!buf || buf.length < 4) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp'; // RIFF....WEBP
  return 'image/jpeg';
}

app.post('/api/send-message', async (req, res) => {
  const { phone, jid, message, media } = req.body;

  if ((!phone && !jid) || !message) {
    return res.status(400).json({ error: 'Target (phone/jid) and message are required' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }

  try {
    // Target: JID grup/eksplisit langsung dipakai; nomor HP diformat ke JID pribadi
    let target;
    if (jid) {
      target = jid.includes('@') ? jid : `${jid}@g.us`;
    } else {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.slice(1);
      }
      target = cleaned.includes('@') ? cleaned : `${cleaned}@s.whatsapp.net`;
    }

    // Unduh semua media (URL atau data URI) menjadi buffer
    let mediaBuffers = [];
    if (Array.isArray(media) && media.length > 0) {
      for (const url of media.slice(0, 30)) {
        const buf = await fetchRemoteBuffer(url);
        if (buf) mediaBuffers.push(buf);
      }
    }

    // Build reply context if quotedMsgId is provided
    let quotedMsg = undefined;
    if (req.body.quotedMsgId) {
      // Try to find the quoted message in cache to build contextInfo
      const cachedMsgs = messageCache.get(target) || [];
      const qMsg = cachedMsgs.find(m => m.id === req.body.quotedMsgId);
      if (qMsg) {
        quotedMsg = {
          key: { remoteJid: target, id: qMsg.id, fromMe: qMsg.isFromMe },
          message: {}, // Baileys only needs the key for quoting
        };
      }
    }
    const contextInfo = quotedMsg ? { quotedMessage: quotedMsg.message, stanzaId: quotedMsg.key.id, participant: quotedMsg.key.fromMe ? undefined : quotedMsg.key.remoteJid } : undefined;

    if (mediaBuffers.length === 1) {
      const mime = guessImageMime(mediaBuffers[0]);
      const msgObj = { image: mediaBuffers[0], mimetype: mime, caption: message };
      if (contextInfo) msgObj.contextInfo = contextInfo;
      await sock.sendMessage(target, msgObj);
    } else if (mediaBuffers.length > 1) {
      try {
        // Album = beberapa gambar dalam satu pesan
        await sock.sendMessage(target, {
          album: mediaBuffers.map((b) => ({ image: b, mimetype: guessImageMime(b) })),
          caption: message,
        });
      } catch (albumErr) {
        // Fallback: kirim setiap gambar sebagai pesan terpisah
        console.warn('Album send failed, sending individually:', albumErr.message);
        for (let i = 0; i < mediaBuffers.length; i++) {
          await sock.sendMessage(target, {
            image: mediaBuffers[i],
            mimetype: guessImageMime(mediaBuffers[i]),
            caption: i === 0 ? message : undefined,
          });
        }
      }
    } else {
      const msgObj = { text: message };
      if (contextInfo) msgObj.contextInfo = contextInfo;
      await sock.sendMessage(target, msgObj);
    }

    res.json({ success: true, message: 'Message sent successfully', mediaCount: mediaBuffers.length });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// Daftar grup WhatsApp yang diikuti perangkat tertaut
app.get('/api/groups', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.entries(groups || {})
      .map(([id, meta]) => ({
        id: id.includes('@') ? id : `${id}@g.us`,
        name: (meta && meta.subject) || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ groups: list });
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    } else {
      fs.rmSync(AUTH_SESSION_DIR, { recursive: true, force: true });
    }
    connectionStatus = 'disconnected';
    latestQr = null;
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error logging out:', err);
    res.status(500).json({ error: err.message || 'Failed to log out' });
  }
});

app.post('/api/connect', async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ success: true, message: 'Already connected' });
  }
  
  if (connectionStatus === 'connecting') {
    return res.json({ success: true, message: 'Already connecting' });
  }

  connectToWhatsApp();
  res.json({ success: true, message: 'Connecting initialized' });
});

// ── POST /api/reconnect — Force fresh connection (triggers history sync) ──
app.post('/api/reconnect', async (req, res) => {
  try {
    console.log('Force reconnecting...');
    
    // Disconnect current socket
    if (sock) {
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }
    
    // Clear stores
    chatStore.clear();
    contactStore.clear();
    messageCache.clear();
    
    // Delete session for fresh connection
    try {
      fs.rmSync(AUTH_SESSION_DIR, { recursive: true, force: true });
    } catch (e) {}
    
    connectionStatus = 'disconnected';
    latestQr = null;
    
    // Reconnect
    setTimeout(() => connectToWhatsApp(), 1000);
    
    res.json({ success: true, message: 'Reconnecting... Scan QR code when ready' });
  } catch (err) {
    console.error('Error reconnecting:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/chats — List all cached chats ────────────────────────────
app.get('/api/chats', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const chats = getChatList();
    res.json({ chats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/refresh-chats — Return all cached chats ──
app.post('/api/refresh-chats', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    // Merge chat store with message cache
    const chats = getChatList();
    
    // Add chats from chatStore that don't have messages yet
    for (const [jid, chat] of chatStore) {
      if (jid === 'status@broadcast') continue;
      if (!messageCache.has(jid)) {
        // Create a placeholder entry
        messageCache.set(jid, []);
      }
    }
    
    // Rebuild chat list after merge
    const mergedChats = getChatList();
    
    console.log(`Refresh: ${chatStore.size} chats in store, ${mergedChats.length} total`);
    res.json({ success: true, chats: mergedChats, loaded: chatStore.size });
  } catch (err) {
    console.error('Error refreshing chats:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fetch-history — Request history for specific chats ──
app.post('/api/fetch-history', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    console.log('Fetching chat history...');
    let loaded = 0;
    
    // Collect all known JIDs that have no cached messages
    const jidsToFetch = [];
    for (const [jid] of chatStore) {
      if (jid === 'status@broadcast') continue;
      const msgs = messageCache.get(jid);
      if (!msgs || msgs.length === 0) {
        jidsToFetch.push(jid);
      }
    }
    // Also from contacts
    for (const [jid] of contactStore) {
      if (jid === 'status@broadcast') continue;
      if (!chatStore.has(jid) && !messageCache.has(jid)) {
        jidsToFetch.push(jid);
      }
    }
    
  
    
    console.log(`Fetching history for ${jidsToFetch.length} chats...`);
    
    for (const jid of jidsToFetch.slice(0, 20)) {
      try {
        await sock.fetchMessageHistory(50, undefined, undefined);
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      } catch (err) {
        console.warn(`Failed to fetch history for ${jid}:`, err.message);
      }
    }
    
    // Wait for events to process
    await new Promise(r => setTimeout(r, 2000));
    
    const chats = getChatList();
    console.log(`History fetch complete: ${chats.length} total chats`);
    res.json({ 
      success: true, 
      chats, 
      chatCount: chatStore.size,
      contactCount: contactStore.size
    });
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages/:jid — Get messages for a specific chat ──────────
app.get('/api/messages/:jid', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const jid = decodeURIComponent(req.params.jid);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // timestamp filter
    const messages = messageCache.get(jid) || [];
    let filtered = messages;
    if (before) {
      const beforeTs = parseInt(before);
      filtered = messages.filter(m => m.timestamp < beforeTs);
    }
    const result = filtered.slice(-limit);
    res.json({ messages: result, total: messages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/media/:jid/:msgId — Download media from a message ────────
app.get('/api/media/:jid/:msgId', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const jid = decodeURIComponent(req.params.jid);
    const msgId = req.params.msgId;
    const messages = messageCache.get(jid) || [];
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found in cache' });

    // Re-fetch the message from Baileys to get media
    const key = { remoteJid: jid, id: msgId, fromMe: msg.isFromMe };
    const retrieved = await sock.loadMessage(jid, msgId);
    if (!retrieved || !retrieved.message) {
      return res.status(404).json({ error: 'Message not found on server' });
    }

    const m = retrieved.message;
    let mediaMsg = null;
    if (m.imageMessage) mediaMsg = m.imageMessage;
    else if (m.videoMessage) mediaMsg = m.videoMessage;
    else if (m.documentMessage) mediaMsg = m.documentMessage;
    else if (m.audioMessage) mediaMsg = m.audioMessage;
    else if (m.stickerMessage) mediaMsg = m.stickerMessage;

    if (!mediaMsg || !mediaMsg.mimetype) {
      return res.status(400).json({ error: 'No media in this message' });
    }

    const stream = await sock.downloadMediaMessage(retrieved, 'buffer', {});
    if (!stream) return res.status(500).json({ error: 'Failed to download media' });

    res.set('Content-Type', mediaMsg.mimetype);
    if (mediaMsg.fileName) {
      res.set('Content-Disposition', `inline; filename="${mediaMsg.fileName}"`);
    }
    res.send(stream);
  } catch (err) {
    console.error('Error downloading media:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contacts — Search contacts ────────────────────────────────
app.get('/api/contacts', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const q = (req.query.q || '').toLowerCase();
    const chats = getChatList();
    let filtered = chats;
    if (q) {
      filtered = chats.filter(c =>
        c.name.toLowerCase().includes(q) || c.jid.toLowerCase().includes(q)
      );
    }
    res.json({ contacts: filtered.map(c => ({ jid: c.jid, name: c.name, lastMessage: c.lastMessage })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contacts/map — JID → resolved name map ─────────────────────
app.get('/api/contacts/map', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const map = {};
    // From contactStore (phone contacts, pushName)
    for (const [jid, contact] of contactStore) {
      if (jid === 'status@broadcast') continue;
      const name = (contact && (contact.name || contact.notify)) || '';
      if (name) map[jid] = name;
    }
    // From chatStore (pushName)
    for (const [jid, chat] of chatStore) {
      if (jid === 'status@broadcast') continue;
      if (!map[jid]) {
        const name = (chat && (chat.pushName || chat.subject || chat.name)) || '';
        if (name) map[jid] = name;
      }
    }
    res.json({ map });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages — Global search across all chats ─────────────────
app.get('/api/messages', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const q = (req.query.q || '').toLowerCase();
    const typeFilter = req.query.type; // 'image', 'document', etc.
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    let allMessages = [];
    for (const [jid, msgs] of messageCache.entries()) {
      for (const m of msgs) {
        allMessages.push({ ...m, chatJid: jid });
      }
    }
    if (q) {
      allMessages = allMessages.filter(m => (m.body || '').toLowerCase().includes(q));
    }
    if (typeFilter) {
      allMessages = allMessages.filter(m => m.type === typeFilter);
    }
    allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ messages: allMessages.slice(0, limit), total: allMessages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages/images — Get all image messages ──────────────────
app.get('/api/messages/images', (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    let allImages = [];
    for (const [jid, msgs] of messageCache.entries()) {
      for (const m of msgs) {
        if (m.type === 'image') {
          allImages.push({ ...m, chatJid: jid });
        }
      }
    }
    allImages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ images: allImages.slice(0, limit), total: allImages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/delete-message — Delete/recall a message ────────────────
app.post('/api/delete-message', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    const { jid, msgId, forMe } = req.body;
    if (!jid || !msgId) {
      return res.status(400).json({ error: 'jid and msgId are required' });
    }
    await sock.sendMessage(jid, { delete: { remoteJid: jid, id: msgId, fromMe: !!forMe } });
    // Remove from cache
    const msgs = messageCache.get(jid);
    if (msgs) {
      const idx = msgs.findIndex(m => m.id === msgId);
      if (idx !== -1) msgs.splice(idx, 1);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: err.message || 'Failed to delete message' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Google Sheets Direct API (tanpa Apps Script)
// ══════════════════════════════════════════════════════════════════════════
const GSHEETS_CONFIG_PATH = path.join(__dirname, 'gsheets_config.json');
let gsheetsJwtClient = null;
let gsheetsConf = { spreadsheetId: '', sheetName: 'Daftar Nota', serviceAccountEmail: '' };

// Load saved Google Sheets config from disk
try {
  if (fs.existsSync(GSHEETS_CONFIG_PATH)) {
    const raw = JSON.parse(fs.readFileSync(GSHEETS_CONFIG_PATH, 'utf8'));
    gsheetsConf = { ...gsheetsConf, ...raw };
  }
} catch (e) {
  console.warn('Failed to load gsheets config:', e.message);
}

// ── POST /api/gsheets/config — Save service account + spreadsheet ID ──
app.post('/api/gsheets/config', (req, res) => {
  try {
    const { spreadsheetId, sheetName, serviceAccountJson } = req.body;
    if (!spreadsheetId || !serviceAccountJson) {
      return res.status(400).json({ error: 'spreadsheetId and serviceAccountJson are required' });
    }
    // Validate service account JSON
    let sa;
    try {
      sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    } catch {
      return res.status(400).json({ error: 'Invalid service account JSON' });
    }
    if (!sa.client_email || !sa.private_key) {
      return res.status(400).json({ error: 'Service account must have client_email and private_key' });
    }
    // Save config to disk
    const config = {
      spreadsheetId,
      sheetName: sheetName || 'Daftar Nota',
      serviceAccountEmail: sa.client_email,
      serviceAccountJson: sa, // stored for API auth
    };
    fs.writeFileSync(GSHEETS_CONFIG_PATH, JSON.stringify(config, null, 2));
    gsheetsConf = config;
    gsheetsJwtClient = null; // reset so next request creates fresh auth
    res.json({ success: true, message: 'Config saved', spreadsheetId, sheetName: config.sheetName });
  } catch (err) {
    console.error('Error saving gsheets config:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/gsheets/config — Get current config (without secret key) ──
app.get('/api/gsheets/config', (req, res) => {
  res.json({
    spreadsheetId: gsheetsConf.spreadsheetId || '',
    sheetName: gsheetsConf.sheetName || 'Daftar Nota',
    serviceAccountEmail: gsheetsConf.serviceAccountEmail || '',
    configured: !!(gsheetsConf.spreadsheetId && gsheetsConf.serviceAccountEmail),
  });
});

// ── POST /api/gsheets/test — Test connection ──
app.post('/api/gsheets/test', async (req, res) => {
  try {
    const { spreadsheetId, serviceAccountJson } = req.body;
    const sid = spreadsheetId || gsheetsConf.spreadsheetId;
    let sa;
    try {
      const saRaw = serviceAccountJson || (gsheetsConf.serviceAccountJson ? JSON.stringify(gsheetsConf.serviceAccountJson) : null);
      if (!saRaw) return res.status(400).json({ error: 'Service account not configured' });
      sa = typeof saRaw === 'string' ? JSON.parse(saRaw) : saRaw;
    } catch {
      return res.status(400).json({ error: 'Invalid service account' });
    }
    if (!sid) return res.status(400).json({ error: 'Spreadsheet ID not configured' });

    // Auth
    const jwtClient = new google.auth.JWT(sa.client_email, null, sa.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
    await jwtClient.authorize();

    // Try to read the spreadsheet metadata
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
    const title = meta.data.properties?.title || 'Unknown';
    const sheetNames = (meta.data.sheets || []).map(s => s.properties?.title).join(', ');
    res.json({ success: true, message: `Terhubung ke "${title}" (${sheetNames})` });
  } catch (err) {
    console.error('GSheets test error:', err);
    res.status(500).json({ success: false, error: err.message || 'Connection failed' });
  }
});

// ── POST /api/gsheets/sync — Push invoice rows to Google Sheets ──
app.post('/api/gsheets/sync', async (req, res) => {
  try {
    const { rows } = req.body; // Array of invoice objects
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }
    if (!gsheetsConf.spreadsheetId || !gsheetsConf.serviceAccountJson) {
      return res.status(400).json({ error: 'Google Sheets not configured. Save config first.' });
    }

    // Auth
    const sa = gsheetsConf.serviceAccountJson;
    const jwtClient = new google.auth.JWT(sa.client_email, null, sa.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
    await jwtClient.authorize();

    const sheetsApi = google.sheets({ version: 'v4', auth: jwtClient });
    const spreadsheetId = gsheetsConf.spreadsheetId;
    const sheetName = gsheetsConf.sheetName || 'Daftar Nota';

    // ── Ensure sheet exists with headers ──
    try {
      const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
      const existingSheets = (meta.data.sheets || []).map(s => s.properties?.title);
      if (!existingSheets.includes(sheetName)) {
        // Create sheet with headers
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            }],
          },
        });
        // Write headers
        const headers = [["ID Nota","Cabang","Tanggal Nota","Supplier","Nama Barang","Qty","Harga Satuan","Total","Status","Dibuat Oleh","Waktu Input"]];
        await sheetsApi.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: headers },
        });
        // Style header row
        await sheetsApi.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: { sheetId: (meta.data.sheets?.length || 0), startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.102, green: 0.337, blue: 0.859 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            }],
          },
        });
      }
    } catch (sheetErr) {
      console.warn('Sheet check/create warning:', sheetErr.message);
    }

    // ── Find first empty row ──
    const readRes = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    const existingRows = readRes.data.values || [];
    const startRow = existingRows.length + 1; // next empty row (1-indexed)

    // ── Dedup: get existing IDs ──
    const existingIds = new Set(existingRows.map(r => r[0]).filter(Boolean));
    const newRows = rows.filter(r => r.id && !existingIds.has(r.id));
    if (newRows.length === 0) {
      return res.json({ success: true, synced: 0, message: 'Semua data sudah ada di spreadsheet' });
    }

    // ── Append new rows ──
    const values = newRows.map(r => [
      r.id,
      r.branch_name || '',
      r.invoice_date || '',
      r.supplier || '',
      r.item_name || '',
      r.qty || 0,
      r.price || 0,
      r.total || 0,
      r.status || '',
      r.created_by_name || '',
      r.created_at || new Date().toISOString(),
    ]);

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${startRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log(`GSheets sync: ${newRows.length} rows appended to "${sheetName}"`);
    res.json({ success: true, synced: newRows.length, message: `${newRows.length} data berhasil disync` });
  } catch (err) {
    console.error('GSheets sync error:', err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// ── POST /api/gsheets/sync-now — Trigger full data sync from Supabase ──
app.post('/api/gsheets/sync-now', async (req, res) => {
  try {
    if (!gsheetsConf.spreadsheetId || !gsheetsConf.serviceAccountJson) {
      return res.status(400).json({ error: 'Google Sheets not configured' });
    }
    // This endpoint is called by frontend with data from Supabase
    const { rows, supabaseUrl, supabaseKey } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows array required' });
    }
    // Forward to /api/gsheets/sync
    const syncRes = await fetch(`http://localhost:${PORT}/api/gsheets/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const result = await syncRes.json();
    res.json(result);
  } catch (err) {
    console.error('GSheets sync-now error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Express and connect automatically
app.listen(PORT, () => {
  console.log(`WhatsApp Gateway server running on port ${PORT}`);
  connectToWhatsApp();
});
