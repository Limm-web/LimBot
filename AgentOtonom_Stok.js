// ============================================================
// 🤖 LIMBOT ASCA MODULE — Autonomous Supply Chain Agent V1.0
// ============================================================
// CARA PAKAI: Copy seluruh file ini ke BAWAH TemplateSembako.js,
// lalu lakukan 3 penyuntikan (lihat komentar ">>> HOOK") :
//
// HOOK 1) Di dalam doPost(e): tambahkan branch callback_query
//         paling atas setelah parsing e.postData.contents.
// HOOK 2) Di dalam prosesPesan(): tambahkan routing perintah
//         "/stok", "/scan", "/po", "/supplier" SEBELUM blok AI parsing.
// HOOK 3) Di dalam setupAwal(): tambahkan trigger pagi 07:00.
//
// Konfigurasi default agen (bisa diubah lewat /setagen):
//   LEAD_TIME_DAYS : 2  (berapa hari tunggu supplier antar)
//   SAFETY_DAYS    : 3  (buffer stok darurat)
//   HORIZON_DAYS   : 14 (jumlah hari stok yang ingin dicukupi saat PO)
// ============================================================

const SHEET_SUPPLIER = "SUPPLIER_HARGA";
const AGENT_KAMUS_SKU = {
  // kanonis : [varian tulisan masyarakat]
  "minyak goreng": ["minyak", "mnyk", "goring", "goreng", "minyak goring", "minyak goreng"],
  "gula pasir": ["gula", "gla", "gula pasir", "gula putih"],
  "beras": ["beras", "brs", "beras premium"],
  "telur ayam": ["telur", "telor", "tlr", "ayam telur"],
  "terigu": ["terigu", "tepung terigu", "tepung"],
  "kecap manis": ["kecap", "kecap manis"],
  "kopi sachet": ["kopi", "kopu", "kopi sachet"],
  "rokok": ["rokok", "udud", "rkk", "sampoerna", "gudang garam"]
};

// ------------------------------------------------------------
// UTIL: NORMALISASI SKU
// ------------------------------------------------------------
function normalisasiSKU(namaBarang) {
  if (!namaBarang) return "";
  const teks = namaBarang.toString().toLowerCase().trim();

  // Cek kamus lokal dulu (hemat kuota API)
  for (const kanon in AGENT_KAMUS_SKU) {
    for (const varian of AGENT_KAMUS_SKU[kanon]) {
      if (teks.indexOf(varian) !== -1) return kanon;
    }
  }

  // Ambil 2 kata pertama sebagai fallback heuristik lokal
  const kata = teks.replace(/[^a-z0-9\s]/g, "").split(/\s+/).slice(0, 2).join(" ");
  return kata || teks;
}

// ------------------------------------------------------------
// LAPIS COGNITION: STOCK LEDGER ENGINE
// Stok bersih = SUM(Kulakan SKU) - SUM(Penjualan SKU)
// ------------------------------------------------------------
function bangunLedgerStok() {
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  const ledger = {}; // sku -> { masuk, keluar, sisa }

  const proses = (sheetName, arah) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      // Kolom mengikuti format V16: [ID, Tgl, Jam, Barang, Nominal, Kategori]
      const barang = data[i][3];
      if (!barang) continue;
      const sku = normalisasiSKU(barang);
      if (!ledger[sku]) ledger[sku] = { masuk: 0, keluar: 0, transaksiTerakhir: null };
      if (arah === "masuk") ledger[sku].masuk += 1;
      else ledger[sku].keluar += 1;
      ledger[sku].transaksiTerakhir = new Date(data[i][1]);
    }
  };

  proses(NAMA_SHEET_KULAKAN, "masuk");
  proses(NAMA_SHEET_PENJUALAN, "keluar");

  Object.keys(ledger).forEach(sku => {
    ledger[sku].sisa = ledger[sku].masuk - ledger[sku].keluar;
  });
  return ledger;
}

// ------------------------------------------------------------
// VELOCITY & REORDER POINT
// ------------------------------------------------------------
function hitungVelocity(sku, jumlahHari) {
  jumlahHari = jumlahHari || 30;
  const sheetId = getActiveSheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(NAMA_SHEET_PENJUALAN);
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const batas = new Date();
  batas.setDate(batas.getDate() - jumlahHari);

  let totalUnit = 0;
  for (let i = 1; i < data.length; i++) {
    const tgl = new Date(data[i][1]);
    if (tgl >= batas && normalisasiSKU(data[i][3]) === sku) totalUnit++;
  }
  return +(totalUnit / jumlahHari).toFixed(2); // unit/hari
}

