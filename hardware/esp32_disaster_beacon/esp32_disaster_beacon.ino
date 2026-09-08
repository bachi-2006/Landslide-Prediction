#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// =====================================================================================
// 1. PIN CONFIGURATION (STRICT: GPIO 2, 4, 5 ONLY)
// =====================================================================================
#define LED_NET_PIN   2   // Network indication (Solid ON when connected to Wi-Fi / Internet)
#define LED_DB_PIN    4   // DB connection status (Solid ON when Supabase/Cloud DB connected)
#define LED_ALERT_PIN 5   // Incident strobe/pulse LED

// LCD Display (I2C 0x27, SDA=21, SCL=22)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// =====================================================================================
// 2. NETWORK & BACKEND CONFIGURATION
// =====================================================================================
const char* sta_ssid     = "MSI 6704";
const char* sta_password = "11111111";

const char* ap_ssid      = "NE-SHIELD-EMERGENCY";
const char* ap_password  = "";
const char* node_id      = "ESP32-OFFGRID-01";

const char* backend_base_url       = "https://ne-shield-api.onrender.com";
const char* backend_status_url    = "https://ne-shield-api.onrender.com/api/alert/hardware/status";
const char* backend_heartbeat_url = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/heartbeat";
const char* backend_sos_url       = "https://ne-shield-api.onrender.com/api/alert/hardware/beacon/sos";

const byte DNS_PORT = 53;
IPAddress apIP(192, 168, 4, 1);

DNSServer dnsServer;
WebServer server(80);
Preferences prefs;

bool webAccess   = false;
bool dbConnected = false;
int reportCount  = 0;

enum AlertType {
  ALERT_NONE,
  ALERT_DISASTER,
  ALERT_MEDICAL,
  ALERT_GENERAL
};

AlertType currentAlertType       = ALERT_NONE;
bool isIncidentBlinking           = false;
unsigned long incidentBlinkStartTime = 0;
const unsigned long blinkDurationMs  = 20000;
String lastSeenIncidentId         = "";
String currentIncidentDesc        = "";
String currentIncidentReporter    = "";

unsigned long lastPollTime        = 0;
const unsigned long pollIntervalMs = 4000;

unsigned long lastHeartbeatTime   = 0;
const unsigned long heartbeatIntervalMs = 12000;

unsigned long lastSyncAttempt     = 0;
const unsigned long syncIntervalMs = 15000;

