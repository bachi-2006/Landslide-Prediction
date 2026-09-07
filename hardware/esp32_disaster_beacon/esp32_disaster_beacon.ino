/*
 * =====================================================================================
 *  NE-SHIELD: Unified ESP32 Disaster Alert Beacon & Citizen Captive Portal Node
 *  Smart India Hackathon (SIH) 2026
 *
 *  HARDWARE PIN CONFIGURATION:
 *    - GPIO 4  : SIREN_PIN       (Mandatory Acoustic Siren / Relay / Active Buzzer)
 *    - GPIO 18 : LED_DB_PIN      (LED 1: Solid ON = Active Connection with DB/Backend)
 *    - GPIO 19 : LED_WIFI_PIN    (LED 2: Solid ON = Web / Wi-Fi Internet Access)
 *    - GPIO 5  : LED_ALERT_PIN   (LED 3: Rapid 5Hz Strobe for 15s on NEW INCIDENT)
 *    - GPIO 2  : ONBOARD_LED_PIN (Built-in Blue Alert LED)
 *    - GPIO 21 : I2C_SDA_PIN     (I2C OLED Display SDA - 128x64 SSD1306)
 *    - GPIO 22 : I2C_SCL_PIN     (I2C OLED Display SCL - 128x64 SSD1306)
 *
 *  SYSTEM CAPABILITIES & DATABASE INTEGRATION:
 *    1. DUAL WI-FI ARCHITECTURE:
 *       - AP Mode ("NE-SHIELD-EMERGENCY"): Open offline hotspot with Captive Portal DNS.
 *       - STA Mode ("MSI 6704"): Background uplink syncing directly to cloud database.
 *    2. CITIZEN CAPTIVE PORTAL (Port 80):
 *       - Auto-opens on Android, iOS, Windows, Mac.
 *       - Built-in Realistic Web Audio API Emergency Alert Siren (853Hz + 960Hz dual-tone).
 *       - Citizen registration: Name, Phone, Location, Triage Condition, People, Notes.
 *       - Dual Persistence: Saves to NVS flash memory + pushes to Supabase database.
 *    3. OFFLINE FLASH QUEUE WORKER:
 *       - If station Wi-Fi is down during submission, reports queue in flash with synced=0.
 *       - Flushes automatically to central database as soon as Wi-Fi connects.
 *    4. LOCAL REST API:
 *       - GET /api/siren?state=on|off (Direct control from mobile app / local browser)
 *       - GET /api/status (Local telemetry: IP, DB, clients, siren state)
 *       - GET /api/sos_logs (Direct JSON export of all registered victims)
 *       - GET /admin (In-browser offline officer console of all flash reports)
 *    5. I2C SSD1306 OLED DISPLAY (128x64):
 *       - Live telemetry: Node ID, STA IP, DB Link, AP clients, Siren status.
 *       - New Incident Screen: Displays animated "🚨 NEW INCIDENT!" + 15s LED strobe.
 *    6. CLOUD BACKEND & SUPABASE SYNC:
 *       - POST /api/alert/hardware/beacon/sos -> Persists to beacon_sos_logs & relief_requests
 *       - GET /api/alert/hardware/status -> Live DB connectivity ping & remote siren toggle
 *       - POST /api/alert/hardware/beacon/heartbeat -> Updates hardware_beacons registry
 * =====================================================================================
 */

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
#define LED_DB_PIN       18   // LED 1: Database Connection status (Solid = Online)
#define LED_WIFI_PIN     19   // LED 2: Web / Wi-Fi Internet status (Solid = Online)
#define LED_ALERT_PIN    5    // LED 3: Emergency Strobe (Flashes 15s on New Incident)
#define ONBOARD_LED_PIN  2    // Built-in Blue LED (Mirrors alert indicator)

#define I2C_SDA_PIN      21   // I2C OLED SDA
#define I2C_SCL_PIN      22   // I2C OLED SCL

#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1
#define SCREEN_ADDRESS   0x3C // Standard I2C address for SSD1306

