# 🚨 NE-SHIELD: ESP32 Autonomous Disaster Alert Beacon & Captive Portal Node

> **Smart India Hackathon (SIH) 2026**  
> **Problem Statement:** Resilient Landslide Early Warning & Last-Mile Evacuation System  
> **Edge Tier:** Dual-Mode Offline Disaster Node with Captive DNS Interception, I2C Display & SOS Triage Logger

---

## 📌 Overview

When catastrophic landslides strike high-altitude corridors in North-East India (e.g. NH-40 Shillong–Guwahati, East Khasi Hills), commercial cellular towers and fiber optics are often sheared. The **NE-SHIELD ESP32 Disaster Alert Beacon** acts as a self-healing emergency command post bridging this critical gap:

1. **Dual-Mode Wi-Fi Architecture (`AP + STA`)**:
   - **Station Mode (STA):** Connects to any emergency hotspot or router to communicate with the NE-SHIELD central backend (`https://ne-shield-api.onrender.com/api/alert/hardware/status`).
   - **Access Point Mode (AP):** Continuously broadcasts an open emergency Wi-Fi network: `NE-SHIELD-EMERGENCY` (Gateway `192.168.4.1`).
2. **Offline Captive Portal (DNS Port 53 Interception):**
   - Any smartphone or laptop connecting to `NE-SHIELD-EMERGENCY` is automatically redirected to the emergency triage portal—**zero internet, SIM card, or app installation required**.
   - Serves immediate evacuation route instructions (e.g., *Uphill to NH-206 Mawphlang Safe Corridor*).
3. **Citizen SOS Registration Synchronized to Central Database:**
   - Stranded citizens input their Full Name, Contact, Headcount, and Medical Needs.
   - The ESP32 writes the data locally to non-volatile flash memory (`Preferences.h`) AND transmits it directly to Supabase (`public.beacon_sos_logs` & `public.relief_requests`).
   - Rescuers and Admin HQ see these victim registrations in real-time on the SEOC Dashboard!
4. **Physical Actuation & Peripherals:**
   - **GPIO 4 (SIREN_PIN):** Mandatory high-decibel acoustic siren / buzzer / relay.
   - **GPIO 18 (LED_DB_PIN):** Solid ON indicates active connection with the Database / Backend API.
   - **GPIO 19 (LED_WIFI_PIN):** Solid ON indicates Web / Wi-Fi Internet access.
   - **GPIO 5 (LED_ALERT_PIN):** Blinks rapidly for a 15-second interval whenever a **NEW INCIDENT** is reported!
   - **GPIO 21 & 22 (I2C):** SSD1306 OLED (128x64) displays real-time telemetry and full incident banners.

---

## 🛠️ Complete Hardware Wiring Diagram

| ESP32 Pin | Peripheral / Component | Description |
|---|---|---|
| **GPIO 4** | Active Buzzer (+) / Relay IN | **Mandatory Siren Warning**: Sounds high-decibel alarm during alerts |
| **GPIO 18** | LED 1 (Green/Blue) + 330Ω Resistor | **DB Connection Indicator**: Solid ON when connected to database |
| **GPIO 19** | LED 2 (Yellow/White) + 330Ω Resistor | **Web Access Indicator**: Solid ON when connected to Wi-Fi Internet |
| **GPIO 5** | LED 3 (Red) + 330Ω Resistor | **Incident Alert LED**: Rapidly blinks for 15s on new incident |
| **GPIO 2** | Built-in Blue LED | Visual mirror of active alert state |
| **GPIO 21** | I2C OLED SDA (SSD1306) | Display Serial Data line |
| **GPIO 22** | I2C OLED SCL (SSD1306) | Display Serial Clock line |
| **3V3 / 5V** | OLED VCC & Sensor Power | 3.3V or 5V rail |
| **GND** | Ground Rail | Common GND for all LEDs, Buzzer, and OLED |

