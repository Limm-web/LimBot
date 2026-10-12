const TOKEN_BOT = "{{TOKEN}}";
const MASTER_SHEET_ID = "{{MASTER_SHEET_ID}}";
const GROQ_API_KEY = "{{GROQ_API_KEY}}";
const NAMA_BOT = "LimBot";
const NAMA_SHEET_PENJUALAN = "PENJUALAN";
const NAMA_SHEET_KULAKAN = "KULAKAN";
const NAMA_SHEET_KASBON = "KASBON";
const PASSWORD_ADMIN = "admin123"; // Password untuk perpanjang masa aktif

function getActiveSheetId() {
  const props = PropertiesService.getScriptProperties();
  let sid = props.getProperty("TARGET_SHEET_ID");
  if (!sid) {
    try {
      const file = DriveApp.getFileById(MASTER_SHEET_ID);
      const copied = file.makeCopy("Database Kasir Klien");
      sid = copied.getId();
      props.setProperty("TARGET_SHEET_ID", sid);
      copied.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
      
      // AUTO-CLEAN & SET LOCALE INDONESIA
      try {
          const ssBaru = SpreadsheetApp.openById(sid);
          ssBaru.setSpreadsheetLocale("id"); // Memaksa bahasa Indonesia (Bulan, Tanggal, Mata Uang)
          
          const bersihkan = (nama) => {
              const sheet = ssBaru.getSheetByName(nama);
              if (sheet && sheet.getLastRow() > 1) {
                  // Hapus dari baris ke-2 sampai akhir (menyisakan Header)
                  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
              }
          };
          bersihkan(NAMA_SHEET_PENJUALAN);
          bersihkan(NAMA_SHEET_KULAKAN);
          bersihkan(NAMA_SHEET_KASBON);
      } catch(err) {}

    } catch(e) {
      return "{{SHEET_ID}}";
    }
  }
  return sid;
}

// Cek dan Set Masa Percobaan 3 Hari
function cekMasaAktif(chatId) {
  const props = PropertiesService.getScriptProperties();
  let expStr = props.getProperty("EXPIRED_DATE");
  
  // TIDAK ADA TRIAL GRATIS. Default = Expired.
  if (!expStr) {
    return { expired: true, sisaHari: 0, trial: false };
  }
  
  const expDate = new Date(Number(expStr));
  const sekarang = new Date();
  const sisaMili = expDate.getTime() - sekarang.getTime();
  const sisaHari = Math.ceil(sisaMili / (1000 * 60 * 60 * 24));
  
  if (sisaMili <= 0) {
    return { expired: true, sisaHari: 0, trial: false };
  }
  
  return { expired: false, sisaHari: sisaHari, trial: false };
}

function getInfoHarga() {
  return "💳 <b>PILIHAN PAKET:</b>\n" +
         "1️⃣ <b>1 Bulan:</b> Rp 50.000 <i>(Promo! Normal <s>Rp 99.000</s>)</i>\n" +
         "2️⃣ <b>6 Bulan:</b> Rp 250.000 <i>(Promo! Normal <s>Rp 594.000</s>)</i>\n" +
         "3️⃣ <b>1 Tahun:</b> Rp 500.000 <i>(Promo! Normal <s>Rp 1.188.000</s>)</i>\n\n" +
         "🏦 <b>CARA BAYAR:</b>\n" +
         "Transfer ke rekening:\n" +
         "<b>Bank Jago</b>\n" +
         "<b>101108501047</b>\n" +
         "a.n <b>MIFTAH ALI MUDIN</b>\n\n" +
         "📸 Setelah transfer, <b>KIRIM FOTO BUKTI TRANSFER</b> ke chat ini.";
}

function getPesanPaywall() {
  return "🔒 <b>MASA AKTIF HABIS</b>\n\nMasa percobaan 3 hari Anda telah berakhir. Untuk terus menggunakan layanan Kasir AI, silakan perpanjang langganan:\n\n" + getInfoHarga();
}