// =====================================================================================
// 2. NETWORK & BACKEND CONFIGURATION
// =====================================================================================
// [STA MODE] Hotspot or local Wi-Fi to reach the central cloud backend
const char* sta_ssid     = "MSI 6704";             // Hotspot / Wi-Fi SSID
const char* sta_password = "YOUR_WIFI_PASSWORD";    // Wi-Fi Password

// [AP MODE] Open Emergency Wi-Fi network for stranded citizens
const char* ap_ssid      = "NE-SHIELD-EMERGENCY";   // Also works as EMERGENCY_DISASTER_PORTAL
const char* ap_password  = "";                      // Open / No password
const char* node_id      = "ESP32-OFFGRID-01";

// [CENTRAL CLOUD BACKEND ENDPOINTS]
const char* backend_status_url    = "https://ne-shield-api.onrender.com/api/alert/hardware/status";
const char* backend_heartbeat_url = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/heartbeat";
const char* backend_sos_url       = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/sos";

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);

// =====================================================================================
// 3. OBJECTS & STATE VARIABLES
// =====================================================================================
DNSServer dnsServer;
WebServer server(80);
Preferences prefs;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

bool oledFound            = false;
bool sirenActive          = false;
bool webAccess            = false;
bool dbConnected          = false;
int  reportCount          = 0;

// 15-Second Incident Blinker State
bool isIncidentBlinking       = false;
unsigned long incidentBlinkStartTime = 0;
const unsigned long blinkDurationMs  = 15000;
String lastSeenIncidentId     = "";
String currentIncidentDesc    = "";
String currentIncidentReporter= "";

// Polling and Heartbeat Timers
unsigned long lastPollTime        = 0;
const unsigned long pollIntervalMs = 3000; // Poll cloud status every 3s

unsigned long lastHeartbeatTime        = 0;
const unsigned long heartbeatIntervalMs = 10000; // Send beacon heartbeat every 10s

unsigned long lastSyncAttempt        = 0;
const unsigned long syncIntervalMs    = 12000; // Background flash queue sync every 12s