function getConfigAgen() {
  const props = PropertiesService.getScriptProperties();
  return {
    leadTime: Number(props.getProperty("LEAD_TIME_DAYS") || 2),
    safety: Number(props.getProperty("SAFETY_DAYS") || 3),
    horizon: Number(props.getProperty("HORIZON_DAYS") || 14)
  };
}

function analisaStokKritis() {
  const cfg = getConfigAgen();
  const ledger = bangunLedgerStok();
  const hasil = [];

  Object.keys(ledger).forEach(sku => {
    const L = ledger[sku];
    if (L.sisa <= 0) return;              // tidak ada stok sama sekali -> skip (belum dilacak)
    const v30 = hitungVelocity(sku, 30);
    if (v30 <= 0) return;                  // tidak laku -> bukan urusan reorder

    const hariHabis = +(L.sisa / v30).toFixed(1);
    const rop = Math.ceil(v30 * (cfg.leadTime + cfg.safety)); // titik pemesanan ulang

    if (L.sisa <= rop || hariHabis <= (cfg.leadTime + cfg.safety)) {
      hasil.push({
        sku: sku,
        sisa: L.sisa,
        velocity: v30,
        hariHabis: hariHabis,
        usulanQty: Math.max(1, Math.ceil(v30 * cfg.horizon) - L.sisa)
      });
    }
  });

  hasil.sort((a, b) => a.hariHabis - b.hariHabis);
  return hasil;
}

// ------------------------------------------------------------
// LAPIS PERCEPTION TAMBAHAN: SUPPLIER PRICE BOOK (AI Vision)
// ------------------------------------------------------------
function pastikanSheetSupplier() {
  const ss = SpreadsheetApp.openById(getActiveSheetId());
  let sh = ss.getSheetByName(SHEET_SUPPLIER);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SUPPLIER);
    sh.appendRow(["SKU", "Supplier", "Harga", "Tanggal"]);
  }
  return sh;
}

function simpanHargaSupplier(daftar, namaSupplier) {
  const sh = pastikanSheetSupplier();
  daftar.forEach(item => {
    sh.appendRow([normalisasiSKU(item.sku), namaSupplier || item.supplier || "Supplier",
                  Number(item.harga) || 0, new Date()]);
  });
  return daftar.length;
}

function bandingkanHargaSupplier(sku) {
  const sh = pastikanSheetSupplier();
  const data = sh.getDataRange().getValues();
  const opsi = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sku && Number(data[i][2]) > 0) {
      opsi.push({ supplier: data[i][1], harga: Number(data[i][2]) });
    }
  }
  opsi.sort((a, b) => a.harga - b.harga);
  return opsi;
}

// ------------------------------------------------------------
// LAPIS ACTION: DRAFT PO + APPROVAL (HUMAN-IN-THE-LOOP)
// ------------------------------------------------------------
function susunDraftPO(chatId) {
  const kritis = analisaStokKritis();
  if (kritis.length === 0) {
    return "✅ <b>Semua stok aman.</b>\nTidak ada barang yang mendekati batas pesan ulang. Agen tidak melakukan apa-apa — dan itu keputusan yang benar.";
  }

  let teks = "🧾 <b>DRAFT PURCHASE ORDER</b>\n";
  teks += "<i>Disusun otomatis oleh Agen berdasarkan velocity 30 hari.</i>\n\n";
  const rincian = [];

  kritis.slice(0, 5).forEach((item, idx) => {
    const hargaOps = bandingkanHargaSupplier(item.sku);
    const terbaik = hargaOps[0];
    teks += `<b>${idx + 1}. ${rapikan(item.sku)}</b>\n`;
    teks += `   Sisa: ${item.sisa} | Terjual ±${item.velocity}/hari\n`;
    teks += `   Estimasi habis: <b>${item.hariHabis} hari lagi</b> ⏳\n`;
    teks += `   Usulan pesan: <b>${item.usulanQty} unit</b> (cukup ${getConfigAgen().horizon} hari)\n`;
    if (terbaik) {
      teks += `   💰 Harga terbaik: ${terbaik.supplier} @ Rp${formatRupiah(terbaik.harga)}\n`;
      if (hargaOps.length > 1) {
        teks += `   <i>(Banding: ${hargaOps[1].supplier} @ Rp${formatRupiah(hargaOps[1].harga)})</i>\n`;
      }
    }
    teks += "\n";
    rincian.push({ sku: item.sku, qty: item.usulanQty, harga: terbaik ? terbaik.harga : 0, supplier: terbaik ? terbaik.supplier : "-" });
  });

  // Simpan draft agar tombol approve tahu apa yang disetujui
  PropertiesService.getScriptProperties().setProperty("PO_DRAFT_" + chatId, JSON.stringify(rincian));

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ SETUJUI & CATAT PO", callback_data: "PO_APPROVE" },
      { text: "❌ Batalkan", callback_data: "PO_CANCEL" }
    ]]
  };
  return { teks: teks, keyboard: keyboard };
}