function doPost(e) {
  if(typeof e === 'undefined') return;
  const data = JSON.parse(e.postData.contents);
  const message = data.message;
  if (!message) return;

  const chatId = message.chat.id;
  const statusAktif = cekMasaAktif(chatId);

  // Perintah rahasia admin bisa dieksekusi walau expired
  const text = message.text ? message.text.trim() : "";
  if (text.toLowerCase().startsWith("/perpanjang ")) {
      let balasan = prosesPesan(text, chatId, statusAktif);
      if (balasan) kirimTelegram(chatId, balasan);
      return;
  }

  // Jika masa aktif habis, blokir semua perintah (Kecuali /start)
  if (statusAktif.expired && text.toLowerCase() !== "/start") {
      // Jika kirim foto saat expired, anggap itu bukti transfer
      if (message.photo && message.photo.length > 0) {
          kirimTelegram(chatId, "⏳ <b>Bukti Transfer Diterima!</b>\n\nAdmin sedang melakukan pengecekan mutasi. Bot akan segera aktif setelah pembayaran divalidasi.");
          // Jika ada fitur forward ke Admin, bisa ditambahkan di sini
          return;
      }
      
      kirimTelegram(chatId, getPesanPaywall());
      return;
  }

  // AI VISION: Tangani Foto Struk / Buku Catatan (Saat masa aktif masih ada)
  if (message.photo && message.photo.length > 0) {
      prosesFoto(message.photo, message.caption || "", chatId);
      return;
  }

  if (!text) return;

  let balasan = prosesPesan(text, chatId, statusAktif);
  if (balasan) {
      if (typeof balasan === "object" && balasan !== null) {
          kirimTelegram(chatId, balasan.teks, balasan.keyboard);
      } else {
          kirimTelegram(chatId, balasan);
      }
  }
}

