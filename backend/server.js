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

// Start Express and connect automatically
app.listen(PORT, () => {
  console.log(`WhatsApp Gateway server running on port ${PORT}`);
  connectToWhatsApp();
});