```
                       +-----------------------+
                       |      ESP32 DEVKIT     |
                       |                       |
      [GPIO 4] --------+---> Buzzer (+) / Relay IN (Siren Warning)
      [GPIO 18] -------+---> LED 1 (Database Connection Status)
      [GPIO 19] -------+---> LED 2 (Web / Internet Access Status)
      [GPIO 5] --------+---> LED 3 (15s New Incident Blinker)
      [GPIO 2] --------+---> Built-in Status LED
                       |
      [GPIO 21] -------+---> OLED SDA (128x64 SSD1306 Display)
      [GPIO 22] -------+---> OLED SCL (128x64 SSD1306 Display)
                       |
      [GND] -----------+---> Common Ground Rail
      [VIN/5V] <-------+--- 5V USB / Power Bank / Solar Battery
                       +-----------------------+
```

---

## 💻 Arduino IDE Setup & Required Libraries

Install the following libraries in Arduino IDE via **Tools > Manage Libraries**:
1. `Adafruit SSD1306` (by Adafruit)
2. `Adafruit GFX Library` (by Adafruit)

Ensure your board is set to:
- **Board:** `ESP32 Dev Module` (or your ESP32 variant)
- **Upload Speed:** `921600` or `115200`

Update your Wi-Fi credentials in `hardware/esp32_disaster_beacon/esp32_disaster_beacon.ino`:
```cpp
const char* sta_ssid     = "MSI 6704";            // Your phone hotspot or Wi-Fi
const char* sta_password = "YOUR_WIFI_PASSWORD";   // Your password
```

---

## 🗄️ Database Tables & Verification Queries

When the ESP32 operates, it synchronizes with the following Supabase tables:

### 1. View ESP32 Hardware Beacons
```sql
SELECT * FROM public.hardware_beacons;
```
*Columns:* `beacon_id`, `name`, `status`, `siren_active`, `wifi_ssid`, `sta_ip`, `db_connected`, `clients_connected`, `last_heartbeat`.

### 2. View Citizen Distress Registrations from Beacon Wi-Fi
```sql
SELECT citizen_name, phone, people_count, medical_needs, notes, created_at 
FROM public.beacon_sos_logs 
ORDER BY created_at DESC;
```

### 3. View Unified Relief Requests (Mobile App + ESP32 Beacons)
```sql
SELECT id, user_name, phone, locality_name, aid_type, urgency, source, beacon_id, created_at 
FROM public.relief_requests 
ORDER BY created_at DESC;
```

---

## 🎬 Testing & Verification Walkthrough

1. **Power Up the ESP32:**
   - Both `LED_WIFI_PIN` (GPIO 19) and `LED_DB_PIN` (GPIO 18) turn ON solid once connected to Wi-Fi and the database.
   - The I2C OLED display shows the Node ID, STA IP, and `DB Link: [CONNECTED]`.
2. **Citizen Registration via Captive Portal:**
   - Take any mobile phone and connect to Wi-Fi SSID `NE-SHIELD-EMERGENCY`.
   - The captive portal pops up automatically.
   - Fill in: Name: *Mary Lyngdoh*, Phone: *9862012345*, Headcount: *3*, Medical: *Urgent Medical*, Notes: *Trapped by fallen debris*.
   - Tap **"Transmit SOS to Rescue Teams"**.
   - Check Supabase or Dashboard: The registration appears immediately!
3. **Trigger New Incident / Siren Alert:**
   - On the web dashboard ([https://ne-shield.web.app](https://ne-shield.web.app)) or mobile app, submit a new incident or click **"Issue Multi-Channel Alert"**.
   - Within 3 seconds:
     - The ESP32 I2C Display displays: `! NEW INCIDENT (15s) !` with incident description!
     - `LED_ALERT_PIN` (GPIO 5) blinks rapidly at 5Hz for 15 seconds!
     - The mandatory acoustic siren (GPIO 4) sounds!
