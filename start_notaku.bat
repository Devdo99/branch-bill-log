@echo off
title NotaKu - WhatsApp Gateway & Web App Launcher
echo Memulai server backend WhatsApp Gateway (dengan auto-restart)...
start cmd /k "cd /d "%~dp0" && start_whatsapp_only.bat"
echo Memulai frontend server (Vite)...
start cmd /k "cd /d "%~dp0" && npm run dev -- --open"
echo System successfully launched!
