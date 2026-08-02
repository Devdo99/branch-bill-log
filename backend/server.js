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
app.use(express.json());

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

app.post('/api/send-message', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({ error: 'WhatsApp Gateway is not connected' });
  }

  try {
    // Format JID
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }
    const jid = cleaned.includes('@') ? cleaned : `${cleaned}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
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
