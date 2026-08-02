@echo off
title NotaKu - Headless System Launcher
echo Memulai server backend WhatsApp Gateway...
start cmd /k "cd /d "%~dp0backend" && npm start"
echo Memulai frontend server (Vite) tanpa membuka browser...
start cmd /k "cd /d "%~dp0" && npm run dev"
echo System successfully launched in headless mode!