function prosesPesan(text, chatId, statusAktif) {
  const teksLower = text.toLowerCase();
  const sheetId = getActiveSheetId();
  const props = PropertiesService.getScriptProperties();
  
  // Fitur Admin Rahasia
  if (teksLower.startsWith("/perpanjang ")) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
          const hari = Number(parts[1]);
          const pass = parts[2];
          if (pass === PASSWORD_ADMIN) {
              let expStr = props.getProperty("EXPIRED_DATE");
              let expDate = expStr ? new Date(Number(expStr)) : new Date();
              if (expDate < new Date()) expDate = new Date(); // Jika sudah expired, hitung dari hari ini
              
              expDate.setDate(expDate.getDate() + hari);
              props.setProperty("EXPIRED_DATE", expDate.getTime().toString());
              return `✅ <b>BERHASIL DIPERPANJANG!</b>\n\nMasa aktif bot telah ditambah ${hari} hari.`;
          } else {
              return "❌ Password Admin salah.";
          }
      }
      return "❌ Format: `/perpanjang [JUMLAH_HARI] [PASSWORD]`";
  }

  // Jika expired, hanya boleh tampilkan paywall di /start
  if (statusAktif.expired && teksLower === "/start") {
      return getPesanPaywall();
  }

  const state = props.getProperty("STATE_" + chatId);

  // State Machine Nota
  if (state === "SETUP_NAMA_TOKO") {
      props.setProperty("NAMA_TOKO", text.trim());
      props.setProperty("STATE_" + chatId, "SETUP_ADMIN_FEE");
      return "✅ <b>Nama Toko Disimpan!</b>\n\nSelanjutnya, apakah ada <b>Biaya Admin</b> per struk?\n- Jika ada, ketik nominal angkanya saja (contoh: <code>2000</code>)\n- Jika tidak ada, ketik <code>0</code>";
  }

  if (state === "SETUP_ADMIN_FEE") {
      const admin = Number(text.replace(/[^0-9]/g, "")) || 0;
      props.setProperty("BIAYA_ADMIN", String(admin));
      props.deleteProperty("STATE_" + chatId);
      return "✅ <b>Pengaturan Struk Selesai!</b>\n\nSekarang Anda bisa mencetak nota. Contoh penggunaan:\n<code>/nota beras 5kg 75rb, telur 1kg 25rb</code>";
  }

  if (teksLower === "/langganan" || teksLower === "langganan" || teksLower === "/bayar" || teksLower === "bayar") {
    return "💎 <b>UPGRADE / PERPANJANG LANGGANAN</b>\n\n" +
           "Sisa masa aktif Anda saat ini: " + statusAktif.sisaHari + " Hari.\n\n" + 
           "Amankan akses bot Anda dengan memperpanjang masa aktif sekarang:\n\n" + getInfoHarga();
  }

  if (teksLower === "hai" || teksLower === "halo" || teksLower === "p" || teksLower === "hello" || teksLower === "ping") {
    return "👋 Halo! Saya adalah <b>" + NAMA_BOT + "</b>, asisten kasir cerdas Anda.\n\n" +
           "Ketik <b>panduan</b> untuk melihat cara menggunakan saya.";
  }

  if (teksLower === "/start" || teksLower === "panduan" || teksLower === "help") {
    let masaAktifTeks = `⚡ <i>Sisa Masa Aktif: ${statusAktif.sisaHari} Hari</i>\n\n`;

    const textStart = "👋 Halo! Selamat datang di <b>" + NAMA_BOT + "</b> ⚡ 📊\n\n" + masaAktifTeks +
           "Saya bantu kamu mencatat pemasukan, pengeluaran, hingga KASBON warung otomatis ke Buku Kas hanya lewat chat biasa.\n\n" +
           "📌 <b>Cara cepat:</b>\n" +
           "1️⃣ Kirim transaksi:\n" +
           "   - <i>Laku beras 5kg 75rb</i> (Pemasukan)\n" +
           "   - <i>Bayar listrik 150rb</i> (Pengeluaran)\n" +
           "   - <i>Bu RT ngutang beras 75rb</i> (Kasbon)\n" +
           "2️⃣ Kirim Foto (Fitur Baru!):\n" +
           "   - Foto struk belanja supplier\n" +
           "   - Foto buku utang lama / catatan warung\n" +
           "   Bot akan membaca semuanya pakai AI!\n\n" +
           "⚙️ <b>Fitur pintar:</b>\n" +
           "- Buka Dashboard Keuangan (/dashboard)\n" +
           "- Ringkasan Instan (/rekap)\n" +
           "- Aktifkan Laporan Malam (/alarm)\n" +
           "- Buat Struk WA Pelanggan (/nota)\n\n" +
           "✨ Pembukuan warung jadi mudah, cepat, dan otomatis terintegrasi dengan Laporan Digital!";

    return { 
        teks: textStart, 
        keyboard: {
            inline_keyboard: [
                [{ text: "📊 Buka Dashboard Keuangan", url: "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit" }]
            ]
        }
    };
  }

  if (teksLower === "/laporan" || teksLower === "/dashboard" || teksLower === "dashboard" || teksLower === "laporan") {
    return dapatkanLinkDashboard();
  }

  if (teksLower === "/cs" || teksLower === "cs" || teksLower === "/bantuan" || teksLower === "bantuan" || teksLower === "admin" || teksLower === "/admin") {
    return "📞 <b>BANTUAN & KENDALA (CS)</b>\n\n" +
           "Jika ada pertanyaan, keluhan, atau kendala di aplikasi, silakan hubungi Admin melalui WhatsApp:\n\n" +
           "📱 <b>WA: 085138231879</b>\n\n" +
           "<i>(Fast respon kalau admin lagi ngga tidur atau sakit ✌️)</i>";
  }

  if (teksLower === "rekap" || teksLower === "/rekap") return buatRekapTelegram();
  if (teksLower === "kas hari ini" || teksLower === "/kas") return kasHariIni();
  if (teksLower === "omset bulan ini" || teksLower === "/omset") return omsetBulanIni();
  
  if (teksLower === "/alarm" || teksLower === "alarm") {
    PropertiesService.getScriptProperties().setProperty("OWNER_CHAT_ID", String(chatId));
    PropertiesService.getScriptProperties().setProperty("ALARM_ACTIVE", "true");
    return "✅ <b>SATPAM WARUNG BERHASIL DIAKTIFKAN!</b>\n\nMulai malam ini, sistem akan merangkum keuangan dan melapor otomatis jam 21:00 malam.";
  }
  
  // Fitur Nota PDF
  if (teksLower.startsWith("/nota") || teksLower.startsWith("nota")) {
    const namaToko = props.getProperty("NAMA_TOKO");
    if (!namaToko) {
        props.setProperty("STATE_" + chatId, "SETUP_NAMA_TOKO");
        return "⚙️ <b>Setup Struk Pertama Kali</b>\n\nSilakan balas pesan ini dengan mengetik <b>NAMA TOKO</b> Anda untuk ditampilkan di kop struk PDF nanti.";
    }
    
    const pesanan = text.replace(/^(\/)?nota\s*/i, "").trim();
    if (pesanan === "") {
        return "📖 <b>PANDUAN CETAK NOTA</b>\n\nUntuk mencetak struk, ketik rincian pesanan tepat di samping perintah /nota.\n\n<b>Contoh:</b>\n<code>/nota beras 5kg 75rb, telur 2kg 50rb</code>";
    }
    
    buatNotaPDF(pesanan, chatId, namaToko, Number(props.getProperty("BIAYA_ADMIN") || 0));
    return null; 
  }

  const textDikoreksi = koreksiTypo(text);
  const hasilAI = parsingDenganAI(textDikoreksi);
  
  if (hasilAI && hasilAI.tipe) {
      let cekBarang = (hasilAI.barang || "").toString().trim().toLowerCase();
      // Deteksi jika nama barang yang ditangkap AI ternyata HANYA berisi angka / singkatan harga (contoh: "1rb", "5000", "50 k")
      let isHanyaHarga = /^[\d.,\s]+(rb|ribu|k)?$/i.test(cekBarang);
      
      if (!cekBarang || cekBarang.includes("tanpa keterangan") || isHanyaHarga) {
          return "⚠️ <b>NAMA BARANG KOSONG</b>\n\nAnda menyebutkan nominal harga tapi lupa menuliskan nama barangnya. Silakan ulangi (Contoh: Beli rokok 20rb).";
      }
      
      if (typeof hasilAI.nominal !== "number" || hasilAI.nominal <= 0) {
          return "⚠️ <b>HARGA KOSONG</b>\n\nAnda menyebutkan nama barang tapi lupa memasukkan harganya. Silakan ulangi (Contoh: Beras 10kg 150rb).";
      }
      
      return tambahTransaksiAITeks(hasilAI.tipe, hasilAI.barang, hasilAI.nominal, hasilAI.kategori, hasilAI.pelanggan);
  }

  return "⚠️ <b>AI Tidak Mengerti</b>\n\nMaaf, kalimat ini tidak terbaca sebagai transaksi. Pastikan ada nama barang/kegiatan dan harganya.";
}

