# 🚨 NE-SHIELD: ESP32 Autonomous Disaster Alert Beacon & Captive Portal Node

> **Smart India Hackathon (SIH) 2026**  
> **Problem Statement:** Resilient Landslide Early Warning & Last-Mile Evacuation System  
> **Edge Tier:** Dual-Mode Offline Disaster Node with Captive DNS Interception & SOS Triage Logger

---

## 📌 Overview

When catastrophic landslides occur in high-risk zones (e.g., Shillong, East Khasi Hills), commercial cellular base stations and fiber backhauls are frequently severed. The **NE-SHIELD ESP32 Disaster Alert Beacon** bridges this critical last-mile gap by functioning as an autonomous, self-healing edge device:

1. **Dual-Mode Operation (`AP + STA`)**:
   - **Station Mode (STA):** Connects to any available Wi-Fi network or officer hotspot to poll the NE-SHIELD cloud backend (`https://ne-shield-api.onrender.com/api/alert/hardware/status`).
   - **Access Point Mode (AP):** Continuously broadcasts an unencrypted emergency Wi-Fi network named `NE-SHIELD-EMERGENCY` (IP `192.168.4.1`).
2. **Offline Captive Portal (DNS Port 53 Intercept):**
   - Any smartphone (Android, iOS) or laptop connecting to `NE-SHIELD-EMERGENCY` automatically launches the emergency portal with zero app installation required.
   - Citizens receive clear evacuation directives and the designated safe corridor (e.g., *Mawphlang District Relief Center via NH-206*).
   - Generates an immediate audio alert tone on victim devices via Web Audio API.
3. **Offline SOS Distress Registration:**
   - Stranded citizens can log their Name, Family Size, Landmark, and Condition (Safe, Injured, Critical).
   - All reports are saved locally to the ESP32's non-volatile flash memory (`Preferences.h` / NVS) so no records are lost if power cuts.
4. **Cloud Synchronization:**
   - Once cellular or satellite backhaul is restored, logs can be automatically synchronized to the NE-SHIELD Supabase Database (`POST /api/routes/relief-requests`).
5. **Physical Actuation:**
   - **GPIO 2:** High-visibility LED beacon.
   - **GPIO 4:** Emergency Acoustic Siren / High-Decibel Buzzer / Relay.

---

## 🛠️ Hardware Wiring Diagram

| ESP32 Pin | Component | Connection Notes |
|---|---|---|
| **GPIO 2** | Built-in Blue LED | Visual status / High-frequency alarm beacon |
| **GPIO 4** | Active Buzzer / Relay | Connect Buzzer `+` to GPIO 4 (or Relay IN), Buzzer `-` to GND |
| **GND** | Ground | Common ground with power source and buzzer |
| **5V / VIN** | USB / Battery Pack | Powered by solar battery, power bank, or 5V adapter |

```
               +-----------------------+
               |      ESP32 DEVKIT     |
               |                       |
               |  [GPIO 2] -----------> Built-in LED (Status & Beacon)
               |                       |
               |  [GPIO 4] -----------> Active Buzzer (+) / Relay IN
               |                       |
               |  [GND] --------------> Active Buzzer (-) / GND
               |                       |
               |  [VIN/5V] <----------- 5V Power Bank / Solar / USB
               +-----------------------+
```

---

## 🚀 Flashing Instructions (Arduino IDE)

### 1. Requirements
- **Arduino IDE 2.x** or 1.8.x
- **ESP32 Board Package**:
  1. Go to `File > Preferences` in Arduino IDE.
  2. In *Additional Board Manager URLs*, paste:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
  3. Go to `Tools > Board > Boards Manager...`, search for `esp32` and click **Install**.

### 2. Configure Wi-Fi Credentials
Open `hardware/esp32_disaster_beacon/esp32_disaster_beacon.ino` and update lines 33-34:
```cpp
const char* sta_ssid     = "YOUR_PHONE_HOTSPOT_NAME";
const char* sta_password = "YOUR_HOTSPOT_PASSWORD";
```
*(Leave `backend_status_url` as `https://ne-shield-api.onrender.com/api/alert/hardware/status` to connect to the live cloud backend).*

### 3. Upload to ESP32
1. Connect your ESP32 board to your computer via micro-USB / USB-C.
2. In Arduino IDE:
   - **Board:** `ESP32 Dev Module` (or your specific ESP32 variant)
   - **Port:** Select your board's COM port (e.g., `COM3`, `COM5`)
   - **Upload Speed:** `921600` or `115200`
3. Click **Upload** (Arrow button).
4. Open the **Serial Monitor** at baud rate `115200` to verify startup logs.

---

## 🎬 End-to-End Demonstration for Evaluators / SIH Jury

### Step 1: Open Live Web Dashboard or Mobile App
- **Live Web Dashboard:** [https://ne-shield.web.app](https://ne-shield.web.app)
- **Android APK:** `release/ne-shield-app-debug.apk`
- Log in with role:
  - **Admin:** Passcode `99`
  - **Field Officer:** Passcode `9`

### Step 2: Trigger Landslide Disaster Simulation
1. On the web dashboard, open the **Disaster Simulator** modal.
2. Select **East Khasi Hills** (or Shillong corridor), slide rainfall to **120mm**, slope to **42°**.
3. Click **"Execute ML Simulation Pipeline"**.
4. The real-time XGBoost ML pipeline computes risk: `Critical (0.94)`.
5. The dashboard broadcasts the alert and triggers the hardware siren via `POST /api/alert/hardware/trigger`.

### Step 3: Hardware Edge Activation
1. Within 3 seconds, the ESP32 receives the alert status from the cloud backend.
2. The onboard LED (GPIO 2) and Siren (GPIO 4) begin pulsing emergency alarm bursts.
3. Serial monitor outputs: `[ALERT TRIGGERED FROM CLOUD]: SIMULATED ALERT: Critical Landslide hazard...`.

### Step 4: Citizen Captive Portal (Offline Experience)
1. On any smartphone, open Wi-Fi settings and select **`NE-SHIELD-EMERGENCY`**.
2. The smartphone's operating system automatically pops up the **NE-SHIELD Emergency Portal**.
3. The citizen hears the emergency chime, sees the designated evacuation safe route (*Mawphlang District Relief Center*), and fills out the distress form:
   - Name: *Bachi Debbarma (4 members)*
   - Location: *Near 7th Mile Bridge*
   - Aid: *Drinking Water & Ration Packets*
   - Condition: *Injured*
4. Citizen clicks **"Broadcast Distress Signal"**.
5. The distress request is safely logged into the ESP32's flash memory.

### Step 5: Officer Console & Cloud Sync
1. Field officers connected to the beacon can navigate to `http://192.168.4.1/admin`.
2. View all logged citizen SOS reports with exact timestamps and requirements.
3. Click **"Sync Reports to Cloud"** to automatically transmit stored triage requests to the NE-SHIELD central database.
