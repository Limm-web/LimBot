<div align="center">

# 🤖 LimBot

**Sistem Kasir & Pembukuan Otomatis Micro-SaaS Berbasis Telegram & AI untuk Warung dan UMKM**

[![Node Version](https://img.shields.io/badge/node->=18.0.0-green?logo=node.js&logoColor=white)](package.json)
[![Runtime](https://img.shields.io/badge/runtime-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![LLM Engine](https://img.shields.io/badge/AI-Groq%20%7C%20Meta%20Llama--3-f55036?logo=groq&logoColor=white)](https://groq.com)
[![Platform](https://img.shields.io/badge/platform-Telegram%20Bot%20API-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Hosting Cost](https://img.shields.io/badge/biaya%20infrastruktur-Rp%200%20%2F%20bulan-brightgreen)](#-keunggulan-arsitektur--bisnis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Bahasa Indonesia — [Read this in English](README.md)*

</div>

---

## 📌 Ringkasan Eksekutif

**LimBot** adalah produk **Micro-SaaS Kasir & Pembukuan Digital** tanpa server (*serverless*) yang dirancang khusus untuk pemilik warung sembako, toko kelontong, agen, dan pedagang mikro.

Alih-alih menggunakan aplikasi kasir layar sentuh yang rumit atau software mahal, pemilik warung cukup mencatat seluruh transaksi harian secara santai melalui percakapan chat di **Telegram** (contoh: *"Laku beras 10kg 150rb"*, *"Bayar sales indomie 50rb"*, *"Bu Ani ngutang telur 20rb"*).

Di balik layar, model **Meta Llama-3 (melalui Groq Cloud)** membaca bahasa percakapan sehari-hari dan mengekstraknya menjadi data transaksi JSON terstruktur, yang langsung dicatat secara *real-time* ke **Dashboard Google Sheets** masing-masing warung lengkap dengan grafik laba rugi, rekapan pengeluaran, dan buku kasbon.

---

## 🏗️ Arsitektur Sistem & Alur Aliran Data

```mermaid
flowchart TD
    subgraph AntarmukaPengguna["Antarmuka Pemilik Warung (Telegram)"]
        A1["Chat Transaksi Harian<br/><i>misal: 'Laku beras 10kg 150rb'</i>"]
        A2["Perintah Nota / Stok<br/><i>misal: '/nota', '/stok'</i>"]
    end

    subgraph MesinServerless["Mesin Serverless (Google Apps Script)"]
        B1["Penerima Webhook (doPost)<br/><i>Anti-Spam & Rate Limiting</i>"]
        B2["Pemeriksaan Paywall Langganan<br/><i>Cek Status Kedaluwarsa Lisensi</i>"]
        B3["Ekstraksi Entitas AI (NLP)<br/><i>Groq Cloud (Model Llama-3 70B)</i>"]
        B4["Validasi Transaksi & Perutean Lembar Kerja"]
    end

    subgraph LapisanDatabase["Database Multi-Tenant (Google Sheets)"]
        C1[("Catatan Penjualan<br/>PENJUALAN")]
        C2[("Catatan Pengeluaran<br/>KULAKAN")]
        C3[("Buku Utang / Piutang<br/>KASBON")]
        C4["Dashboard Keuangan Sultan<br/><i>Grafik & Perhitungan Laba Rugi Otomatis</i>"]
    end

    subgraph DistribusiBalasan["Respon Real-Time"]
        D1["Pesan Konfirmasi Telegram<br/><i>'✅ Berhasil dicatat: Beras 10kg - Rp 150.000'</i>"]
        D2["Pembuat Tautan Nota Digital PDF"]
    end

    A1 --> B1
    A2 --> B1
    B1 --> B2
    B2 -->|Masa Aktif Valid| B3
    B3 --> B4
    B4 --> C1 & C2 & C3
    C1 & C2 & C3 --> C4
    B4 --> D1 --> AntarmukaPengguna
    B4 --> D2
```

---

## ⚡ Keunggulan Arsitektur & Bisnis

- **Biaya Server Rp 0 / Bulan (*Zero-Server Cost*)**: Berjalan sepenuhnya di atas infrastruktur serverless Google Apps Script dan Google Sheets, menghilangkan biaya sewa VPS atau database cloud bulanan.
- **Pemahaman Bahasa Slang & Singkatan Warung**: Arsitektur prompt khusus pada Groq Llama-3 yang mengenali singkatan pasar lokal Indonesia (contoh: `mnyk` = minyak, `brs` = beras, `rb` = ribu, `utang/kasbon` = piutang).
- **Pabrikasi Bot Otomatis (`LimBotFactory.js`)**: Skrip *infrastructure-as-code* berbasis `@google/clasp` untuk membuat, mengompilasi, mendeploy, dan menyambungkan webhook bot baru untuk klien dalam waktu **kurang dari 30 detik**.
- **Agen Otonom Rantai Pasok (`AgentOtonom_Stok.js`)**: Buku kas stok waktu-nyata (`Total Masuk - Total Keluar`), normalisasi kamus SKU, buffer hari aman (*safety stock*), dan pembuatan draf *Purchase Order* (PO) otomatis ke pemasok.
- **Database Mandiri (*Self-Healing Storage*)**: Menggandakan master template spreadsheet, membersihkan data simulasi (*auto-clean*), dan menyetel mata uang Rupiah (`IDR`) secara otomatis pada transaksi pertama klien.

---

## 🚀 Panduan Memulai Cepat

### 1. Prasyarat Sistem
- Node.js `>= 18.0.0`
- Token Bot Telegram (dibuat via [@BotFather](https://t.me/BotFather))
- Groq Cloud API Key (dibuat via [Groq Console](https://console.groq.com))
- Akun Google terautentikasi melalui `@google/clasp`:
  ```bash
  npx @google/clasp login
  ```

### 2. Pemasangan

```bash
# Salin repositori
git clone https://github.com/alimmiftah32-glitch/LimBot.git
cd LimBot

# Pasang dependensi
npm install
```

### 3. Mencetak Bot Baru untuk Klien (Pabrik)

Jalankan perintah pabrikasi otomatis:

```bash
npm run factory -- "<TOKEN_TELEGRAM_KLIEN>" "<GROQ_API_KEY>"
```

Mesin pabrik akan otomatis:
1. Menyiapkan kontainer Google Apps Script baru.
2. Menyuntikkan template transaksi V16 dengan token klien.
3. Melakukan deploy Web App production ke Google server.
4. Menyambungkan webhook langsung ke server Telegram.

### 4. Aktivasi Lisensi

1. Buka URL Apps Script yang dicetak di terminal dan jalankan fungsi `setupAwal` sekali untuk menyetujui izin OAuth.
2. Di dalam chat bot Telegram klien, aktifkan masa berlaku langganan:
   ```
   /perpanjang 30 admin123
   ```
3. Serahkan bot ke pemilik warung. Transaksi pertama yang dikirimkan klien akan otomatis membuatkan dashboard spreadsheet pribadi mereka!

---

## 📂 Struktur Direktori Repositori

```
├── LimBotFactory.js        # CLI pabrik otomatis pembuat bot klien
├── TemplateSembako.js      # Kode mesin transaksi utama Google Apps Script V16
├── AgentOtonom_Stok.js     # Agen otonom manajemen stok & rantai pasok
├── rebuild_bot.bat         # Skrip batch rebuild deployment cepat
├── buka_editor_manual.bat  # Peluncur cepat Google Apps Script web editor
├── docs/                   # Dokumentasi teknis & SOP bisnis
│   ├── SYSTEM_BLUEPRINT.md # Blueprint arsitektur & alur transaksi menyeluruh
│   ├── FACTORY_OPERATIONS.md# SOP operasional admin mencetak bot klien
│   ├── CS_PLAYBOOK.md      # Panduan CS & teknik mengatasi keberatan harga
│   └── user_guide.html     # Buku saku visual interaktif untuk pedagang
├── package.json            # Definisi proyek Node.js & CLI script
├── .env.example            # Template variabel lingkungan
└── LICENSE                 # Lisensi Open Source MIT
```

---

## 📖 Dokumentasi Arsitektur Mendalam

- [**Blueprint & Arsitektur Sistem**](docs/SYSTEM_BLUEPRINT.md)
- [**SOP Operasional Pabrik Bot**](docs/FACTORY_OPERATIONS.md)
- [**Playbook Customer Success & Edukasi Klien**](docs/CS_PLAYBOOK.md)

---

## 📄 Lisensi

Didistribusikan di bawah Lisensi MIT. Lihat [LICENSE](LICENSE) untuk rincian selengkapnya.
