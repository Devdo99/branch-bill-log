@echo off
title NotaKu - WhatsApp Gateway & Web App Launcher
echo Memulai server backend WhatsApp Gateway...
start cmd /k "cd /d "%~dp0backend" && npm start"
echo Memulai frontend server (Vite)...
start cmd /k "cd /d "%~dp0" && npm run dev -- --open"
echo System successfully launched!
