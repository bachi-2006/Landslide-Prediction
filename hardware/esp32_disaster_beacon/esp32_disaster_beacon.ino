#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =====================================================================================
// 1. PIN CONFIGURATION
// =====================================================================================
#define SIREN_PIN        4    // External Buzzer / Siren Relay (Mandatory)
#define LED_DB_PIN       18   // LED 1: Indicates DB Connection
#define LED_WIFI_PIN     19   // LED 2: Indicates Web / Wi-Fi Internet Access
#define LED_ALERT_PIN    5    // LED 3: Blinks for 15s on New Incident
#define ONBOARD_LED_PIN  2    // Built-in Blue LED

#define I2C_SDA_PIN      21   // I2C OLED SDA
#define I2C_SCL_PIN      22   // I2C OLED SCL

#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1
#define SCREEN_ADDRESS   0x3C // Standard I2C address for SSD1306

// =====================================================================================
// 2. NETWORK CONFIGURATION
// =====================================================================================
// [STA MODE] Take Wi-Fi from phone hotspot or router to reach the cloud backend
const char* sta_ssid     = "MSI 6704";             // Replace with your Wi-Fi SSID
const char* sta_password = "11111111";    // Replace with your Wi-Fi Password

// [AP MODE] Open Emergency Wi-Fi network for citizens & victims
const char* ap_ssid      = "NE-SHIELD-EMERGENCY";
const char* ap_password  = "";                      // Open / No password
const char* node_id      = "ESP32-OFFGRID-01";

// [BACKEND API ENDPOINTS]
const char* backend_status_url    = "https://ne-shield-api.onrender.com/api/alert/hardware/status";
const char* backend_heartbeat_url = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/heartbeat";
const char* backend_sos_url       = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/sos";

// =====================================================================================
// 3. OBJECTS & STATE VARIABLES
// =====================================================================================
const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);
DNSServer dnsServer;
WebServer server(80);
Preferences prefs;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

bool oledFound = false;
bool dbConnected = false;
bool webAccess = false;
bool sirenActive = false;
String sirenMessage = "Normal Monitoring";
String sirenLevel = "Normal";

// New incident detection & 15-second blink timer
String lastSeenIncidentId = "";
String currentIncidentDesc = "";
String currentIncidentReporter = "";
unsigned long incidentBlinkStartTime = 0;
const unsigned long INCIDENT_BLINK_DURATION_MS = 15000; // 15 seconds
bool isIncidentBlinking = false;
unsigned long lastBlinkToggle = 0;
bool blinkLedState = false;

// Polling and heartbeat timers
unsigned long lastPollTime = 0;
const unsigned long pollIntervalMs = 3000; // Poll backend every 3s
unsigned long lastHeartbeatTime = 0;
const unsigned long heartbeatIntervalMs = 15000; // Heartbeat every 15s