function eksekusiApprovalPO(chatId) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("PO_DRAFT_" + chatId);
  if (!raw) return "⚠️ Draft PO tidak ditemukan. Ketik /scan untuk menyusun ulang.";

  const rincian = JSON.parse(raw);
  const sh = pastikanSheetSupplier(); // PO dicatat di sheet supplier (kolom audit)
  const idPO = "PO-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyMMdd-HHmm");

  let teksPO = "📦 <b>PO TERKIRIM / TERCATAT: " + idPO + "</b>\n\n";
  teksPO += "Kepada Yth. Supplier,\nberikut pesanan pembelian kami:\n\n";

  rincian.forEach(item => {
    sh.appendRow(["[PO] " + item.sku, item.supplier, item.qty * item.harga, new Date(), idPO, item.qty + "x"]);
    teksPO += `• ${rapikan(item.sku)} × ${item.qty}${item.harga > 0 ? " @Rp" + formatRupiah(item.harga) : ""}\n`;
  });

  props.deleteProperty("PO_DRAFT_" + chatId);
  teksPO += "\n✍️ Silakan forward pesan ini ke chat supplier Anda.";
  return teksPO;
}

// ------------------------------------------------------------
// LAPIS ACTION: LAPORAN PAGI OTONOM (TRIGGER 07:00)
// ------------------------------------------------------------
function laporanPagiOtonom() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("AGENT_ACTIVE") !== "true") return;
  const chatId = props.getProperty("OWNER_CHAT_ID");
  if (!chatId) return;

  const kritis = analisaStokKritis();
  if (kritis.length === 0) {
    kirimTelegram(chatId, "🌅 <b>LAPORAN PAGI AGEN</b>\n\nSemua stok dalam kondisi sehat. Tidak ada tindakan yang diperlukan hari ini. 👍");
    return;
  }

  let teks = "🌅 <b>LAPORAN PAGI AGEN GUDANG</b>\n\n";
  teks += "Simulasi semalam menemukan <b>" + kritis.length + " barang berisiko kehabisan</b>:\n\n";
  kritis.forEach((item, i) => {
    teks += `${i + 1}. <b>${rapikan(item.sku)}</b> — sisa ±${item.hariHabis} hari\n`;
  });
  teks += "\nMau saya susunkan draft Purchase Order?";
  kirimTelegram(chatId, teks, { inline_keyboard: [[{ text: "🧾 Ya, Susun PO", callback_data: "PO_BUILD" }]] });
}