// -----------------------------------------------------
// KOREKSI TYPO & PARSING
// -----------------------------------------------------
function koreksiTypo(teks) {
  const kamus = {
    "lku": "laku", "jual": "laku", "blnjo": "kulakan", "blanja": "kulakan",
    "brs": "beras", "mnyk": "minyak", "gla": "gula", "tlr": "telur", "telor": "telur",
    "udud": "rokok", "rkk": "rokok", "bks": "bungkus", "kps": "kapas",
    "krdus": "kardus", "dus": "kardus", "pcs": "buah", "btl": "botol"
  };
  let words = teks.toLowerCase().split(" ");
  for (let i = 0; i < words.length; i++) {
    if (kamus[words[i]]) {
      words[i] = kamus[words[i]];
    }
  }
  return words.join(" ");
}

function parsingDenganAI(teks) {
  if (!GROQ_API_KEY) return null;
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const systemPrompt = "Kamu asisten kasir warung. POSISIKAN DIRIMU SEBAGAI PEMILIK WARUNG.\n" +
                       "Ekstrak teks HANYA ke JSON dengan aturan berikut:\n" +
                       "- 'tipe': Pilih 'Masuk' (Penjualan warung. Jika teks cuma 'beras 10rb' tanpa subjek, ini Masuk), 'Keluar' (Pengeluaran warung. Jika ada kata 'buat beli...', 'bayar...', 'kulakan', atau kamu yang beli stok), 'Hutang' (jika pelanggan ngutang), 'Lunas' (jika pelanggan bayar utang).\n" +
                       "- 'barang': Tulis nama barang SECARA UTUH sesuai teks aslinya. Jika teks HANYA berisi angka/harga tanpa nama barang, KOSONGKAN nilai ini ('').\n" +
                       "- 'nominal': Angka bulat murni (75rb -> 75000).\n" +
                       "- 'kategori': (Sembako, Rokok, Utilitas, dll).\n" +
                       "- 'pelanggan': Nama pelanggan (wajib jika tipe Hutang/Lunas).\n" +
                       "DILARANG menambah teks apapun selain JSON murni.";
  const payload = {
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: teks }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  };
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json",
      headers: { "Authorization": "Bearer " + GROQ_API_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    const json = JSON.parse(response.getContentText());
    if (json.choices && json.choices.length > 0) {
      let aiText = json.choices[0].message.content.trim();
      aiText = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      return JSON.parse(aiText);
    }
  } catch (e) { return null; }
  return null;
}