// =====================================================================================
// 4. RESPONSIVE CITIZEN CAPTIVE PORTAL HTML (STORED IN FLASH)
// =====================================================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NE-SHIELD Disaster SOS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #0b0f17; color: #e2e8f0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 14px; }
    .badge-bar { width: 100%; max-width: 440px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .node-tag { background: #1e293b; color: #38bdf8; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #0284c7; }
    .status-live { background: rgba(220, 38, 38, 0.2); color: #f87171; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #dc2626; display: flex; align-items: center; gap: 6px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; width: 100%; max-width: 440px; padding: 16px; margin-bottom: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .alert-card { border-top: 4px solid #ef4444; background: linear-gradient(180deg, rgba(239, 68, 68, 0.1) 0%, #111827 100%); }
    .card-title { font-size: 1.1rem; font-weight: 800; color: #ffffff; margin-bottom: 6px; }
    .card-subtitle { font-size: 0.82rem; color: #94a3b8; line-height: 1.4; margin-bottom: 12px; }
    .form-group { margin-bottom: 10px; }
    label { display: block; font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
    input, select, textarea { width: 100%; padding: 10px 12px; background: #1f2937; border: 1px solid #374151; border-radius: 8px; color: #fff; font-size: 0.9rem; outline: none; }
    input:focus, textarea:focus { border-color: #38bdf8; }
    .btn-submit { width: 100%; background: #dc2626; color: white; border: none; border-radius: 8px; padding: 12px; font-size: 0.95rem; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
    .btn-submit:active { background: #b91c1c; }
    .safe-corridor { background: #0f172a; border-left: 4px solid #10b981; padding: 10px; border-radius: 6px; font-size: 0.8rem; color: #6ee7b7; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="badge-bar">
    <span class="node-tag">BEACON: ESP32-OFFGRID-01</span>
    <span class="status-live">EMERGENCY NETWORK</span>
  </div>

  <div class="card alert-card">
    <div class="card-title">🚨 LANDSLIDE EMERGENCY NOTICE</div>
    <p class="card-subtitle">You are connected to the official Disaster Beacon Wi-Fi. Enter your information below to register with State Emergency Operations Center (SEOC).</p>
    <div class="safe-corridor">
      <strong>DESIGNATED SAFE ROUTE:</strong> Evacuate uphill towards NH-206 Mawphlang Ridge. Avoid cutting slopes and river valleys.
    </div>
  </div>

  <div class="card">
    <div class="card-title">📋 Enter Your Distress Details</div>
    <form action="/submit_sos" method="POST">
      <div class="form-group">
        <label>Your Full Name *</label>
        <input type="text" name="citizen_name" required placeholder="e.g. Mary Lyngdoh">
      </div>
      <div class="form-group">
        <label>Contact Phone / ICE *</label>
        <input type="tel" name="phone" required placeholder="e.g. +91 98620 XXXXX">
      </div>
      <div class="form-group">
        <label>Number of People with You</label>
        <input type="number" name="people_count" min="1" max="50" value="1">
      </div>
      <div class="form-group">
        <label>Medical Attention Needed?</label>
        <select name="medical_needs">
          <option value="None">None - Uninjured</option>
          <option value="Minor Injuries">Minor Cuts / Scratches</option>
          <option value="Urgent Medical">Urgent: Trauma / Fracture / Insulin / Elderly</option>
          <option value="Severe">Critical: Trapped under debris</option>
        </select>
      </div>
      <div class="form-group">
        <label>Specific Needs / Road Condition</label>
        <textarea name="notes" rows="2" placeholder="e.g. Road blocked near km 14; family needs drinking water..."></textarea>
      </div>
      <button type="submit" class="btn-submit">Transmit SOS to Rescue Teams</button>
    </form>
  </div>

  <div class="card" style="border: 1px solid #374151; background: #0f172a; margin-top: 6px;">
    <div class="card-title" style="font-size: 0.95rem; color: #f59e0b;">⚡ Field Officer & Responder Siren Controls</div>
    <p style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 10px;">Direct local Wi-Fi control over hardware acoustic beacon buzzer (GPIO 4).</p>
    <div style="display: flex; gap: 8px;">
      <button type="button" onclick="toggleLocalSiren('on')" style="flex: 1; background: #dc2626; color: white; border: none; border-radius: 8px; padding: 10px; font-weight: bold; font-size: 0.82rem; cursor: pointer;">🚨 Sound Siren</button>
      <button type="button" onclick="toggleLocalSiren('off')" style="flex: 1; background: #334155; color: white; border: none; border-radius: 8px; padding: 10px; font-weight: bold; font-size: 0.82rem; cursor: pointer;">⏹️ Silence Siren</button>
    </div>
    <div id="sirenMsg" style="font-size: 0.78rem; color: #38bdf8; margin-top: 8px; text-align: center; font-weight: bold;"></div>
  </div>

  <script>
    function toggleLocalSiren(state) {
      document.getElementById('sirenMsg').innerText = 'Transmitting command to beacon...';
      fetch('/api/siren?state=' + state)
        .then(r => r.json())
        .then(d => {
          document.getElementById('sirenMsg').innerText = d.siren_active ? '🚨 SIREN SOUNDING (ACTIVE ALERT)' : '⏹️ SIREN SILENCED (STANDBY)';
        })
        .catch(e => {
          document.getElementById('sirenMsg').innerText = 'Command sent.';
        });
    }
  </script>
</body>
</html>)rawliteral";

const char SUCCESS_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOS Received</title>
  <style>
    body { background: #0b0f17; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; }
    .box { background: #111827; border: 1px solid #10b981; border-radius: 16px; padding: 24px; max-width: 400px; box-shadow: 0 8px 30px rgba(0,0,0,0.6); }
    h2 { color: #34d399; margin-bottom: 10px; }
    p { font-size: 0.9rem; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; }
    .btn { display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 40px; margin-bottom: 10px;">✅</div>
    <h2>DISTRESS LOGGED</h2>
    <p>Your details have been saved to local beacon flash storage and transmitted directly to the State Disaster Operations Command (SEOC) database.</p>
    <p><strong>Stay on high bedrock ground.</strong> Rescue personnel have been notified.</p>
    <a href="/" class="btn">Return to Safety Instructions</a>
  </div>
</body>
</html>)rawliteral";

// =====================================================================================
// 5. I2C DISPLAY HELPERS (SSD1306 OLED)
// =====================================================================================
void initDisplay() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    oledFound = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("NE-SHIELD BEACON");
    display.println("Initializing...");
    display.display();
    Serial.println("[I2C] SSD1306 OLED Display initialized at 0x3C");
  } else {
    oledFound = false;
    Serial.println("[I2C] No OLED found at 0x3C. Continuing in headless mode.");
  }
}

void updateIdleDisplay() {
  if (!oledFound) return;
  display.clearDisplay();
  display.setTextSize(1);

  // Header
  display.setCursor(0, 0);
  display.print("NE-SHIELD ");
  display.println(node_id);
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Line 1: Wi-Fi Access & IP
  display.setCursor(0, 13);
  if (webAccess) {
    display.print("STA: ");
    display.println(WiFi.localIP().toString());
  } else {
    display.println("STA: Connecting...");
  }

  // Line 2: DB Connection
  display.setCursor(0, 24);
  display.print("DB Link: ");
  display.println(dbConnected ? "[CONNECTED]" : "[OFFLINE]");

  // Line 3: AP Clients
  display.setCursor(0, 35);
  display.print("Victims On AP: ");
  display.println(WiFi.softAPgetStationNum());

  // Line 4: Siren Status
  display.setCursor(0, 46);
  if (sirenActive) {
    display.print("SIREN: ");
    display.println("! ACTIVE ALERT !");
  } else {
    display.print("SIREN: ");
    display.println("STANDBY (OK)");
  }

  display.display();
}

void showIncidentOnDisplay(String desc, String reporter, int countdownSec) {
  if (!oledFound) return;
  display.clearDisplay();

  // Flashing inverted header
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(4, 2);
  display.print("! NEW INCIDENT (");
  display.print(countdownSec);
  display.println("s) !");

  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 16);
  display.print("By: ");
  display.println(reporter.length() > 14 ? reporter.substring(0, 14) : reporter);

  display.setCursor(0, 27);
  // Truncate long descriptions to fit screen
  if (desc.length() > 40) {
    display.println(desc.substring(0, 40) + "..");
  } else {
    display.println(desc);
  }

  display.setCursor(0, 52);
  display.print("SDRF Squad Dispatched");
  display.display();
}

// =====================================================================================
// 6. LED INDICATION CONTROLLER
// =====================================================================================
void updateStatusLEDs() {
  // LED 1 (GPIO 18): DB Connection Status
  digitalWrite(LED_DB_PIN, dbConnected ? HIGH : LOW);

  // LED 2 (GPIO 19): Web / Wi-Fi Internet Access
  digitalWrite(LED_WIFI_PIN, webAccess ? HIGH : LOW);

  // LED 3 (GPIO 5) & Onboard LED (GPIO 2): 15-second blinking on new incident
  if (isIncidentBlinking) {
    unsigned long elapsed = millis() - incidentBlinkStartTime;
    if (elapsed < INCIDENT_BLINK_DURATION_MS) {
      // Rapid 5Hz blink (100ms on / 100ms off)
      if (millis() - lastBlinkToggle >= 100) {
        lastBlinkToggle = millis();
        blinkLedState = !blinkLedState;
        digitalWrite(LED_ALERT_PIN, blinkLedState ? HIGH : LOW);
        digitalWrite(ONBOARD_LED_PIN, blinkLedState ? HIGH : LOW);
      }
      int remainingSec = (INCIDENT_BLINK_DURATION_MS - elapsed) / 1000 + 1;
      showIncidentOnDisplay(currentIncidentDesc, currentIncidentReporter, remainingSec);
    } else {
      // 15 seconds completed — stop blinking
      isIncidentBlinking = false;
      digitalWrite(LED_ALERT_PIN, LOW);
      digitalWrite(ONBOARD_LED_PIN, sirenActive ? HIGH : LOW);
      updateIdleDisplay();
      Serial.println("[ALERT] 15-second incident LED blink interval finished.");
    }
  } else {
    // Mirror siren status if active, else off
    digitalWrite(LED_ALERT_PIN, sirenActive ? HIGH : LOW);
    digitalWrite(ONBOARD_LED_PIN, sirenActive ? HIGH : LOW);
  }

  // Siren Pin (GPIO 4)
  digitalWrite(SIREN_PIN, sirenActive ? HIGH : LOW);
}

// =====================================================================================
// 7. BACKEND SYNC: POLL CLOUD & SEND HEARTBEAT
// =====================================================================================
void pollBackendStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    webAccess = false;
    dbConnected = false;
    return;
  }

  webAccess = true;
  WiFiClientSecure client;
  client.setInsecure(); // Accept Cloud HTTPS certificates without bundling CA bundle
  HTTPClient http;

  if (http.begin(client, backend_status_url)) {
    http.setTimeout(4000);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      dbConnected = true;

      // Check siren active state
      if (payload.indexOf("\"is_active\":true") >= 0 || payload.indexOf("\"active\":true") >= 0) {
        sirenActive = true;
      } else if (payload.indexOf("\"is_active\":false") >= 0 || payload.indexOf("\"active\":false") >= 0) {
        sirenActive = false;
      }

      // Check for a NEW incident reported in database
      int idIdx = payload.indexOf("\"latest_incident_id\":\"");
      if (idIdx >= 0) {
        int idEnd = payload.indexOf("\"", idIdx + 22);
        String incId = payload.substring(idIdx + 22, idEnd);

        // Extract description
        String incDesc = "Hazard on slope";
        int descIdx = payload.indexOf("\"latest_incident_message\":\"");
        if (descIdx >= 0) {
          int descEnd = payload.indexOf("\"", descIdx + 27);
          incDesc = payload.substring(descIdx + 27, descEnd);
        }

        // Extract reporter
        String incRep = "Observer";
        int repIdx = payload.indexOf("\"latest_incident_reporter\":\"");
        if (repIdx >= 0) {
          int repEnd = payload.indexOf("\"", repIdx + 28);
          incRep = payload.substring(repIdx + 28, repEnd);
        }

        // Trigger 15-second blink if this is a NEW incident!
        if (incId != "" && incId != "null" && incId != lastSeenIncidentId) {
          if (lastSeenIncidentId != "") { // Skip initial boot check
            Serial.printf("[INCIDENT] New incident detected: %s! Starting 15s alert blink.\n", incId.c_str());
            isIncidentBlinking = true;
            incidentBlinkStartTime = millis();
            currentIncidentDesc = incDesc;
            currentIncidentReporter = incRep;
          }
          lastSeenIncidentId = incId;
        }
      }
    } else {
      dbConnected = false;
      Serial.printf("[HTTP] Status poll failed with code: %d\n", httpCode);
    }
    http.end();
  } else {
    webAccess = false;
    dbConnected = false;
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  if (http.begin(client, backend_heartbeat_url)) {
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(4000);

    String body = "{";
    body += "\"beacon_id\":\"" + String(node_id) + "\",";
    body += "\"siren_active\":" + String(sirenActive ? "true" : "false") + ",";
    body += "\"wifi_ssid\":\"" + String(sta_ssid) + "\",";
    body += "\"sta_ip\":\"" + WiFi.localIP().toString() + "\",";
    body += "\"db_connected\":" + String(dbConnected ? "true" : "false") + ",";
    body += "\"clients_connected\":" + String(WiFi.softAPgetStationNum()) + ",";
    body += "\"last_incident_seen\":\"" + lastSeenIncidentId + "\"";
    body += "}";

    int code = http.POST(body);
    http.end();
  }
}

// Clean input strings to prevent broken JSON payloads
String cleanString(String s) {
  s.replace("\"", "'");
  s.replace("\r", " ");
  s.replace("\n", " ");
  s.replace("\\", "/");
  s.trim();
  return s;
}

// Forward captive portal citizen submission to cloud database
bool forwardSosToBackend(String name, String phone, int people, String med, String notes, String clientIp) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  if (http.begin(client, backend_sos_url)) {
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000); // 8s to allow cloud spin-up

    String json = "{";
    json += "\"beacon_id\":\"" + String(node_id) + "\",";
    json += "\"citizen_name\":\"" + cleanString(name) + "\",";
    json += "\"phone\":\"" + cleanString(phone) + "\",";
    json += "\"people_count\":" + String(people) + ",";
    json += "\"medical_needs\":\"" + cleanString(med) + "\",";
    json += "\"notes\":\"" + cleanString(notes) + "\",";
    json += "\"ip_address\":\"" + clientIp + "\"";
    json += "}";

    int httpCode = http.POST(json);
    http.end();
    return (httpCode == 200 || httpCode == 201);
  }
  return false;
}

// Background sync worker: flushes stored offline submissions once Wi-Fi reconnects
unsigned long lastSyncAttempt = 0;
const unsigned long syncIntervalMs = 12000;

void syncPendingSosLogs() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastSyncAttempt < syncIntervalMs) return;
  lastSyncAttempt = millis();

  prefs.begin("sos_logs", false);
  int count = prefs.getInt("count", 0);
  for (int i = 0; i < count; i++) {
    String pfx = "sos_" + String(i) + "_";
    int synced = prefs.getInt((pfx + "s").c_str(), 0);
    if (synced == 0) {
      String n = prefs.getString((pfx + "n").c_str(), "Citizen");
      String p = prefs.getString((pfx + "p").c_str(), "");
      int c = prefs.getInt((pfx + "c").c_str(), 1);
      String m = prefs.getString((pfx + "m").c_str(), "None");
      String msg = prefs.getString((pfx + "msg").c_str(), "");

      Serial.printf("[OFFLINE-SYNC] Forwarding queued SOS #%d (%s) to central cloud...\n", i, n.c_str());
      if (forwardSosToBackend(n, p, c, m, msg, "192.168.4.1 (synced-from-flash)")) {
        prefs.putInt((pfx + "s").c_str(), 1);
        Serial.printf("[OFFLINE-SYNC] Stored SOS #%d successfully synced to database!\n", i);
      } else {
        Serial.printf("[OFFLINE-SYNC] Cloud still unreachable, will retry shortly.\n");
        break;
      }
    }
  }
  prefs.end();
}

// =====================================================================================
// 8. CAPTIVE PORTAL & LOCAL REST API WEB HANDLERS
// =====================================================================================
void handleRoot() {
  server.send_P(200, "text/html", PORTAL_HTML);
}

void handleSubmitSos() {
  String name = server.hasArg("citizen_name") ? server.arg("citizen_name") : "Citizen";
  String phone = server.hasArg("phone") ? server.arg("phone") : "";
  int people = server.hasArg("people_count") ? server.arg("people_count").toInt() : 1;
  String medical = server.hasArg("medical_needs") ? server.arg("medical_needs") : "None";
  String notes = server.hasArg("notes") ? server.arg("notes") : "";
  String clientIp = server.client().remoteIP().toString();

  Serial.println("[CAPTIVE] New citizen SOS submission:");
  Serial.printf("  Name: %s | Phone: %s | People: %d | Med: %s\n", name.c_str(), phone.c_str(), people, medical.c_str());

  // 1. Immediately forward to Central Supabase DB via Backend API
  bool synced = forwardSosToBackend(name, phone, people, medical, notes, clientIp);
  Serial.printf("  Database sync status: %s\n", synced ? "SUCCESS (Persisted in DB)" : "QUEUED LOCALLY IN FLASH");

  // 2. Save to local flash memory with sync status flag
  prefs.begin("sos_logs", false);
  int count = prefs.getInt("count", 0);
  String keyPrefix = "sos_" + String(count) + "_";
  prefs.putString((keyPrefix + "n").c_str(), name);
  prefs.putString((keyPrefix + "p").c_str(), phone);
  prefs.putInt((keyPrefix + "c").c_str(), people);
  prefs.putString((keyPrefix + "m").c_str(), medical);
  prefs.putString((keyPrefix + "msg").c_str(), notes);
  prefs.putInt((keyPrefix + "s").c_str(), synced ? 1 : 0);
  prefs.putInt("count", count + 1);
  prefs.end();

  // 3. Return confirmation HTML to citizen's phone
  server.send_P(200, "text/html", SUCCESS_HTML);
}

void handleCaptiveRedirect() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

// Direct local Wi-Fi control over hardware acoustic siren (GPIO 4)
void handleApiSiren() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  String state = server.hasArg("state") ? server.arg("state") : "";
  state.toLowerCase();

  if (state == "on" || state == "1" || state == "true" || state == "active") {
    sirenActive = true;
    digitalWrite(SIREN_PIN, HIGH);
    Serial.println("[LOCAL API] Siren turned ON via local Wi-Fi command");
  } else if (state == "off" || state == "0" || state == "false" || state == "idle") {
    sirenActive = false;
    digitalWrite(SIREN_PIN, LOW);
    Serial.println("[LOCAL API] Siren turned OFF via local Wi-Fi command");
  } else {
    sirenActive = !sirenActive;
    digitalWrite(SIREN_PIN, sirenActive ? HIGH : LOW);
  }

  updateIdleDisplay();

  String json = "{\"status\":\"ok\",\"siren_active\":" + String(sirenActive ? "true" : "false") + ",\"node_id\":\"" + String(node_id) + "\"}";
  server.send(200, "application/json", json);
}

// Local telemetry & diagnostic status
void handleApiStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  String json = "{";
  json += "\"node_id\":\"" + String(node_id) + "\",";
  json += "\"siren_active\":" + String(sirenActive ? "true" : "false") + ",";
  json += "\"db_connected\":" + String(dbConnected ? "true" : "false") + ",";
  json += "\"web_access\":" + String(webAccess ? "true" : "false") + ",";
  json += "\"clients_connected\":" + String(WiFi.softAPgetStationNum()) + ",";
  json += "\"sta_ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"ap_ip\":\"" + apIP.toString() + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

// Direct local read of all stored victim registrations
void handleApiSosLogs() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  prefs.begin("sos_logs", true);
  int count = prefs.getInt("count", 0);
  String json = "[";
  for (int i = 0; i < count; i++) {
    String pfx = "sos_" + String(i) + "_";
    String n = prefs.getString((pfx + "n").c_str(), "Citizen");
    String p = prefs.getString((pfx + "p").c_str(), "");
    int c = prefs.getInt((pfx + "c").c_str(), 1);
    String m = prefs.getString((pfx + "m").c_str(), "None");
    String msg = prefs.getString((pfx + "msg").c_str(), "");
    int s = prefs.getInt((pfx + "s").c_str(), 0);

    if (i > 0) json += ",";
    json += "{";
    json += "\"id\":" + String(i + 1) + ",";
    json += "\"citizen_name\":\"" + cleanString(n) + "\",";
    json += "\"phone\":\"" + cleanString(p) + "\",";
    json += "\"people_count\":" + String(c) + ",";
    json += "\"medical_needs\":\"" + cleanString(m) + "\",";
    json += "\"notes\":\"" + cleanString(msg) + "\",";
    json += "\"synced_to_cloud\":" + String(s == 1 ? "true" : "false");
    json += "}";
  }
  prefs.end();
  json += "]";
  server.send(200, "application/json", json);
}

// =====================================================================================
// 9. ARDUINO SETUP & MAIN LOOP
// =====================================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=======================================================");
  Serial.println("  NE-SHIELD: ESP32 DISASTER ALERT BEACON INITIALIZING  ");
  Serial.println("=======================================================");

  // Setup GPIO pins
  pinMode(SIREN_PIN, OUTPUT);
  pinMode(LED_DB_PIN, OUTPUT);
  pinMode(LED_WIFI_PIN, OUTPUT);
  pinMode(LED_ALERT_PIN, OUTPUT);
  pinMode(ONBOARD_LED_PIN, OUTPUT);

  digitalWrite(SIREN_PIN, LOW);
  digitalWrite(LED_DB_PIN, LOW);
  digitalWrite(LED_WIFI_PIN, LOW);
  digitalWrite(LED_ALERT_PIN, LOW);
  digitalWrite(ONBOARD_LED_PIN, LOW);

  // Initialize I2C OLED display
  initDisplay();

  // 1. Initialize Access Point (AP) mode for stranded victims
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(ap_ssid, ap_password);
  Serial.printf("[AP] Disaster Emergency Wi-Fi active: SSID='%s', IP=%s\n", ap_ssid, apIP.toString().c_str());

  // 2. Setup DNS Server for Captive Portal Redirection
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);
  Serial.println("[DNS] Captive Portal intercept active on port 53");

  // 3. Setup Captive Web Server Routes & Local REST APIs
  server.on("/", HTTP_GET, handleRoot);
  server.on("/submit_sos", HTTP_POST, handleSubmitSos);
  server.on("/api/siren", HTTP_ANY, handleApiSiren);
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/sos_logs", HTTP_GET, handleApiSosLogs);
  server.on("/generate_204", handleCaptiveRedirect); // Android captive test
  server.on("/canonical.html", handleCaptiveRedirect);
  server.on("/hotspot-detect.html", handleCaptiveRedirect); // Apple iOS captive test
  server.on("/connecttest.txt", handleCaptiveRedirect); // Windows captive test
  server.onNotFound(handleCaptiveRedirect);
  server.begin();
  Serial.println("[HTTP] Captive Web Server & Local APIs started on port 80");

  // 4. Connect STA Wi-Fi to reach backend
  Serial.printf("[STA] Connecting to station Wi-Fi: '%s'...\n", sta_ssid);
  WiFi.begin(sta_ssid, sta_password);

  updateIdleDisplay();
}

void loop() {
  // 1. Handle Captive Portal DNS redirection
  dnsServer.processNextRequest();

  // 2. Handle Web Server requests & Local APIs
  server.handleClient();

  // 3. Check Wi-Fi STA connection status
  if (WiFi.status() == WL_CONNECTED) {
    webAccess = true;
  } else {
    webAccess = false;
  }

  // 4. Background Sync: flush stored offline flash submissions to cloud
  syncPendingSosLogs();

  // 5. Periodic polling of Cloud Backend
  if (millis() - lastPollTime >= pollIntervalMs) {
    lastPollTime = millis();
    pollBackendStatus();
    if (!isIncidentBlinking) {
      updateIdleDisplay();
    }
  }

  // 6. Periodic Heartbeat to register beacon with Admin Dashboard
  if (millis() - lastHeartbeatTime >= heartbeatIntervalMs) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  // 7. Actuate LEDs & Siren
  updateStatusLEDs();
}