// ------------------------------------------------------------
// ROUTER PERINTAH BARU
// ------------------------------------------------------------
function routerAgent(text, chatId) {
  const teksLower = text.toLowerCase().trim();

  if (teksLower === "/stok" || teksLower === "stok") {
    const ledger = bangunLedgerStok();
    const skus = Object.keys(ledger);
    if (skus.length === 0) return "📦 Belum ada data stok. Catat kulakan & penjualan dulu, nanti agen menghitung sendiri.";

    let teks = "📦 <b>STOK VIRTUAL (Dihitung dari transaksi)</b>\n";
    teks += "<i>Kulakan − Penjualan, tanpa input manual</i>\n\n";
    skus.sort((a, b) => ledger[a].sisa - ledger[b].sisa);
    skus.forEach(sku => {
      const L = ledger[sku];
      const icon = L.sisa <= 3 ? "🔴" : (L.sisa <= 8 ? "🟡" : "🟢");
      teks += `${icon} ${rapikan(sku)}: <b>${L.sisa}</b> unit (masuk ${L.masuk}, laku ${L.keluar})\n`;
    });
    teks += "\n💡 Ketik <code>/scan</code> untuk analisis kapan stok habis.";
    return teks;
  }

  if (teksLower === "/scan" || teksLower === "scan") {
    return susunDraftPO(chatId);
  }

  if (teksLower === "/agent" || teksLower === "/aktifkan agen" || teksLower === "aktifkan agen") {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("AGENT_ACTIVE", "true");
    props.setProperty("OWNER_CHAT_ID", String(chatId));
    return "🤖 <b>AGEN GUDANG OTONOM AKTIF!</b>\n\nSetiap jam 07:00 pagi, saya akan memeriksa seluruh stok dan memberi tahu jika ada barang yang akan habis — SEBELUM pelanggan Anda kecewa.\n\nPerintah baru:\n• /stok — lihat stok virtual\n• /scan — analisis reorder point\n• /setagen — atur lead time & buffer";
  }

  if (teksLower.startsWith("/setagen")) {
    const parts = text.split(" ");
    const props = PropertiesService.getScriptProperties();
    if (parts.length >= 4) {
      props.setProperty("LEAD_TIME_DAYS", String(Number(parts[1]) || 2));
      props.setProperty("SAFETY_DAYS", String(Number(parts[2]) || 3));
      props.setProperty("HORIZON_DAYS", String(Number(parts[3]) || 14));
      return "⚙️ Konfigurasi agen disimpan:\n• Lead time: " + parts[1] + " hari\n• Safety stock: " + parts[2] + " hari\n• Horizon belanja: " + parts[3] + " hari";
    }
    const c = getConfigAgen();
    return "⚙️ <b>PENGATURAN AGEN</b>\nLead time: " + c.leadTime + " hari | Safety: " + c.safety + " hari | Horizon: " + c.horizon + " hari\n\nUbah dengan: <code>/setagen [leadTime] [safety] [horizon]</code>\nContoh: <code>/setagen 3 4 21</code>";
  }

  return null; // Bukan perintah agen -> lanjut ke logika lama
}

// ------------------------------------------------------------
// HANDLER CALLBACK (TOMBOL INLINE TELEGRAM)
// ------------------------------------------------------------
function handleCallbackQuery(callback) {
  const chatId = callback.message.chat.id;
  const dataCb = callback.data || "";

  if (dataCb === "PO_BUILD") {
    const hasil = susunDraftPO(chatId);
    if (typeof hasil === "object") kirimTelegram(chatId, hasil.teks, hasil.keyboard);
    else kirimTelegram(chatId, hasil);
  } else if (dataCb === "PO_APPROVE") {
    kirimTelegram(chatId, eksekusiApprovalPO(chatId));
  } else if (dataCb === "PO_CANCEL") {
    PropertiesService.getScriptProperties().deleteProperty("PO_DRAFT_" + chatId);
    kirimTelegram(chatId, "🗑️ Draft PO dibatalkan. Agen tidak mencatat apa-apa.");
  }
}

// ============================================================
// >>> INSTRUKSI PENYUNTikan KE TEMPLATE SEMBAKO.JS <<<
// ============================================================
//
// (HOOK 1) Di doPost(e), tepat setelah: const data = JSON.parse(...);
//   ----------------------------------------
//   if (data.callback_query) {
//     handleCallbackQuery(data.callback_query);
//     return;
//   }
//   ----------------------------------------
//
// (HOOK 2) Di awal prosesPesan(), setelah blok /perpanjang:
//   ----------------------------------------
//   const hasilAgen = routerAgent(text, chatId);
//   if (hasilAgen) return hasilAgen;
//   ----------------------------------------
//
// (HOOK 3) Di setupAwal(), tambahkan trigger pagi:
//   ----------------------------------------
//   ScriptApp.newTrigger("laporanPagiOtonom").timeBased().atHour(7).everyDays(1).create();
//   ----------------------------------------
//
// (AKTIVASI) User mengetik: /agent  → agen aktif + laporan pagi jalan.
