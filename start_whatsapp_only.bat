@echo off
title NotaKu - WhatsApp Gateway Backend Only
echo Memulai server backend WhatsApp Gateway saja...
echo QR Code akan digambar di terminal jika belum tertaut.
echo (Backend otomatis dihidupkan ulang 5 detik setelah keluar)
cd /d "%~dp0backend"

:loop
node server.js
echo.
echo [!] Backend keluar (exit code %errorlevel%). Restart dalam 5 detik... (tutup jendela ini atau Ctrl+C untuk berhenti)
timeout /t 5 /nobreak >nul
goto loop