// =====================================================================================
// 3. CAPTIVE PORTAL HTML INTERFACE
// =====================================================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>NE-SHIELD Emergency Portal</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b0f17; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 14px; }
.badge-bar { width: 100%; max-width: 440px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.node-tag { background: #1e293b; color: #38bdf8; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #0284c7; }
.status-live { background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px; border: 1px solid #10b981; }
.system-alert { background: #111827; border: 1px solid #1f2937; border-top: 5px solid #ef4444; border-radius: 14px; width: 100%; max-width: 440px; padding: 16px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); margin-bottom: 12px; }
.alert-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.alert-badge { background: #ef4444; color: white; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; }
.alert-title { font-size: 1.15rem; font-weight: 800; color: #ffffff; }
.alert-body { font-size: 0.88rem; line-height: 1.5; color: #cbd5e1; margin-bottom: 12px; }
.location-box { background: #0f172a; border-radius: 8px; padding: 12px; font-size: 0.82rem; border-left: 4px solid #10b981; margin-bottom: 10px; color: #6ee7b7; line-height: 1.4; }
.location-box strong { color: #34d399; }
.card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; width: 100%; max-width: 440px; padding: 16px; margin-bottom: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
.card-title { font-size: 1.05rem; font-weight: 800; color: #ffffff; margin-bottom: 4px; }
.card-subtitle { font-size: 0.8rem; color: #94a3b8; line-height: 1.4; margin-bottom: 14px; }
.form-group { margin-bottom: 10px; }
label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; display: block; }
input[type="text"], input[type="tel"], input[type="number"], select, textarea { width: 100%; background: #0b0f17; border: 1px solid #374151; border-radius: 8px; padding: 10px 12px; color: #f8fafc; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
input:focus, select:focus, textarea:focus { border-color: #0284c7; }
.btn-submit { width: 100%; background: #0284c7; color: white; border: none; border-radius: 8px; padding: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-top: 8px; }
.btn-submit:hover { background: #0369a1; }
.led-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px; font-size: 0.8rem; color: #94a3b8; line-height: 1.5; }
.led-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: white; margin-right: 4px; font-size: 0.72rem; }
</style>
</head>
<body>
<div class="badge-bar">
<span class="node-tag">NODE: ESP32-OFFGRID-01</span>
<span class="status-live">PORTAL ACTIVE</span>
</div>
<div class="system-alert">
<div class="alert-header">
<span class="alert-badge">Warning</span>
<h2 class="alert-title">Disaster Broadcast</h2>
</div>
<p class="alert-body">
Cellular networks may be impaired. You are connected to an autonomous offline disaster beacon node. Register your location and condition below.
</p>
<div class="location-box">
<strong>RECOMMENDED ACTION:</strong> Move away from steep slopes, rockfall zones, and flood runoffs towards elevated bedrock areas.
</div>
</div>
<div class="card">
<div class="card-title">📝 Emergency Status Registration</div>
<div class="card-subtitle">Saved to internal non-volatile memory & synced automatically to Central Command.</div>
<form action="/submit" method="POST">
<div class="form-group">
<label for="name">Your Name / Group Contact</label>
<input type="text" id="name" name="name" placeholder="Full name" required>
</div>
<div class="form-group">
<label for="phone">Contact Number / Alternate</label>
<input type="tel" id="phone" name="phone" placeholder="Mobile number">
</div>
<div class="form-group">
<label for="location">Current Location / Landmark</label>
<input type="text" id="location" name="location" placeholder="e.g. Near Mawphlang Ridge Bridge, NH-40" required>
</div>
<div class="form-group">
<label for="people">Number of People</label>
<input type="number" id="people" name="people_count" min="1" max="50" value="1">
</div>
<div class="form-group">
<label for="status">Medical / Triage Condition</label>
<select id="status" name="status">
<option value="Safe">Safe - Awaiting Transport</option>
<option value="Minor Injuries">Minor Injuries - First Aid</option>
<option value="Urgent Medical">Urgent Medical Attention Needed</option>
<option value="Critical">Critical - Trapped / Immediate Rescue</option>
</select>
</div>
<div class="form-group">
<label for="notes">Incident / Hazard Observations</label>
<textarea id="notes" name="notes" rows="2" placeholder="e.g. Road cracked, landslide 100m ahead..."></textarea>
</div>
<button type="submit" class="btn-submit">SUBMIT REPORT TO NODE</button>
</form>
</div>
<div class="card led-card">
<strong style="color: #f8fafc;">Hardware LED Indicators:</strong><br>
• <span class="led-tag" style="background:#2563eb;">GPIO 2</span> <strong>Network</strong>: Solid ON = Connected to Wi-Fi / Internet.<br>
• <span class="led-tag" style="background:#16a34a;">GPIO 4</span> <strong>Database</strong>: Solid ON = Connected to Supabase / Backend.<br>
• <span class="led-tag" style="background:#dc2626;">GPIO 5</span> <strong>Incident Alert</strong>: Flashes pattern on new report.
</div>
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

void updateLCDStatus() {
  lcd.setCursor(0, 0);
  lcd.print("STA:");
  lcd.print(webAccess ? "OK " : "NC ");
  lcd.print("DB:");
  lcd.print(dbConnected ? "OK " : "NC ");
  lcd.print("U:");
  lcd.print(WiFi.softAPgetStationNum());
  lcd.print("  ");
  lcd.setCursor(0, 1);
  if (isIncidentBlinking) {
    lcd.print("ALERT: ACTIVE!  ");
  } else {
    lcd.print("AP: 192.168.4.1 ");
  }
}

void updateStatusLEDs() {
  if (webAccess) {
    digitalWrite(LED_NET_PIN, HIGH);
  } else {
    bool netBlink = ((millis() / 200) % 2) == 0;
    digitalWrite(LED_NET_PIN, netBlink ? HIGH : LOW);
  }
  
  digitalWrite(LED_DB_PIN, dbConnected ? HIGH : LOW);
  
  if (isIncidentBlinking) {
    unsigned long elapsed = millis() - incidentBlinkStartTime;
    if (elapsed < blinkDurationMs) {
      bool ledState = false;
      switch (currentAlertType) {
        case ALERT_DISASTER:
          ledState = ((elapsed / 100) % 2) == 0;
          break;
        case ALERT_MEDICAL:
          ledState = ((elapsed / 300) % 2) == 0;
          break;
        case ALERT_GENERAL:
        default:
          {
            unsigned long cycle = elapsed % 1000;
            if (cycle < 100) ledState = true;
            else if (cycle < 200) ledState = false;
            else if (cycle < 300) ledState = true;
            else ledState = false;
          }
          break;
      }
      digitalWrite(LED_ALERT_PIN, ledState ? HIGH : LOW);
    } else {
      isIncidentBlinking = false;
      currentAlertType = ALERT_NONE;
      digitalWrite(LED_ALERT_PIN, LOW);
    }
  } else {
    digitalWrite(LED_ALERT_PIN, LOW);
  }
}

AlertType classifyIncident(String text) {
  text.toLowerCase();
  if (text.indexOf("injur") >= 0 || text.indexOf("medical") >= 0 || 
      text.indexOf("trapped") >= 0 || text.indexOf("casualt") >= 0 || 
      text.indexOf("fractur") >= 0 || text.indexOf("blood") >= 0 ||
      text.indexOf("critical") >= 0 || text.indexOf("hospital") >= 0) {
    return ALERT_MEDICAL;
  }
  if (text.indexOf("landslide") >= 0 || text.indexOf("rockfall") >= 0 || 
      text.indexOf("block") >= 0 || text.indexOf("mudslide") >= 0 || 
      text.indexOf("flood") >= 0 || text.indexOf("collapse") >= 0 ||
      text.indexOf("debris") >= 0 || text.indexOf("disaster") >= 0 ||
      text.indexOf("hazard") >= 0 || text.indexOf("crack") >= 0) {
    return ALERT_DISASTER;
  }
  return ALERT_GENERAL;
}

String cleanString(String s) {
  s.replace("\"", "'");
  s.replace("\r", " ");
  s.replace("\n", " ");
  s.replace("\\", "/");
  s.trim();
  return s;
}

void pollBackendStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    webAccess = false;
    dbConnected = false;
    return;
  }
  webAccess = true;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (http.begin(client, backend_status_url)) {
    http.setTimeout(4000);
    int httpCode = http.GET();
    if (httpCode == 200) {
      String payload = http.getString();
      dbConnected = true;
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
          if (lastSeenIncidentId != "") {
            currentAlertType = classifyIncident(incDesc);
            isIncidentBlinking = true;
            incidentBlinkStartTime = millis();
            currentIncidentDesc = incDesc;
            currentIncidentReporter = incRep;
            Serial.printf("[ALERT] New incident detected: %s (Type: %d)\n", incDesc.c_str(), currentAlertType);
          }
          lastSeenIncidentId = incId;
        }
      }
    } else {
      dbConnected = false;
      Serial.printf("[POLL] Cloud status HTTP %d\n", httpCode);
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
    body += "\"siren_active\":false,";
    body += "\"wifi_ssid\":\"" + String(sta_ssid) + "\",";
    body += "\"sta_ip\":\"" + WiFi.localIP().toString() + "\",";
    body += "\"db_connected\":" + String(dbConnected ? "true" : "false") + ",";
    body += "\"clients_connected\":" + String(WiFi.softAPgetStationNum()) + ",";
    body += "\"last_incident_seen\":\"" + lastSeenIncidentId + "\"";
    body += "}";
    int httpCode = http.POST(body);
    if (httpCode == 200) {
      Serial.println("[HEARTBEAT] Node registered online in Central Command.");
    }
    http.end();
  }
}

bool forwardSosToBackend(String name, String phone, int people, String med, String notes, String clientIp) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SOS] Cannot forward to cloud: Station Wi-Fi not connected.");
    return false;
  }
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
    
    Serial.println("[SOS] Forwarding distress signal to Central Command...");
    int httpCode = http.POST(json);
    String response = http.getString();
    Serial.printf("[SOS] Cloud response HTTP %d: %s\n", httpCode, response.c_str());
    http.end();
    return (httpCode == 200 || httpCode == 201);
  }
  return false;
}

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
      Serial.printf("[SYNC] Syncing uncommitted flash report #%d to cloud...\n", i);
      if (forwardSosToBackend(n, p, c, m, msg, "192.168.4.1 (synced-from-flash)")) {
        prefs.putInt((pfx + "s").c_str(), 1);
        Serial.printf("[SYNC] Report #%d synced successfully!\n", i);
      } else {
        break;
      }
    }
  }
  prefs.end();
}

void handleRoot() {
  server.send_P(200, "text/html", PORTAL_HTML);
}

void handleSubmit() {
  String name = server.hasArg("name") ? server.arg("name") : (server.hasArg("citizen_name") ? server.arg("citizen_name") : "Citizen");
  String phone = server.hasArg("phone") ? server.arg("phone") : "";
  String loc = server.hasArg("location") ? server.arg("location") : "Emergency Zone";
  int people = server.hasArg("people_count") ? server.arg("people_count").toInt() : 1;
  String stat = server.hasArg("status") ? server.arg("status") : (server.hasArg("medical_needs") ? server.arg("medical_needs") : "Safe");
  String rawNotes = server.hasArg("notes") ? server.arg("notes") : "";
  String clientIp = server.client().remoteIP().toString();

  String fullNotes = "Location: " + loc;
  if (rawNotes.length() > 0) fullNotes += " | Notes: " + rawNotes;

  currentAlertType = classifyIncident(stat + " " + fullNotes);
  isIncidentBlinking = true;
  incidentBlinkStartTime = millis();

  bool synced = forwardSosToBackend(name, phone, people, stat, fullNotes, clientIp);

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

  updateLCDStatus();
  server.send_P(200, "text/html", SUCCESS_HTML);
}

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

void handleApiStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  String json = "{";
  json += "\"node_id\":\"" + String(node_id) + "\",";
  json += "\"network_connected\":" + String(webAccess ? "true" : "false") + ",";
  json += "\"db_connected\":" + String(dbConnected ? "true" : "false") + ",";
  json += "\"incident_alert_active\":" + String(isIncidentBlinking ? "true" : "false") + ",";
  json += "\"alert_type\":" + String(currentAlertType) + ",";
  json += "\"clients_connected\":" + String(WiFi.softAPgetStationNum()) + ",";
  json += "\"sta_ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"ap_ip\":\"" + apIP.toString() + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

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

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_AP_STACONNECTED) {
    updateLCDStatus();
  }
  if (event == ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) {
    updateLCDStatus();
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[INIT] Booting NE-SHIELD Disaster Beacon Node...");

  Wire.begin(21, 22);
  lcd.init();
  lcd.clear();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("NE-SHIELD BOOT");
  lcd.setCursor(0, 1);
  lcd.print("INIT SYSTEM...");

  pinMode(LED_NET_PIN, OUTPUT);
  pinMode(LED_DB_PIN, OUTPUT);
  pinMode(LED_ALERT_PIN, OUTPUT);

  digitalWrite(LED_NET_PIN, LOW);
  digitalWrite(LED_DB_PIN, LOW);
  digitalWrite(LED_ALERT_PIN, LOW);

  prefs.begin("sos_db", false);
  reportCount = prefs.getInt("total", 0);
  prefs.end();
  Serial.printf("[STORAGE] Initialized NVS flash. Total logged reports: %d\n", reportCount);

  WiFi.onEvent(onWiFiEvent);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(ap_ssid, ap_password);

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/submit", HTTP_POST, handleSubmit);
  server.on("/submit_sos", HTTP_POST, handleSubmit);
  server.on("/admin", HTTP_GET, handleAdmin);
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/sos_logs", HTTP_GET, handleApiSosLogs);

  server.on("/generate_204", handleRoot);
  server.on("/canonical.html", handleRoot);
  server.on("/hotspot-detect.html", handleRoot);
  server.on("/ncsi.txt", handleRoot);
  server.on("/connecttest.txt", handleRoot);
  server.onNotFound(handleRoot);

  server.begin();
  
  Serial.printf("[WIFI] Connecting to Station SSID: '%s'...\n", sta_ssid);
  WiFi.begin(sta_ssid, sta_password);
  updateLCDStatus();
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();

  if (WiFi.status() == WL_CONNECTED) {
    webAccess = true;
  } else {
    webAccess = false;
  }

  syncPendingSosLogs();

  if (millis() - lastPollTime >= pollIntervalMs) {
    lastPollTime = millis();
    pollBackendStatus();
    updateLCDStatus();
  }

  if (millis() - lastHeartbeatTime >= heartbeatIntervalMs) {
    lastHeartbeatTime = millis();
    sendHeartbeat();
  }

  updateStatusLEDs();
}
