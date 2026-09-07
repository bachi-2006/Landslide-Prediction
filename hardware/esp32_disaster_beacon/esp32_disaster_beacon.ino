/*
 * =====================================================================================
 *  NE-SHIELD: ESP32 Offline Disaster Alert Beacon & Captive Portal Node
 *  Smart India Hackathon (SIH) 2026
 *
 *  Features:
 *    1. DUAL WI-FI MODE (AP + STA):
 *       - AP Mode: Broadcasts "NE-SHIELD-EMERGENCY" (Open Wi-Fi for disaster victims).
 *       - STA Mode: Connects to local phone hotspot or router to poll live backend.
 *    2. OFFLINE CAPTIVE PORTAL (DNS 53 Intercept):
 *       - Captive redirection for Android, iOS, Windows, macOS, and Linux devices.
 *       - Serves Evacuation Instructions & Designated Safe Point Corridor.
 *       - Offline SOS Distress Logger directly in non-volatile flash (Preferences).
 *    3. HARDWARE ACTUATION:
 *       - GPIO 2: Built-in Status / Alert Beacon LED.
 *       - GPIO 4: Emergency Acoustic Siren / High-Decibel Buzzer.
 *    4. CLOUD SYNCHRONIZATION:
 *       - Real-time polling of https://ne-shield-api.onrender.com/api/alert/hardware/status
 *       - Compatible with HTTPS (WiFiClientSecure) and local HTTP LAN IPs.
 *       - Admin endpoint (/admin) to view all offline triage logs and sync to cloud.
 * =====================================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// =====================================================================================
// 1. CONFIGURATION: WI-FI & BACKEND
// =====================================================================================

// [STA MODE] Wi-Fi credentials to connect ESP32 to Internet (e.g. Phone Hotspot)
const char* sta_ssid     = "MSI 6704";            // Change to your Wi-Fi / Hotspot SSID
const char* sta_password = "YOUR_WIFI_PASSWORD";   // Change to your Wi-Fi password

// [AP MODE] Emergency Wi-Fi broadcasted by ESP32 for citizens (Captive Portal)
const char* ap_ssid      = "NE-SHIELD-EMERGENCY";  // Open network
const char* ap_password  = "";                     // No password needed for victims

// [BACKEND API] NE-SHIELD Cloud API or local server endpoint
// For Live Cloud Backend:
const char* backend_status_url = "https://ne-shield-api.onrender.com/api/alert/hardware/status";
const char* backend_relief_url = "https://ne-shield-api.onrender.com/api/routes/relief-requests";

// If testing locally on LAN, comment above and uncomment:
// const char* backend_status_url = "http://192.168.1.100:8000/api/alert/hardware/status";
// const char* backend_relief_url = "http://192.168.1.100:8000/api/routes/relief-requests";

// =====================================================================================
// 2. HARDWARE PINS
// =====================================================================================
#define ONBOARD_LED_PIN 2   // Built-in Blue LED on ESP32 DevKit
#define SIREN_PIN       4   // Active Buzzer / Relay / Siren Pin

// =====================================================================================
// 3. GLOBAL OBJECTS & STATE
// =====================================================================================
const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
WebServer server(80);
Preferences prefs;

bool alertActive = false;
String alertMessage = "Normal Monitoring";
String alertLevel = "Normal";
int reportCount = 0;

unsigned long lastPollTime = 0;
const unsigned long pollIntervalMs = 3000; // Poll cloud every 3 seconds

unsigned long lastSirenToggle = 0;
bool sirenState = false;

// =====================================================================================
// 4. CAPTIVE PORTAL HTML (STORED IN FLASH MEMORY)
// =====================================================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NE-SHIELD Emergency Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #0b0f17; color: #e2e8f0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 16px; }
    .badge-bar { width: 100%; max-width: 440px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .node-tag { background: #1e293b; color: #38bdf8; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #0284c7; }
    .status-live { background: rgba(220, 38, 38, 0.2); color: #f87171; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #dc2626; display: flex; align-items: center; gap: 6px; }
    .pulsing-dot { width: 8px; height: 8px; background: #ef4444; border-radius: 50%; animation: pulse 1.2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; width: 100%; max-width: 440px; padding: 18px; margin-bottom: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .alert-card { border-top: 4px solid #ef4444; background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, #111827 100%); }
    .card-title { font-size: 1.15rem; font-weight: 800; color: #ffffff; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .card-subtitle { font-size: 0.88rem; color: #94a3b8; line-height: 1.45; margin-bottom: 14px; }
    .safe-point-box { background: #0f172a; border-left: 4px solid #10b981; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .safe-title { font-size: 0.78rem; font-weight: 700; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .safe-desc { font-size: 0.92rem; color: #f1f5f9; font-weight: 600; }
    .route-note { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    .form-group { margin-bottom: 14px; }
    label { font-size: 0.8rem; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    input, select, textarea { width: 100%; background: #0b0f17; border: 1px solid #374151; color: #ffffff; padding: 12px; border-radius: 8px; font-size: 0.95rem; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #38bdf8; ring: 2px solid #0284c7; }
    .btn-submit { width: 100%; background: #dc2626; color: white; border: none; padding: 14px; border-radius: 8px; font-size: 1rem; font-weight: 800; cursor: pointer; letter-spacing: 0.5px; transition: background 0.15s; }
    .btn-submit:active { background: #991b1b; }
    .footer { text-align: center; font-size: 0.75rem; color: #475569; margin-top: 8px; }
    .admin-link { color: #38bdf8; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="badge-bar">
    <span class="node-tag">NE-SHIELD BEACON NODE #01</span>
    <span class="status-live"><span class="pulsing-dot"></span> EMERGENCY MODE</span>
  </div>

  <div class="card alert-card">
    <div class="card-title">⚠️ Landslide Warning Active</div>
    <p class="card-subtitle">
      Public cellular towers may be disrupted. You are directly connected to an autonomous NE-SHIELD Disaster Mesh Node.
    </p>
    <div class="safe-point-box">
      <div class="safe-title">Designated Evacuation Safe Corridor</div>
      <div class="safe-desc">Mawphlang District Relief Center (NH-206)</div>
      <div class="route-note">Uphill corridor open & cleared. Avoid steep valley slopes along NH-40.</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">🚨 Log Emergency Relief Request</div>
    <p class="card-subtitle">This distress report is stored immediately into node hardware memory and routed to rescue authorities.</p>
    <form action="/submit" method="POST">
      <div class="form-group">
        <label for="name">Full Name / Head of Family</label>
        <input type="text" id="name" name="name" placeholder="e.g. Bachi Debbarma (4 members)" required>
      </div>
      <div class="form-group">
        <label for="phone">Contact Number (if reachable)</label>
        <input type="tel" id="phone" name="phone" placeholder="e.g. 9876543210">
      </div>
      <div class="form-group">
        <label for="location">Current Location / Landmark</label>
        <input type="text" id="location" name="location" placeholder="e.g. Near 7th Mile Bridge, House #12" required>
      </div>
      <div class="form-group">
        <label for="aid_type">Primary Aid Required</label>
        <select id="aid_type" name="aid_type">
          <option value="food">Drinking Water & Ration Packets</option>
          <option value="medical">Medical / First Aid Emergency</option>
          <option value="evacuation">Stranded / Need Rescue Vehicle</option>
          <option value="all">Immediate Priority / Life Threatening</option>
        </select>
      </div>
      <div class="form-group">
        <label for="status">Triage Condition</label>
        <select id="status" name="status">
          <option value="Safe">Safe - Awaiting Transportation</option>
          <option value="Injured">Injured - Ambulatory Assistance Needed</option>
          <option value="Critical">Critical - Immediate Evacuation Needed</option>
        </select>
      </div>
      <button type="submit" class="btn-submit">BROADCAST DISTRESS SIGNAL</button>
    </form>
  </div>

  <div class="footer">
    NE-SHIELD Multi-Tier Resilient System | <a href="/admin" class="admin-link">Officer Node Console</a>
  </div>

  <script>
    // Play attention alert tone using Web Audio API on connect
    let audioReady = false;
    function playBeaconChime() {
      if (audioReady) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
        audioReady = true;
      } catch (e) {}
    }
    ['click', 'touchstart', 'scroll'].forEach(evt => document.addEventListener(evt, playBeaconChime, { once: true }));
  </script>
</body>
</html>)rawliteral";

// =====================================================================================
// 5. HTTP REQUEST HANDLERS
// =====================================================================================

void handleRoot() {
  server.send(200, "text/html", PORTAL_HTML);
}

void handleSubmit() {
  String name = server.arg("name");
  String phone = server.arg("phone");
  String loc = server.arg("location");
  String aid = server.arg("aid_type");
  String stat = server.arg("status");

  reportCount++;
  String record = name + " | " + phone + " | " + loc + " | " + aid + " | " + stat;

  prefs.putString(("r_" + String(reportCount)).c_str(), record);
  prefs.putInt("total", reportCount);

  Serial.println("\n[OFFLINE SOS LOGGED]: " + record);

  // If station is currently online, forward directly to cloud
  if (WiFi.status() == WL_CONNECTED) {
    syncSingleSOS(name, phone, loc, aid, stat);
  }

  String resHtml = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                   "<style>body{background:#0b0f17;color:white;font-family:sans-serif;text-align:center;padding:30px;}"
                   ".box{background:#111827;border:1px solid #10b981;border-radius:12px;padding:24px;max-width:400px;margin:auto;}"
                   "h2{color:#34d399;} p{color:#94a3b8;line-height:1.5;margin:14px 0;} a{display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;margin-top:10px;}"
                   "</style></head><body><div class='box'>"
                   "<h2>Distress Signal Logged!</h2>"
                   "<p>Your SOS has been saved to ESP32 Flash Memory (Record #" + String(reportCount) + ").</p>"
                   "<p>Proceed along the designated safe corridor towards <b>Mawphlang District Relief Center</b>.</p>"
                   "<a href='/'>Return to Emergency Portal</a>"
                   "</div></body></html>";

  server.send(200, "text/html", resHtml);
}

void handleAdmin() {
  String page = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                "<style>body{background:#0b0f17;color:white;font-family:sans-serif;padding:20px;max-width:600px;margin:auto;}"
                "h2{color:#38bdf8;} .entry{background:#1e293b;border-left:4px solid #ef4444;padding:12px;margin-bottom:10px;border-radius:6px;font-size:0.9rem;word-break:break-all;}"
                ".btn{display:inline-block;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;margin-bottom:12px;color:white;border:none;cursor:pointer;}"
                ".btn-red{background:#dc2626;} .btn-blue{background:#0284c7;} .btn-green{background:#16a34a;}"
                "</style></head><body>"
                "<h2>NE-SHIELD Officer Console</h2>"
                "<p style='color:#94a3b8;'>Node ID: ESP32-OFFGRID-01 | Total Reports: <b>" + String(reportCount) + "</b></p>"
                "<p style='color:#94a3b8;'>Siren Status: <b>" + String(alertActive ? "ACTIVE (ALARMING)" : "NORMAL") + "</b></p>"
                "<div style='margin:16px 0;'>"
                "<a href='/admin/test-siren' class='btn btn-red'>Toggle Siren Alarm</a>"
                "<a href='/admin/sync' class='btn btn-green'>Sync Reports to Cloud</a>"
                "<a href='/admin/clear' class='btn btn-blue'>Clear Flash Records</a>"
                "</div>"
                "<h3>Logged Distress Reports (" + String(reportCount) + ")</h3>";

  if (reportCount == 0) {
    page += "<p style='color:#64748b;'>No SOS reports in node memory.</p>";
  } else {
    for (int i = 1; i <= reportCount; i++) {
      String entry = prefs.getString(("r_" + String(i)).c_str(), "Unreadable Entry");
      page += "<div class='entry'><b>#" + String(i) + ":</b> " + entry + "</div>";
    }
  }

  page += "<br><a href='/' style='color:#38bdf8;'>Back to Emergency Portal</a></body></html>";
  server.send(200, "text/html", page);
}

void handleTestSiren() {
  alertActive = !alertActive;
  digitalWrite(ONBOARD_LED_PIN, alertActive ? HIGH : LOW);
  digitalWrite(SIREN_PIN, alertActive ? HIGH : LOW);
  server.sendHeader("Location", "/admin");
  server.send(303);
}

void handleClear() {
  prefs.clear();
  reportCount = 0;
  prefs.putInt("total", 0);
  server.sendHeader("Location", "/admin");
  server.send(303);
}

void handleSync() {
  int synced = 0;
  if (WiFi.status() == WL_CONNECTED) {
    for (int i = 1; i <= reportCount; i++) {
      String entry = prefs.getString(("r_" + String(i)).c_str(), "");
      if (entry.length() > 0) {
        // Parse: name | phone | loc | aid | stat
        int p1 = entry.indexOf('|');
        int p2 = entry.indexOf('|', p1 + 1);
        int p3 = entry.indexOf('|', p2 + 1);
        int p4 = entry.indexOf('|', p3 + 1);
        String name = (p1 > 0) ? entry.substring(0, p1) : "Citizen";
        String phone = (p2 > p1) ? entry.substring(p1 + 1, p2) : "";
        String loc = (p3 > p2) ? entry.substring(p2 + 1, p3) : "Field";
        String aid = (p4 > p3) ? entry.substring(p3 + 1, p4) : "food";
        String stat = (p4 > 0) ? entry.substring(p4 + 1) : "Safe";

        name.trim(); phone.trim(); loc.trim(); aid.trim(); stat.trim();
        if (syncSingleSOS(name, phone, loc, aid, stat)) {
          synced++;
        }
      }
    }
  }
  String page = "<!DOCTYPE html><html><body style='background:#0b0f17;color:white;font-family:sans-serif;padding:30px;text-align:center;'>"
                "<h2>Sync Complete</h2><p>Successfully pushed " + String(synced) + " of " + String(reportCount) + " reports to NE-SHIELD Cloud.</p>"
                "<a href='/admin' style='color:#38bdf8;'>Return to Console</a></body></html>";
  server.send(200, "text/html", page);
}

// =====================================================================================
// 6. CLOUD SYNCHRONIZATION HELPERS
// =====================================================================================

bool syncSingleSOS(String name, String phone, String loc, String aid, String stat) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(backend_relief_url);

  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure(); // Skip certificate validation for rapid deployment
    if (!http.begin(client, url)) return false;
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) return false;
  }

  http.addHeader("Content-Type", "application/json");

  String jsonBody = "{"
    "\"user_name\":\"" + name + "\","
    "\"phone\":\"" + phone + "\","
    "\"locality_name\":\"" + loc + "\","
    "\"lat\":25.5788,"
    "\"lon\":91.8933,"
    "\"aid_type\":\"" + aid + "\","
    "\"people_count\":1,"
    "\"urgency\":\"High\","
    "\"notes\":\"Submitted via ESP32 Autonomous Node (" + stat + ")\""
  "}";

  int httpCode = http.POST(jsonBody);
  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

void pollCloudAlertStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(backend_status_url);

  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure();
    if (!http.begin(client, url)) return;
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) return;
  }

  http.setTimeout(2500);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    // Parse {"is_active": true/false, "message": "..."}
    if (payload.indexOf("\"is_active\":true") >= 0 || payload.indexOf("\"is_active\": true") >= 0) {
      alertActive = true;
      int msgIdx = payload.indexOf("\"message\":\"");
      if (msgIdx >= 0) {
        int endIdx = payload.indexOf("\"", msgIdx + 11);
        if (endIdx > msgIdx) {
          alertMessage = payload.substring(msgIdx + 11, endIdx);
        }
      }
      Serial.println("[ALERT TRIGGERED FROM CLOUD]: " + alertMessage);
    } else {
      if (alertActive) {
        Serial.println("[ALERT CLEARED FROM CLOUD]");
      }
      alertActive = false;
      alertMessage = "Normal Monitoring";
    }
  }

  http.end();
}

// =====================================================================================
// 7. SETUP & INITIALIZATION
// =====================================================================================

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n================================================");
  Serial.println("  NE-SHIELD: ESP32 Disaster Alert Beacon Node  ");
  Serial.println("================================================");

  // Initialize GPIO Pins
  pinMode(ONBOARD_LED_PIN, OUTPUT);
  pinMode(SIREN_PIN, OUTPUT);
  digitalWrite(ONBOARD_LED_PIN, LOW);
  digitalWrite(SIREN_PIN, LOW);

  // Initialize NVS Flash Storage for SOS Reports
  prefs.begin("neshield_sos", false);
  reportCount = prefs.getInt("total", 0);
  Serial.printf("[NVS FLASH] Stored SOS Reports: %d\n", reportCount);

  // Dual-mode Wi-Fi (AP + STA)
  WiFi.mode(WIFI_AP_STA);

  // Start Access Point (NE-SHIELD-EMERGENCY)
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(ap_ssid, ap_password);
  Serial.print("[AP ACTIVE] Emergency Wi-Fi SSID: ");
  Serial.println(ap_ssid);
  Serial.print("[AP ACTIVE] Gateway IP: ");
  Serial.println(WiFi.softAPIP());

  // Start DNS Server on Port 53 (Intercept all DNS queries for Captive Portal)
  dnsServer.start(DNS_PORT, "*", apIP);

  // Connect to STA (Phone hotspot or router)
  if (strlen(sta_ssid) > 0 && strcmp(sta_ssid, "YOUR_WIFI_PASSWORD") != 0) {
    Serial.printf("[STA CONNECTING] Connecting to Wi-Fi SSID: %s ...\n", sta_ssid);
    WiFi.begin(sta_ssid, sta_password);
  }

  // Register WebServer Captive Portal Routes
  server.on("/", handleRoot);
  server.on("/generate_204", handleRoot);        // Android captive portal check
  server.on("/gen_204", handleRoot);             // Alternate Android check
  server.on("/canonical.html", handleRoot);      // Chromium check
  server.on("/hotspot-detect.html", handleRoot);  // Apple iOS / macOS captive check
  server.on("/ncsi.txt", handleRoot);            // Windows captive check
  server.on("/connecttest.txt", handleRoot);     // Windows check
  server.on("/submit", HTTP_POST, handleSubmit);
  server.on("/admin", handleAdmin);
  server.on("/admin/test-siren", handleTestSiren);
  server.on("/admin/clear", handleClear);
  server.on("/admin/sync", handleSync);
  server.onNotFound(handleRoot); // Redirect any other domain request to portal

  server.begin();
  Serial.println("[WEB SERVER] Captive Web Server Started on Port 80.");
}

// =====================================================================================
// 8. MAIN LOOP
// =====================================================================================

void loop() {
  // 1. Process Captive DNS queries
  dnsServer.processNextRequest();

  // 2. Handle incoming HTTP requests
  server.handleClient();

  // 3. Periodic cloud polling (non-blocking)
  unsigned long now = millis();
  if (now - lastPollTime >= pollIntervalMs) {
    lastPollTime = now;
    pollCloudAlertStatus();
  }

  // 4. Hardware Siren & LED Actuation
  if (alertActive) {
    // Pulse siren & LED every 250ms for emergency alarm pattern
    if (now - lastSirenToggle >= 250) {
      lastSirenToggle = now;
      sirenState = !sirenState;
      digitalWrite(ONBOARD_LED_PIN, sirenState ? HIGH : LOW);
      digitalWrite(SIREN_PIN, sirenState ? HIGH : LOW);
    }
  } else {
    // Normal heartbeat when idle
    digitalWrite(SIREN_PIN, LOW);
    if (WiFi.status() == WL_CONNECTED) {
      digitalWrite(ONBOARD_LED_PIN, HIGH); // Steady ON when connected to internet
    } else {
      // Gentle 1-second blink when offline
      digitalWrite(ONBOARD_LED_PIN, ((now / 1000) % 2 == 0) ? HIGH : LOW);
    }
  }
}