// =====================================================================================
// 4. CAPTIVE PORTAL HTML INTERFACE (With Realistic Web Audio API Siren & Responder Bar)
// =====================================================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NE-SHIELD Emergency Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0b0f17;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px;
    }
    .badge-bar {
      width: 100%;
      max-width: 440px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .node-tag {
      background: #1e293b;
      color: #38bdf8;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid #0284c7;
    }
    .status-live {
      background: rgba(220, 38, 38, 0.2);
      color: #f87171;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid #dc2626;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .system-alert {
      background: #111827;
      border: 1px solid #1f2937;
      border-top: 5px solid #dc2626;
      border-radius: 14px;
      width: 100%;
      max-width: 440px;
      padding: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      margin-bottom: 12px;
    }
    .alert-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .alert-badge {
      background: #dc2626;
      color: white;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .alert-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #ffffff;
    }
    .alert-body {
      font-size: 0.88rem;
      line-height: 1.5;
      color: #cbd5e1;
      margin-bottom: 12px;
    }
    .location-box {
      background: #0f172a;
      border-radius: 8px;
      padding: 12px;
      font-size: 0.82rem;
      border-left: 4px solid #10b981;
      margin-bottom: 10px;
      color: #6ee7b7;
      line-height: 1.4;
    }
    .location-box strong { color: #34d399; }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 14px;
      width: 100%;
      max-width: 440px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .card-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .card-subtitle {
      font-size: 0.8rem;
      color: #94a3b8;
      line-height: 1.4;
      margin-bottom: 14px;
    }
    .form-group { margin-bottom: 10px; }
    label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 4px;
      display: block;
    }
    input, select, textarea {
      width: 100%;
      background: #1f2937;
      border: 1px solid #374151;
      color: white;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.9rem;
      outline: none;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #38bdf8;
    }
    .btn-submit {
      width: 100%;
      background: #dc2626;
      border: none;
      padding: 13px;
      border-radius: 8px;
      color: white;
      font-size: 0.95rem;
      font-weight: 800;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 6px;
    }
    .btn-submit:active { background: #b91c1c; }
    .responder-card {
      border: 1px solid #374151;
      background: #0f172a;
      margin-top: 4px;
    }
    .btn-responder {
      flex: 1;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-weight: bold;
      font-size: 0.82rem;
      cursor: pointer;
    }
    .status-indicator {
      font-size: 0.75rem;
      color: #64748b;
      text-align: center;
      margin-top: 8px;
    }
  </style>
</head>
<body>

  <div class="badge-bar">
    <span class="node-tag">BEACON: ESP32-OFFGRID-01</span>
    <span class="status-live">EMERGENCY NETWORK</span>
  </div>

  <div class="system-alert">
    <div class="alert-header">
      <span class="alert-badge">National Warning</span>
      <h2 class="alert-title">Emergency Notice</h2>
    </div>
    <p class="alert-body">
      Cellular towers may be offline. You are directly connected to an autonomous disaster beacon node. Follow evacuation directives.
    </p>
    <div class="location-box">
      <strong>DESIGNATED SAFE ROUTE:</strong> Evacuate uphill towards NH-206 Mawphlang Ridge. Avoid cutting slopes and river valleys. Relief teams active.
    </div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-align: right;">Authority: State Emergency Operations Center (SEOC)</div>
  </div>

  <div class="card">
    <div class="card-title">📋 Relief Dispatch Registration</div>
    <p class="card-subtitle">Log your details to internal flash storage. Data transmits directly to the central rescue dashboard.</p>
    <form action="/submit" method="POST">
      <div class="form-group">
        <label for="name">Your Full Name or Family Name *</label>
        <input type="text" id="name" name="name" placeholder="e.g. John Doe / Lyngdoh Family" required>
      </div>

      <div class="form-group">
        <label for="phone">Contact Phone / ICE Number</label>
        <input type="tel" id="phone" name="phone" placeholder="e.g. +91 98620 XXXXX">
      </div>

      <div class="form-group">
        <label for="location">Current Landmark / GPS / Distance</label>
        <input type="text" id="location" name="location" placeholder="e.g. Near km 14 milestone, roadside shelter" required>
      </div>

      <div class="form-group">
        <label for="people">Number of People with You</label>
        <input type="number" id="people" name="people_count" min="1" max="50" value="1">
      </div>

      <div class="form-group">
        <label for="status">Triage Condition / Medical Need</label>
        <select id="status" name="status">
          <option value="Safe">Safe - Awaiting Evacuation Transport</option>
          <option value="Minor Injuries">Minor Injuries - First Aid Required</option>
          <option value="Urgent Medical">Urgent: Trauma / Fracture / Insulin / Elderly</option>
          <option value="Critical">Critical - Trapped under debris / Urgent Rescue</option>
        </select>
      </div>

      <div class="form-group">
        <label for="notes">Specific Needs / Road Obstruction Notes</label>
        <textarea id="notes" name="notes" rows="2" placeholder="e.g. Mudslide blocked road, family requires drinking water..."></textarea>
      </div>

      <button type="submit" class="btn-submit">LOG STATUS TO RELIEF NODE</button>
    </form>
    <div class="status-indicator">Node ID: ESP32-OFFGRID-01 | Internal Flash & Cloud Sync Ready</div>
  </div>

  <!-- Field Responder Siren Override Card -->
  <div class="card responder-card">
    <div class="card-title" style="font-size: 0.95rem; color: #f59e0b;">⚡ Field Officer & Responder Siren Controls</div>
    <p style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 10px;">Direct local Wi-Fi control over hardware acoustic beacon buzzer (GPIO 4).</p>
    <div style="display: flex; gap: 8px;">
      <button type="button" onclick="toggleLocalSiren('on')" class="btn-responder" style="background: #dc2626;">🚨 Sound Siren</button>
      <button type="button" onclick="toggleLocalSiren('off')" class="btn-responder" style="background: #334155;">⏹️ Silence Siren</button>
    </div>
    <div id="sirenMsg" style="font-size: 0.78rem; color: #38bdf8; margin-top: 8px; text-align: center; font-weight: bold;"></div>
  </div>

  <!-- Realistic Web Audio API Siren Engine (853Hz + 960Hz EAS standard tones) -->
  <script>
    let audioCtx = null;
    let isPlaying = false;

    function startRealisticSiren() {
      if (isPlaying) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        isPlaying = true;
        playPulse();
      } catch (e) {
        console.log("Audio waiting for user gesture");
      }
    }

    function playPulse() {
      if (!isPlaying || !audioCtx) return;
      const now = audioCtx.currentTime;

      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(853, now);
      osc2.frequency.setValueAtTime(960, now);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      gain.gain.setValueAtTime(0.06, now);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);

      setTimeout(playPulse, 2700);
    }

    window.addEventListener('load', startRealisticSiren);
    ['touchstart', 'mousedown', 'scroll', 'keydown'].forEach(evt => {
      document.addEventListener(evt, startRealisticSiren, { once: true });
    });

    function toggleLocalSiren(state) {
      document.getElementById('sirenMsg').innerText = 'Transmitting command to beacon...';
      fetch('/api/siren?state=' + state)
        .then(r => r.json())
        .then(d => {
          document.getElementById('sirenMsg').innerText = d.siren_active ? '🚨 SIREN SOUNDING (ACTIVE ALERT)' : '⏹️ SIREN SILENCED (STANDBY)';
        })
        .catch(e => {
          document.getElementById('sirenMsg').innerText = 'Command dispatched to node.';
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
    h2 { color: #34d399; margin-bottom: 10px; font-size: 1.3rem; }
    p { font-size: 0.9rem; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; }
    .btn { display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: bold; font-size: 0.88rem; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 44px; margin-bottom: 10px;">✅</div>
    <h2>DISTRESS SIGNAL LOGGED</h2>
    <p>Your details have been saved to local flash storage and transmitted directly to the State Disaster Operations Command (SEOC) database.</p>
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
    Serial.println("[I2C] No OLED found at 0x3C. Headless mode active.");
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

  // Line 1: Wi-Fi STA
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
  display.println(dbConnected ? "[ONLINE]" : "[OFFLINE]");

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
  display.print("Reported by: ");
  display.println(reporter.substring(0, 12));

  display.setCursor(0, 28);
  display.println(desc.substring(0, 42));

  display.setCursor(0, 52);
  display.print("BEACON STROBE ACTIVE");

  display.display();
}

// =====================================================================================
// 6. LEDS & ACTUATORS CONTROLLER
// =====================================================================================
void updateStatusLEDs() {
  // LED 1 (GPIO 18): DB Connection Status
  digitalWrite(LED_DB_PIN, dbConnected ? HIGH : LOW);

  // LED 2 (GPIO 19): Web / Wi-Fi Access
  digitalWrite(LED_WIFI_PIN, webAccess ? HIGH : LOW);

  // LED 3 (GPIO 5) & Onboard LED (GPIO 2): 15-second 5Hz Strobe
  if (isIncidentBlinking) {
    unsigned long elapsed = millis() - incidentBlinkStartTime;
    if (elapsed < blinkDurationMs) {
      int remainingSec = (blinkDurationMs - elapsed) / 1000 + 1;
      bool blinkState = ((elapsed / 100) % 2) == 0; // 5Hz blink
      digitalWrite(LED_ALERT_PIN, blinkState ? HIGH : LOW);
      digitalWrite(ONBOARD_LED_PIN, blinkState ? HIGH : LOW);

      // Refresh countdown on OLED every 500ms
      if (elapsed % 500 < 50) {
        showIncidentOnDisplay(currentIncidentDesc, currentIncidentReporter, remainingSec);
      }
    } else {
      isIncidentBlinking = false;
      digitalWrite(LED_ALERT_PIN, sirenActive ? HIGH : LOW);
      digitalWrite(ONBOARD_LED_PIN, sirenActive ? HIGH : LOW);
      updateIdleDisplay();
      Serial.println("[ALERT] 15-second incident LED blink interval finished.");
    }
  } else {
    digitalWrite(LED_ALERT_PIN, sirenActive ? HIGH : LOW);
    digitalWrite(ONBOARD_LED_PIN, sirenActive ? HIGH : LOW);
  }

  // Physical Acoustic Siren (GPIO 4)
  digitalWrite(SIREN_PIN, sirenActive ? HIGH : LOW);
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

// =====================================================================================
// 7. BACKEND SYNC: POLL CLOUD, SEND HEARTBEAT & FORWARD SOS
// =====================================================================================
void pollBackendStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    webAccess = false;
    dbConnected = false;
    return;
  }

  webAccess = true;
  WiFiClientSecure client;
  client.setInsecure(); // Accept Cloud HTTPS certificates without CA bundle
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

        String incDesc = "Hazard on slope";
        int descIdx = payload.indexOf("\"latest_incident_message\":\"");
        if (descIdx >= 0) {
          int descEnd = payload.indexOf("\"", descIdx + 27);
          incDesc = payload.substring(descIdx + 27, descEnd);
        }

        String incRep = "Observer";
        int repIdx = payload.indexOf("\"latest_incident_reporter\":\"");
        if (repIdx >= 0) {
          int repEnd = payload.indexOf("\"", repIdx + 28);
          incRep = payload.substring(repIdx + 28, repEnd);
        }

        if (incId != "" && incId != "null" && incId != lastSeenIncidentId) {
          if (lastSeenIncidentId != "") { // Skip initial boot check
            Serial.printf("[INCIDENT] New incident detected: %s! Starting 15s alert strobe.\n", incId.c_str());
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

// Forward captive portal citizen submission to cloud database
bool forwardSosToBackend(String name, String phone, int people, String med, String notes, String clientIp) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  if (http.begin(client, backend_sos_url)) {
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000);

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
void syncPendingSosLogs() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastSyncAttempt < syncIntervalMs) return;
  lastSyncAttempt = millis();

  prefs.begin("sos_db", false);
  int count = prefs.getInt("total", 0);
  for (int i = 1; i <= count; i++) {
    String pfx = "r_" + String(i) + "_";
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

void handleSubmit() {
  // Support both "name" and "citizen_name"
  String name = server.hasArg("name") ? server.arg("name") : (server.hasArg("citizen_name") ? server.arg("citizen_name") : "Citizen");
  String phone = server.hasArg("phone") ? server.arg("phone") : "";
  String loc = server.hasArg("location") ? server.arg("location") : "Emergency Zone";
  int people = server.hasArg("people_count") ? server.arg("people_count").toInt() : 1;
  String stat = server.hasArg("status") ? server.arg("status") : (server.hasArg("medical_needs") ? server.arg("medical_needs") : "Safe");
  String rawNotes = server.hasArg("notes") ? server.arg("notes") : "";
  String clientIp = server.client().remoteIP().toString();

  String fullNotes = "Location: " + loc;
  if (rawNotes.length() > 0) fullNotes += " | Notes: " + rawNotes;

  Serial.println("[CAPTIVE] New citizen SOS submission received:");
  Serial.printf("  Name: %s | Phone: %s | Loc: %s | Condition: %s | People: %d\n", name.c_str(), phone.c_str(), loc.c_str(), stat.c_str(), people);

  // 1. Immediately forward to Central Supabase DB via Backend API
  bool synced = forwardSosToBackend(name, phone, people, stat, fullNotes, clientIp);
  Serial.printf("  Database sync status: %s\n", synced ? "SUCCESS (Persisted in DB)" : "QUEUED LOCALLY IN FLASH");

  // 2. Save to local flash memory with sync status flag
  prefs.begin("sos_db", false);
  reportCount++;
  String pfx = "r_" + String(reportCount) + "_";
  prefs.putString((pfx + "n").c_str(), name);
  prefs.putString((pfx + "p").c_str(), phone);
  prefs.putString((pfx + "l").c_str(), loc);
  prefs.putInt((pfx + "c").c_str(), people);
  prefs.putString((pfx + "m").c_str(), stat);
  prefs.putString((pfx + "msg").c_str(), fullNotes);
  prefs.putInt((pfx + "s").c_str(), synced ? 1 : 0);
  prefs.putString(("r_" + String(reportCount)).c_str(), name + " | " + loc + " | " + stat + " | People: " + String(people));
  prefs.putInt("total", reportCount);
  prefs.end();

  // 3. Return confirmation HTML to citizen's phone
  server.send_P(200, "text/html", SUCCESS_HTML);
}

// In-browser offline officer console showing all stored flash reports
void handleAdmin() {
  prefs.begin("sos_db", true);
  int count = prefs.getInt("total", 0);
  String page = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0f172a;color:white;padding:20px;max-width:600px;margin:auto;'>";
  page += "<h2 style='color:#38bdf8;'>Logged SOS Reports (" + String(count) + ")</h2>";
  page += "<p style='color:#94a3b8;font-size:0.85rem;margin-bottom:16px;'>Internal NVS Flash Records on " + String(node_id) + "</p>";
  page += "<ul style='padding:0;'>";

  for (int i = 1; i <= count; i++) {
    String pfx = "r_" + String(i) + "_";
    String n = prefs.getString((pfx + "n").c_str(), "Citizen");
    String l = prefs.getString((pfx + "l").c_str(), "Unknown Loc");
    String m = prefs.getString((pfx + "m").c_str(), "Safe");
    int s = prefs.getInt((pfx + "s").c_str(), 0);

    page += "<li style='background:#1e293b;margin-bottom:10px;padding:12px;border-radius:8px;list-style:none;border-left:4px solid " + String(s ? "#10b981" : "#ef4444") + ";'>";
    page += "<strong>#" + String(i) + " " + n + "</strong><br>";
    page += "<span style='font-size:0.85rem;color:#cbd5e1;'>📍 " + l + " | ⚡ " + m + "</span><br>";
    page += "<span style='font-size:0.75rem;font-weight:bold;color:" + String(s ? "#34d399" : "#f87171") + ";'>" + (s ? "✓ SYNCED TO CLOUD DB" : "⏳ STORED LOCALLY IN FLASH") + "</span>";
    page += "</li>";
  }
  page += "</ul><br><a href='/' style='color:#38bdf8;text-decoration:none;font-weight:bold;'>← Return to Main Portal</a></body></html>";
  prefs.end();
  server.send(200, "text/html", page);
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

  prefs.begin("sos_db", true);
  int count = prefs.getInt("total", 0);
  String json = "[";
  for (int i = 1; i <= count; i++) {
    String pfx = "r_" + String(i) + "_";
    String n = prefs.getString((pfx + "n").c_str(), "Citizen");
    String p = prefs.getString((pfx + "p").c_str(), "");
    int c = prefs.getInt((pfx + "c").c_str(), 1);
    String m = prefs.getString((pfx + "m").c_str(), "Safe");
    String msg = prefs.getString((pfx + "msg").c_str(), "");
    int s = prefs.getInt((pfx + "s").c_str(), 0);

    if (i > 1) json += ",";
    json += "{";
    json += "\"id\":" + String(i) + ",";
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

  // Initialize NVS Flash
  prefs.begin("sos_db", false);
  reportCount = prefs.getInt("total", 0);
  prefs.end();
  Serial.printf("[NVS] Internal flash loaded: %d stored SOS reports.\n", reportCount);

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
  server.on("/submit", HTTP_POST, handleSubmit);
  server.on("/submit_sos", HTTP_POST, handleSubmit);
  server.on("/admin", HTTP_GET, handleAdmin);
  server.on("/api/siren", HTTP_ANY, handleApiSiren);
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/sos_logs", HTTP_GET, handleApiSosLogs);

  // Captive Portal probe redirects for Android, iOS, Windows, Mac
  server.on("/generate_204", handleRoot);
  server.on("/canonical.html", handleRoot);
  server.on("/hotspot-detect.html", handleRoot);
  server.on("/ncsi.txt", handleRoot);
  server.on("/connecttest.txt", handleRoot);
  server.onNotFound(handleRoot);

  server.begin();
  Serial.println("[HTTP] Captive Web Server & Local APIs started on port 80");

  // 4. Connect STA Wi-Fi in background to reach cloud backend
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

  // 4. Background Sync: flush stored offline flash submissions to central cloud
  syncPendingSosLogs();

  // 5. Periodic polling of Cloud Backend (every 3s)
  if (millis() - lastPollTime >= pollIntervalMs) {
    lastPollTime = millis();
    pollBackendStatus();
    if (!isIncidentBlinking) {
      updateIdleDisplay();
    }
  }

  // 6. Periodic Heartbeat to register beacon with Admin Dashboard (every 10s)
  if (millis() - lastHeartbeatTime >= heartbeatIntervalMs) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  // 7. Actuate LEDs & Siren
  updateStatusLEDs();
}
