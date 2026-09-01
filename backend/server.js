const express = require('express');
const cors = require('cors');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
app.use(cors());
// Limit besar karena payload bisa berisi beberapa gambar base64 (data URI) dari laptop
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5000;
const AUTH_SESSION_DIR = path.join(__dirname, 'auth_session');

let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let latestQr = null;

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
  };

  chatMessages.push(entry);
  if (chatMessages.length > MAX_MESSAGES_PER_CHAT) {
    chatMessages.splice(0, chatMessages.length - MAX_MESSAGES_PER_CHAT);
  }
}

function getChatList() {
  const chats = [];
  for (const [jid, messages] of messageCache.entries()) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) continue;
    const unread = messages.filter(m => !m.isFromMe && !m.read).length;
    chats.push({
      jid,
      name: jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, ' (group)'),
      lastMessage: lastMsg,
      unreadCount: unread,
      messageCount: messages.length,
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
      printQRInTerminal: false, // We will print manually to capture both outputs
      logger: pino({ level: 'error' }),
    });

    sock.ev.on('creds.update', saveCreds);

    // ── Cache incoming & outgoing messages ────────────────────────────────
    sock.ev.on('messages.upsert', (upsert) => {
      if (upsert.type !== 'notify') return;
      for (const msg of upsert.messages) {
        cacheMessage(msg);
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
        
        // Fetch chat history after connection
        setTimeout(async () => {
          try {
            console.log('Fetching chat history...');
            const chats = await sock.store?.chats?.all() || [];
            console.log(`Found ${chats.length} chats in store`);
            
            // Fetch recent messages for each chat
            for (const chat of chats.slice(0, 20)) {
              try {
                const jid = chat.id;
                if (!jid || jid === 'status@broadcast') continue;
                
                // Get messages from store
                const msgs = await sock.store?.messages?.get(jid) || [];
                const msgArray = Array.isArray(msgs) ? msgs : Array.from(msgs.values?.() || []);
                
                // Cache recent messages (last 50 per chat)
                const recentMsgs = msgArray.slice(-50);
                for (const msg of recentMsgs) {
                  if (msg && msg.key) {
                    cacheMessage(msg);
                  }
                }
                
                // Get contact name from chat
                const pushName = chat.pushName || chat.name || '';
                if (pushName) {
                  const chatMsgs = messageCache.get(jid);
                  if (chatMsgs) {
                    for (const m of chatMsgs) {
                      if (m.name === undefined) m.name = pushName;
                    }
                  }
                }
              } catch (err) {
                // Skip this chat on error
              }
            }
            console.log('Chat history loaded successfully');
          } catch (err) {
            console.error('Error fetching chat history:', err.message);
          }
        }, 2000); // Wait 2s for store to be ready
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

    if (mediaBuffers.length === 1) {
      const mime = guessImageMime(mediaBuffers[0]);
      await sock.sendMessage(target, { image: mediaBuffers[0], mimetype: mime, caption: message });
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
      await sock.sendMessage(target, { text: message });
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

// ── POST /api/refresh-chats — Manually refresh chat history from server ──
app.post('/api/refresh-chats', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }
  try {
    console.log('Manually refreshing chat history...');
    
    // Try to get chats from store
    let chatList = [];
    try {
      chatList = await sock.store?.chats?.all() || [];
    } catch (e) {
      console.warn('Store chats not available:', e.message);
    }
    
    let loaded = 0;
    for (const chat of chatList.slice(0, 30)) {
      try {
        const jid = chat.id;
        if (!jid || jid === 'status@broadcast') continue;
        
        // Skip if already cached
        if (messageCache.has(jid) && messageCache.get(jid).length > 0) continue;
        
        // Get messages from store
        const msgs = await sock.store?.messages?.get(jid) || [];
        const msgArray = Array.isArray(msgs) ? msgs : Array.from(msgs.values?.() || []);
        
        // Cache recent messages
        const recentMsgs = msgArray.slice(-50);
        for (const msg of recentMsgs) {
          if (msg && msg.key) {
            cacheMessage(msg);
          }
        }
        
        // Get contact name
        const pushName = chat.pushName || chat.name || '';
        if (pushName) {
          const chatMsgs = messageCache.get(jid);
          if (chatMsgs) {
            for (const m of chatMsgs) {
              if (m.name === undefined) m.name = pushName;
            }
          }
        }
        
        loaded++;
      } catch (err) {
        // Skip this chat
      }
    }
    
    const chats = getChatList();
    console.log(`Refresh complete: ${loaded} chats loaded, ${chats.length} total chats`);
    res.json({ success: true, chats, loaded });
  } catch (err) {
    console.error('Error refreshing chats:', err);
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

// Start Express and connect automatically
app.listen(PORT, () => {
  console.log(`WhatsApp Gateway server running on port ${PORT}`);
  connectToWhatsApp();
});