// -----------------------------------------------------
// DATABASE INSERT & FORMAT TAMPILAN
// -----------------------------------------------------
function catatKeSheet(tipe, barang, nominal, kategori, pelanggan) {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  
  const keterangan = rapikan(barang) || "Tanpa Keterangan";
  const namaKategori = rapikan(kategori) || "Umum";
  const namaPelanggan = rapikan(pelanggan) || "Hamba Allah";
  const nominalAngka = Number(nominal);
  const waktuSekarang = new Date();
  
  let sheet;
  let id = "";

  if (tipe === "Masuk" || tipe === "Keluar") {
      const isMasuk = (tipe === "Masuk");
      const sheetName = isMasuk ? NAMA_SHEET_PENJUALAN : NAMA_SHEET_KULAKAN;
      sheet = ss.getSheetByName(sheetName);
      if(!sheet) return null;
      
      id = buatId(sheet);
      sheet.appendRow([id, waktuSekarang, waktuSekarang, keterangan, nominalAngka, namaKategori]);
      const lastRow = sheet.getLastRow();
      
      sheet.setRowHeight(lastRow, 35);
      let barisBaru = sheet.getRange(lastRow, 1, 1, 6);
      barisBaru.setVerticalAlignment("middle").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(lastRow, 4).setHorizontalAlignment("left"); 
      sheet.getRange(lastRow, 2).setNumberFormat("dd/MM/yyyy");
      sheet.getRange(lastRow, 3).setNumberFormat("HH:mm");
      sheet.getRange(lastRow, 5).setNumberFormat('"Rp"#,##0');
      sheet.autoResizeColumns(1, sheet.getLastColumn());
      return { id, keterangan, namaKategori, nominalAngka, tipe };
  } else if (tipe === "Hutang" || tipe === "Lunas") {
      sheet = ss.getSheetByName(NAMA_SHEET_KASBON);
      if(!sheet) return null;
      
      id = buatId(sheet);
      sheet.appendRow([id, waktuSekarang, waktuSekarang, namaPelanggan, keterangan, tipe, nominalAngka, namaKategori]);
      const lastRow = sheet.getLastRow();
      
      sheet.setRowHeight(lastRow, 35);
      let barisBaru = sheet.getRange(lastRow, 1, 1, 8);
      barisBaru.setVerticalAlignment("middle").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(lastRow, 5).setHorizontalAlignment("left"); 
      sheet.getRange(lastRow, 2).setNumberFormat("dd/MM/yyyy");
      sheet.getRange(lastRow, 3).setNumberFormat("HH:mm");
      sheet.getRange(lastRow, 7).setNumberFormat('"Rp"#,##0');
      sheet.autoResizeColumns(1, sheet.getLastColumn());
      return { id, keterangan, namaKategori, nominalAngka, tipe, pelanggan: namaPelanggan };
  }
  return null;
}

function tambahTransaksiAITeks(tipe, barang, nominal, kategori, pelanggan) {
  const hasil = catatKeSheet(tipe, barang, nominal, kategori, pelanggan);
  if (!hasil) return "⚠️ Gagal mencatat transaksi ke database.";
  
  if (tipe === "Masuk" || tipe === "Keluar") {
      const isMasuk = (tipe === "Masuk");
      const icon = isMasuk ? "✅" : "🔴";
      const title = isMasuk ? "PENJUALAN (MASUK)" : "KULAKAN (KELUAR)";
      return `${icon} <b>${title}</b>\n\nID: ${hasil.id}\nItem: ${hasil.keterangan}\nKategori: ${hasil.namaKategori}\nNominal: Rp${formatRupiah(hasil.nominalAngka)}`;
  } else {
      const icon = (tipe === "Hutang") ? "📒" : "💰";
      const title = (tipe === "Hutang") ? "KASBON (HUTANG BARU)" : "BAYAR KASBON (LUNAS)";
      return `${icon} <b>${title}</b>\n\nPelanggan: ${hasil.pelanggan}\nItem: ${hasil.keterangan}\nNominal: Rp${formatRupiah(hasil.nominalAngka)}`;
  }
}

