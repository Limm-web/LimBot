@echo off
setlocal enabledelayedexpansion

echo [INFO] Membuat Google Apps Script Project Baru...
echo [INFO] Login ke Google Cloud Console dulu jika belum
echo ==========================================

:: Buat project ID baru
call clasp create --title "Kasir AI Sembako Manual"

:: Baca script ID
for /f "tokens=*" %%a in ('type .clasp.json ^| findstr scriptId') do (
    set line=%%a
    set scriptId=!line:~16,-2!
)

echo [OK] Script ID berhasil dibuat: %scriptId%
echo ==========================================
echo.
echo 🎯 LINK EDITOR GOOGLE APPS SCRIPT:
echo https://script.google.com/macros/s/%scriptId%/edit
echo.
echo 💡 Paste kode dari TemplateSembako.js ke sana, lalu ganti token & API key manually!
pause
