@echo off
title NotaKu - WhatsApp Gateway Backend Only
echo Memulai server backend WhatsApp Gateway saja...
echo QR Code akan digambar di terminal jika belum tertaut.
cd /d "%~dp0backend"
npm start