// -----------------------------------------------------
// V12 AI VISION ENGINE (PHOTO OCR)
// -----------------------------------------------------
function prosesFoto(photoArray, caption, chatId) {
  kirimTelegram(chatId, "⏳ <b>Memproses Gambar...</b>\nSedang membaca data dari foto. Mohon tunggu sebentar...");
  try {
    const fileId = photoArray[photoArray.length - 1].file_id;
    const resUrl = UrlFetchApp.fetch("https://api.telegram.org/bot" + TOKEN_BOT + "/getFile?file_id=" + fileId);
    const path = JSON.parse(resUrl.getContentText()).result.file_path;
    const imageUrl = "https://api.telegram.org/file/bot" + TOKEN_BOT + "/" + path;
    
    const promptText = "Gambar ini adalah bukti transaksi (bisa berupa struk belanja, laporan keuangan, layar aplikasi lain, atau buku kasbon tulisan tangan). " +
                       "Ekstrak SEMUA transaksi (bisa banyak baris) yang ada di gambar. " +
                       "Kembalikan DALAM FORMAT JSON SAJA dengan struktur: { \"transaksi\": [ { \"tipe\": \"Masuk\"|\"Keluar\"|\"Hutang\"|\"Lunas\", \"barang\": \"nama barang\", \"nominal\": angka_bulat, \"kategori\": \"kategori umum\", \"pelanggan\": \"nama atau Hamba Allah\" } ] }. " +
                       "Jika struk/nota pembelian barang untuk warung, tipenya adalah 'Keluar'. Jika nota penjualan ke pelanggan, tipenya 'Masuk'. Jika buku piutang/catatan kasbon, tipenya 'Hutang'. " +
                       "Jika ada caption, gunakan sebagai konteks tambahan: " + caption;

    const payload = {
      model: "llama-3.2-90b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };
    
    const response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "post", contentType: "application/json",
      headers: { "Authorization": "Bearer " + GROQ_API_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    
    const json = JSON.parse(response.getContentText());
    if (json.choices && json.choices.length > 0) {
      let aiText = json.choices[0].message.content.trim();
      aiText = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(aiText);
      const daftar = parsed.transaksi || [];
      
      if (daftar.length === 0) {
         kirimTelegram(chatId, "⚠️ Tidak ada baris transaksi keuangan yang terdeteksi secara jelas di gambar ini.");
         return;
      }
      
      let report = "✅ <b>" + daftar.length + " TRANSAKSI BERHASIL DICATAT</b>\nData dari foto telah berhasil dimasukkan ke Excel:\n\n";
      daftar.forEach(trx => {
         catatKeSheet(trx.tipe, trx.barang, trx.nominal, trx.kategori, trx.pelanggan);
         report += "➔ " + trx.tipe + " | " + rapikan(trx.barang) + " | Rp" + formatRupiah(trx.nominal) + "\n";
      });
      
      kirimTelegram(chatId, report);
    } else {
      kirimTelegram(chatId, "❌ Gagal menganalisis gambar. Pastikan resolusi tulisan cukup jelas.");
    }
  } catch (e) {
    kirimTelegram(chatId, "❌ <b>Error Sistem Vision:</b> " + e.message);
  }
}

// -----------------------------------------------------
// NOTA DIGITAL (PDF ENGINE)
// -----------------------------------------------------
function buatNotaPDF(pesanan, chatId, namaToko, biayaAdmin) {
  if (!GROQ_API_KEY) {
      kirimTelegram(chatId, "API Key Groq tidak ditemukan.");
      return;
  }

  kirimTelegram(chatId, "🖨️ <b>Mencetak Struk PDF...</b>");
  
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const systemPrompt = "Kamu adalah sistem kasir. Ekstrak pesanan menjadi JSON HANYA. " +
                       "Format: { \"items\": [ { \"nama\": \"Beras 5kg\", \"harga\": 75000 } ], \"total\": 75000 }";
  
  const payload = {
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: pesanan }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  };
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json",
      headers: { "Authorization": "Bearer " + GROQ_API_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    
    const json = JSON.parse(response.getContentText());
    if (json.choices && json.choices.length > 0) {
        let aiText = json.choices[0].message.content.trim();
        aiText = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        const res = JSON.parse(aiText);
        const items = res.items || [];
        const subtotal = res.total || 0;
        
        if (items.length === 0) throw new Error("Gagal parsing daftar pesanan");

        let dateStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMMM yyyy HH:mm");
        let html = `<div style="font-family: monospace; width: 350px; border: 1px solid #000; padding: 25px; text-align: center; color: #000;">`;
        html += `<h2 style="margin:0;">${namaToko.toUpperCase()}</h2><p style="margin:5px 0 15px 0; color:#555;">${dateStr}</p><hr style="border-top:2px dashed #000;">`;
        html += `<table style="width:100%; text-align: left; font-size: 16px; margin: 15px 0;">`;
        items.forEach(item => {
           html += `<tr><td style="padding: 5px 0;">${item.nama}</td><td style="text-align:right; padding: 5px 0;">Rp${formatRupiah(item.harga)}</td></tr>`;
        });
        
        html += `</table><hr style="border-top:2px dashed #000;">`;
        html += `<table style="width:100%; text-align: left; font-size: 16px;">`;
        html += `<tr><td>Subtotal</td><td style="text-align:right;">Rp${formatRupiah(subtotal)}</td></tr>`;
        
        let adminText = biayaAdmin > 0 ? `Rp${formatRupiah(biayaAdmin)}` : "Gratis";
        html += `<tr><td>Biaya Admin</td><td style="text-align:right;">${adminText}</td></tr>`;
        
        let grandTotal = subtotal + biayaAdmin;
        
        html += `</table><hr style="border-top:2px dashed #000;">`;
        html += `<h3 style="text-align:right; margin: 15px 0;">TOTAL: Rp${formatRupiah(grandTotal)}</h3>`;
        html += `<p style="margin-top: 20px; font-style: italic;">Terima kasih telah berbelanja!</p></div>`;

        const blob = Utilities.newBlob(html, MimeType.HTML, "Nota_Digital.html").getAs(MimeType.PDF);
        blob.setName("Nota_" + Date.now() + ".pdf");
        
        kirimDokumenTelegram(chatId, blob, "🧾 <b>STRUK PDF BERHASIL DICETAK!</b>\n\nSilakan teruskan (Forward) dokumen ini ke WhatsApp pelanggan.");
    }
  } catch(e) {
     kirimTelegram(chatId, "❌ Gagal mencetak struk PDF: " + e.message);
  }
}

// -----------------------------------------------------
// HELPERS (REKAP, DASHBOARD, TELEGRAM)
// -----------------------------------------------------
function setupAwal() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("kirimLaporanHarian").timeBased().atHour(21).everyDays(1).create();
}

