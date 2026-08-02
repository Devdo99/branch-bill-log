@echo off
title Membuat Shortcut Desktop WhatsApp Gateway
echo Membuat shortcut di Desktop Anda...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'WhatsApp Gateway.lnk')); $Shortcut.TargetPath = 'wscript.exe'; $Shortcut.Arguments = '\"%~dp0start_whatsapp_background.vbs\"'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.IconLocation = 'shell32.dll,277'; $Shortcut.Description = 'Menjalankan WhatsApp Gateway NotaKu di latar belakang'; $Shortcut.Save()"
echo Selesai! Shortcut 'WhatsApp Gateway' telah berhasil dibuat di Desktop Anda.
pause
