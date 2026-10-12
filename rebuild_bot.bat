@echo off
chcp 65001 >nul
echo ==========================================
echo 🏭 LIMBOT REBUILD TOOL - FRESH DEPLOY
echo ==========================================
echo.
echo ⚠️ PERINGATAN: Script akan membuat bot BARU!
echo Bot lama tetap ada di archive, tidak dihapus.
echo.
echo Masukkan TOKEN TELEGRAM (dari @BotFather):
set /p TOKEN=> 
echo.
echo Masukkan GROQ API KEY (dari https://groq.com):
set /p GROQ_KEY=** [password will be hidden]
echo.
echo [OK] Starting deployment...
echo.

if not exist "%~dp0bots" mkdir "%~dp0bots"
cd /d "%~dp0bots"

:: Buat folder baru
set TIMESTAMP=%date%_%time%
set TIMESTAMP=%TIMESTAMP:/=-%
set TIMESTAMP=%TIMESTAMP:* =%
set NAMA_BOT=Bot_%timestamp%

mkdir %NAMA_BOT% 2>nul
cd %NAMA_BOT%

echo [1/5] Membuat Google Apps Script Project...
call clasp create --title "Kasir AI Sembako Fresh"
if errorlevel 1 (
    echo [ERROR] CLASP tidak terinstall! Install dulu dengan: npm install -g @google/clasp
    pause
    exit /b 1
)

:: Baca script ID dari .clasp.json
for /f "tokens=* delims=" %%a in ('type .clasp.json') do set CLASP_JSON=%%a
for /f "tokens=2 delims=:," %%a in ('echo %CLASP_JSON% ^| findstr scriptId') do set SCRIPT_ID=%%a

echo [2/5] Copy kode TemplateSembako.js ke Code.js...
copy ..\..\TemplateSembako.js Code.js

echo [3/5] Update Token & API Key di Code.js...
powershell -Command "^$file = 'Code.js'; ^$content = Get-Content $file -Raw; ^$content = ^$content.Replace('{{TOKEN}}', '%TOKEN%'); ^$content = ^$content.Replace('{{GROQ_API_KEY}}', '%GROQ_KEY%'); Set-Content $file -Value ^$content"

echo [4/5] Push ke Google Cloud...
call clasp push -f

echo [5/5] Deploy Web App...
call clasp deploy -d "V16-Fresh-Auto"

:: Dapatkan deploy ID terakhir
for /f "tokens=*" %%a in ('clasp deployments 2^>nul ^| findstr Deployed ^| head -n 1') do set DEPLOY_INFO=%%a
for /f "tokens=3 delims=@ " %%a in ('echo %DEPLOY_INFO%') do set DEPLOY_ID=%%a

echo.
echo ==========================================
echo ✅ SUCCESS! BOT BARU DIBUAT!
echo ==========================================
echo.
echo 📁 Lokasi Folder: %CD%
echo 🔑 Script ID: %SCRIPT_ID%
echo 🔗 LINK EDITOR GOOGLE APPS SCRIPT:
echo https://script.google.com/macros/s/%SCRIPT_ID%/edit
echo.
echo 💡 CARA BUKA:
echo 1. Copy link di atas, paste di browser
echo 2. Login akun Google yang sama dengan yang di-botFather
echo 3. Klik Authorize sekarang
echo 4. Allow permissions (Scripts Access Spreadsheet)
echo 5. Save project (Ctrl+S)
echo.
echo Test dengan ketik /start di Telegram bot Anda!
pause