function kirimLaporanHarian() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("ALARM_ACTIVE") !== "true") return;
  const chatId = props.getProperty("OWNER_CHAT_ID");
  if (!chatId) return;
  const rekap = buatRekapTelegram();
  kirimTelegram(chatId, "👮‍♂️ <b>LAPORAN SATPAM WARUNG (JAM TUTUP)</b>\n\nSelamat malam, Bos! Waktunya tutup buku. Berikut ringkasan hari ini:\n\n" + rekap);
}

function buatRekapTelegram() {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  const dataMasuk = ss.getSheetByName(NAMA_SHEET_PENJUALAN).getDataRange().getValues();
  const dataKeluar = ss.getSheetByName(NAMA_SHEET_KULAKAN).getDataRange().getValues();

  const hariIni = new Date();
  let totalMasuk = hitungTotal(dataMasuk, hariIni, "bulanan");
  let totalKeluar = hitungTotal(dataKeluar, hariIni, "bulanan");
  let laba = totalMasuk - totalKeluar;

  let kategoriKeluar = {};
  for (let i = 1; i < dataKeluar.length; i++) {
    const tanggal = new Date(dataKeluar[i][1]);
    if (tanggal.getMonth() === hariIni.getMonth() && tanggal.getFullYear() === hariIni.getFullYear()) {
      const nominal = Number(dataKeluar[i][4]) || 0;
      const kategori = dataKeluar[i][5] || "Umum";
      kategoriKeluar[kategori] = (kategoriKeluar[kategori] || 0) + nominal;
    }
  }

  let arrKategori = Object.keys(kategoriKeluar).map(k => ({nama: k, total: kategoriKeluar[k]}));
  arrKategori.sort((a, b) => b.total - a.total);
  let teksTopKeluar = "";
  let limit = Math.min(3, arrKategori.length);
  for (let i = 0; i < limit; i++) {
    teksTopKeluar += (i+1) + ". " + arrKategori[i].nama + " (Rp" + formatRupiah(arrKategori[i].total) + ")\n";
  }
  if (teksTopKeluar === "") teksTopKeluar = "- Belum ada pengeluaran\n";

  return "📊 <b>REKAP BULAN INI</b>\n\n" +
         "💰 Pemasukan : Rp" + formatRupiah(totalMasuk) + "\n" +
         "💸 Pengeluaran: Rp" + formatRupiah(totalKeluar) + "\n" +
         "------------------------\n" +
         "🏆 <b>Laba Bersih: Rp" + formatRupiah(laba) + "</b>\n\n" +
         "⚠️ <b>Pengeluaran Terbesar:</b>\n" + teksTopKeluar;
}

