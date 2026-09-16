@echo off
title NotaKu - Headless System Launcher
echo Memulai server backend WhatsApp Gateway (dengan auto-restart)...
start cmd /k "cd /d "%~dp0" && start_whatsapp_only.bat"
echo Memulai frontend server (Vite) tanpa membuka browser...
start cmd /k "cd /d "%~dp0" && npm run dev"
echo System successfully launched in headless mode!
