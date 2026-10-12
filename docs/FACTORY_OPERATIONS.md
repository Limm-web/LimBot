# 🏭 LimBot Factory Operations — Standard Operating Procedure (SOP)

> **Administrative Guide for Provisioning and Deploying Client Bot Instances**

---

## 📋 Phase 1: Pre-Deployment Checklist

Before running the factory, ensure you have:
1. **Telegram Bot Token**: Generated via Telegram [@BotFather](https://t.me/BotFather).
2. **Groq API Key**: Active API token from [Groq Cloud Console](https://console.groq.com).
3. **Google Apps Script CLI (`clasp`)**: Authenticated with Google Cloud:
   ```bash
   npx @google/clasp login
   ```

---

## 🚀 Phase 2: Running the Factory Engine

Open your terminal in the project directory and run:

```bash
npm run factory -- "<CLIENT_TELEGRAM_TOKEN>" "<GROQ_API_KEY>"
# Or directly:
node LimBotFactory.js "<CLIENT_TELEGRAM_TOKEN>" "<GROQ_API_KEY>"
```

### What the Engine Performs Automatically:
1. Provisions an isolated Google Apps Script project.
2. Injects `TemplateSembako.js` with client tokens and AI parameters.
3. Compiles the deployment manifest (`appsscript.json`).
4. Pushes source code to Google Cloud servers.
5. Deploys a production web application endpoint.
6. Automatically binds the Telegram webhook with anti-spam rate limiting enabled.

---

## 🔑 Phase 3: Authorization & License Activation

Once the factory CLI reports `SUCCESS`, complete the two-step activation:

### Step 1: Grant OAuth Permissions
1. Open the **Google Apps Script Editor URL** printed at the end of the factory output.
2. At the top navigation toolbar, select the `setupAwal` function from the dropdown.
3. Click **Run**.
4. Complete the Google OAuth authorization prompt (`Review Permissions` ➔ `Advanced` ➔ `Go to script (unsafe)` ➔ `Allow`).

### Step 2: Set Subscription Duration (Paywall)
1. Open the deployed Telegram Bot.
2. Execute the administrative command:
   ```
   /perpanjang 30 admin123
   ```
   *(Replace `30` with desired subscription days, and `admin123` with your master admin password).*
3. The bot is now fully active and ready for client handover.

---

## 🤝 Phase 4: Merchant Handover

Instruct the client to:
1. Click **/start** on Telegram.
2. Send **/nota** to configure merchant business name and optional receipt fee.
3. Send their first transaction (e.g., `"Laku beras 10kg 150rb"`).
4. The system will automatically instantiate their personal Google Sheets database and send back the private dashboard link.

---

## 🛠️ Troubleshooting & Mitigations

| Symptom | Probable Cause | Action / Resolution |
|---|---|---|
| **Webhook Binding Failure (`ECONNRESET`)** | Transient ISP/DNS throttling to Telegram API | Copy the fallback webhook URL output in the terminal and open it once in your browser. |
| **Bot Unresponsive to Messages** | Missing OAuth authorization | Re-open the Apps Script console and execute `setupAwal` once. |
| **"Masa Aktif Habis" Message** | Subscription expiration | Execute `/perpanjang <days> <admin_password>` to extend license validity. |
