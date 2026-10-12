const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = process.argv[2];
const groqKey = process.argv[3];
const masterSheetId = process.argv[4] || process.env.MASTER_SHEET_ID || "";

if (!token || !groqKey) {
    console.log("[ERROR] Masukkan Token Telegram DAN Groq API Key!");
    console.log('[INFO] Format: node LimBotFactory.js "TOKEN_TELEGRAM" "API_KEY_GROQ" ["MASTER_SHEET_ID"]');
    process.exit(1);
}

const templatePath = path.join(__dirname, 'TemplateSembako.js');
if (!fs.existsSync(templatePath)) {
    console.log("[ERROR] File TemplateSembako.js tidak ditemukan di " + __dirname);
    process.exit(1);
}

console.log("[1/6] Memulai Pabrik LimBot Sembako V16 (Master Edition)...");
const dirName = "Bot_" + Date.now();
if (!fs.existsSync('bots')) fs.mkdirSync('bots');
process.chdir('bots');
fs.mkdirSync(dirName);
process.chdir(dirName);

console.log("[2/6] Meminta Google membuat Apps Script baru...");
execSync('clasp create --type standalone --title "Kasir AI Sembako ' + dirName + '"', { stdio: 'inherit' });

const claspJson = JSON.parse(fs.readFileSync('.clasp.json', 'utf8'));
const sheetId = claspJson.parentId;

console.log("[3/6] Membaca TemplateSembako V16 dan Menyuntikkan Otak AI Llama 3...");
const appsscript = {
  timeZone: "Asia/Jakarta",
  dependencies: {},
  exceptionLogging: "STACKDRIVER",
  runtimeVersion: "V8",
  webapp: {
    executeAs: "USER_DEPLOYING",
    access: "ANYONE_ANONYMOUS"
  }
};
fs.writeFileSync('appsscript.json', JSON.stringify(appsscript, null, 2));

let codeJs = fs.readFileSync(templatePath, 'utf8');
codeJs = codeJs.replace('{{TOKEN}}', token);
codeJs = codeJs.replace('{{SHEET_ID}}', sheetId);
codeJs = codeJs.replace('{{GROQ_API_KEY}}', groqKey);
if (masterSheetId) {
    codeJs = codeJs.replace('{{MASTER_SHEET_ID}}', masterSheetId);
}
fs.writeFileSync('Code.js', codeJs);

console.log("[4/6] Mengirim Kode ke Server Google...");
execSync('clasp push -f', { stdio: 'inherit' });

console.log("[5/6] Melakukan Deploy Web App dan Mengaitkan ke Telegram...");
const deployOutput = execSync('clasp deploy -d "Produksi V7 AI"', { encoding: 'utf-8' });
console.log(deployOutput);

const match = deployOutput.match(/(?:-|Deployed) ([A-Za-z0-9_-]+) @/);
if (match && match[1]) {
    const deployId = match[1];
    const webAppUrl = "https://script.google.com/macros/s/" + deployId + "/exec";
    
    console.log("[INFO] Menyambungkan Webhook Telegram (Anti Spam Mode)...");
    const tgWebhookUrl = "https://api.telegram.org/bot" + token + "/setWebhook?url=" + webAppUrl + "&drop_pending_updates=true";
    try {
        execSync(`curl -s "${tgWebhookUrl}"`, { stdio: "ignore" });
        console.log("[OK] Webhook Berhasil Disambungkan!");
    } catch (e) {
        console.log("[WARNING] Internet/DNS komputermu gagal menghubungi Telegram.");
        console.log("[INFO] Pasang webhook manual dengan copas link ini ke browser:");
        console.log(tgWebhookUrl);
    }
    
    console.log("[6/6] Menyiapkan Tombol Menu...");
    const https = require('https');
    const data = JSON.stringify({
                                commands: [
            { command: "start", description: "Panduan cara pakai bot" },
            { command: "langganan", description: "Upgrade & Cek Masa Aktif" },
            { command: "cs", description: "Bantuan & Hubungi Admin" },
            { command: "dashboard", description: "Buka Laporan Keuangan" },
            { command: "nota", description: "Buat struk belanja digital" },
            { command: "rekap", description: "Ringkasan laba bulan ini" },
            { command: "kas", description: "Lihat posisi kas hari ini" },
            { command: "omset", description: "Lihat total omset bulan ini" },
            { command: "alarm", description: "Aktifkan laporan jam 9 malam" }
        ]
    });
    
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: '/bot' + token + '/setMyCommands',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        console.log("[OK] Menu Telegram Berhasil Dipasang!");
        console.log("======================================================");
        console.log("SUCCESS! BOT SEMBAKO V16 (MASTER EDITION) SELESAI DIBUAT!");
        console.log("[WARNING] File Excel Klien belum dicetak!");
        console.log("Sistem Auto-Clone akan otomatis membuat dan menggandakan Excel ke Google Drive Klien saat mereka mengirim pesan pertama (misal: /start).");
        console.log("======================================================");
        console.log("LANGKAH SELANJUTNYA UNTUK ADMIN:");
        console.log("1. Buka Chat Bot ini di Telegram.");
        console.log("2. Ketik /perpanjang 30 admin123 (Untuk mengisi masa aktif).");
        console.log("3. Buka URL Script di bawah ini:");
        console.log("   ?O https://script.google.com/d/" + claspJson.scriptId + "/edit");
        console.log("   Lalu pilih fungsi setupAwal di atas (dropdown), dan klik RUN untuk otorisasi Alarm!");
    });

    req.on('error', (error) => {
        console.error("âŒ Gagal memasang menu: ", error);
    });

    req.write(data);
    req.end();

} else {
    console.log("[ERROR] Gagal mendapatkan Web App URL.");
}