function kasHariIni() {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  let totalMasuk = hitungTotal(ss.getSheetByName(NAMA_SHEET_PENJUALAN).getDataRange().getValues(), new Date(), "harian");
  let totalKeluar = hitungTotal(ss.getSheetByName(NAMA_SHEET_KULAKAN).getDataRange().getValues(), new Date(), "harian");
  return "📊 <b>KAS HARI INI</b>\n\nPemasukan : Rp" + formatRupiah(totalMasuk) + "\nPengeluaran: Rp" + formatRupiah(totalKeluar) + "\nLaba Bersih: Rp" + formatRupiah(totalMasuk - totalKeluar);
}

function omsetBulanIni() {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  let totalMasuk = hitungTotal(ss.getSheetByName(NAMA_SHEET_PENJUALAN).getDataRange().getValues(), new Date(), "bulanan");
  let totalKeluar = hitungTotal(ss.getSheetByName(NAMA_SHEET_KULAKAN).getDataRange().getValues(), new Date(), "bulanan");
  return "📈 <b>OMSET BULAN INI</b>\n\nPemasukan : Rp" + formatRupiah(totalMasuk) + "\nPengeluaran: Rp" + formatRupiah(totalKeluar) + "\nLaba Bersih: Rp" + formatRupiah(totalMasuk - totalKeluar);
}

function hitungTotal(data, targetDate, mode) {
  let total = 0;
  for (let i = 1; i < data.length; i++) {
    const tanggal = new Date(data[i][1]); 
    const nominal = Number(data[i][4]) || 0; 
    if (mode === "harian" && tanggal.getDate() === targetDate.getDate() && tanggal.getMonth() === targetDate.getMonth() && tanggal.getFullYear() === targetDate.getFullYear()) total += nominal;
    else if (mode === "bulanan" && tanggal.getMonth() === targetDate.getMonth() && tanggal.getFullYear() === targetDate.getFullYear()) total += nominal;
  }
  return total;
}

function dapatkanLinkDashboard() {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  const sheets = ss.getSheets();
  let text = "📊 <b>PINTASAN DASHBOARD KEUANGAN</b>\n\nKlik link di bawah untuk membuka menu yang diinginkan:\n\n";
  const keyboard = { inline_keyboard: [] };
  
  for (let i = 0; i < sheets.length; i++) {
      let sName = sheets[i].getName();
      if (sName.toLowerCase().includes("dashboard") && !sheets[i].isSheetHidden()) {
          let gid = sheets[i].getSheetId();
          let link = "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit#gid=" + gid;
          text += "👉 <a href='" + link + "'>" + sName + "</a>\n";
          keyboard.inline_keyboard.push([{ text: "📊 " + sName, url: link }]);
      }
  }
  return { teks: text, keyboard: keyboard };
}

function rapikan(teks) {
  if (!teks) return "";
  return teks.split(" ").filter(Boolean).map(kata => kata.charAt(0).toUpperCase() + kata.slice(1)).join(" ");
}

function buatId(sheet) {
  const jumlahData = Math.max(0, sheet.getLastRow() - 1);
  return "TRX-" + String(jumlahData + 1).padStart(4, "0");
}

function formatRupiah(angka) {
  return Number(angka).toLocaleString("id-ID");
}

function kirimTelegram(chatId, text, replyMarkup) {
  const payload = { chat_id: String(chatId), text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + TOKEN_BOT + "/sendMessage", {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload)
  });
}

function kirimDokumenTelegram(chatId, blob, caption) {
  const payload = { chat_id: String(chatId), document: blob, caption: caption, parse_mode: "HTML" };
  UrlFetchApp.fetch("https://api.telegram.org/bot" + TOKEN_BOT + "/sendDocument", {
    method: "post", payload: payload
  });
}








