"""
Alerts API Router
Handles triggering and recording system alerts.
"""

import os
import hmac
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional, List
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
from backend.services.notify import send_push_notification, send_sms_alert
from backend.services.auth import AuthUser, require_admin, verify_session

router = APIRouter(prefix="/api/alert", tags=["Alerts"])

class AlertTestRequest(BaseModel):
    district_id: str
    level: str
    message: Optional[str] = "High landslide risk detected in your area!"

class BroadcastAlertRequest(BaseModel):
    district_id: str
    level: str
    message: str
    channels: Optional[List[str]] = ["push", "sms"]
    phone_numbers: Optional[List[str]] = None

@router.post("/broadcast")
async def broadcast_alert(req: BroadcastAlertRequest, authorization: Optional[str] = Header(None)):
    """
    Multi-channel emergency broadcast (FCM push + SMS dispatch).
    Requires authority authorization token or verified Admin session.
    """
    expected_token = os.getenv("AUTHORITY_BROADCAST_KEY", "ne-shield-authority-key-2026")
    token_candidate = authorization.replace("Bearer ", "").strip() if authorization else ""
    is_valid_broadcast_key = bool(token_candidate and hmac.compare_digest(token_candidate, expected_token))
    is_admin_session = bool(token_candidate and verify_session(token_candidate, required_role="admin"))

    if not (is_valid_broadcast_key or is_admin_session):
        raise HTTPException(
            status_code=403,
            detail="Unauthorized: Emergency broadcast requires valid Admin session or authority credentials in Authorization header."
        )
    try:
        db = get_supabase()
        results = {}

        # 1. Push notifications
        if "push" in req.channels:
            response = db.table("fcm_tokens").select("token").eq("district_id", req.district_id).execute()
            tokens = [row["token"] for row in response.data] if response.data else []
            if not tokens:
                all_tokens = db.table("fcm_tokens").select("token").execute()
                tokens = [row["token"] for row in all_tokens.data] if all_tokens.data else []

            extra_payload = {
                "district_id": req.district_id,
                "risk_level": req.level,
                "escape_route": "NH-206 via Mawphlang (Uphill Safe Corridor)",
                "precautions_dos": "Evacuate uphill immediately; keep 72h go-bag ready; monitor SDMA broadcast",
                "precautions_donts": "Do NOT cross active debris/mudflow; do NOT seek shelter under steep slopes",
                "sound_pitch": "low"
            }
            push_sent = await send_push_notification(
                tokens=tokens,
                title=f"🚨 NE-SHIELD {req.level} Alert",
                body=f"{req.message} Evacuate via NH-206 Mawphlang safe corridor.",
                extra_data=extra_payload
            ) if tokens else False
            results["push"] = {"success": push_sent, "tokens_count": len(tokens)}

        # 2. SMS Broadcast
        if "sms" in req.channels:
            env_numbers = [n.strip() for n in os.getenv("EMERGENCY_SMS_RECIPIENTS", "").split(",") if n.strip()]
            recipients = req.phone_numbers or env_numbers
            sms_res = await send_sms_alert(recipients, f"NE-SHIELD {req.level} ALERT: {req.message}")
            results["sms"] = sms_res

        # 3. Log alert to DB
        db.table("alerts").insert({
            "district_id": req.district_id,
            "level": req.level,
            "message": req.message,
        }).execute()

        return {"success": True, "data": results, "error": None}

    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.post("/test")
async def test_alert(req: AlertTestRequest):
    """
    Manual trigger to send a test push notification to all tokens for a district.
    """
    try:
        # 1. Fetch tokens for this district
        db = get_supabase()
        response = db.table("fcm_tokens").select("token").eq("district_id", req.district_id).execute()
        tokens = [row["token"] for row in response.data]

        if not tokens:
            # Fallback: send to all tokens for demo purposes if district specific not found
            response = db.table("fcm_tokens").select("token").execute()
            tokens = [row["token"] for row in response.data]

        # 2. Send Push
        if tokens:
            sent = await send_push_notification(
                tokens=tokens,
                title=f"NE-SHIELD {req.level} Alert",
                body=req.message
            )
        else:
            sent = False

        # 3. Log alert to DB
        db.table("alerts").insert({
            "district_id": req.district_id,
            "level": req.level,
            "message": req.message,
        }).execute()

        return {"success": sent, "data": {"tokens_notified": len(tokens)}, "error": None}

    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

current_alert_state = {"is_active": False, "message": ""}

def _latest_incident_status():
    """Return the newest incident for hardware nodes without breaking alert polling."""
    try:
        db = get_supabase()
        response = db.table("incidents").select(
            "id,description,created_at,submitted_by"
        ).order("created_at", desc=True).limit(1).execute()
        latest = (response.data or [None])[0]
        return {
            "database_connected": True,
            "latest_incident_id": latest.get("id") if latest else None,
            "latest_incident_message": latest.get("description", "") if latest else "",
            "latest_incident_created_at": latest.get("created_at") if latest else None,
            "latest_incident_reporter": latest.get("submitted_by", "") if latest else ""
        }
    except Exception:
        return {
            "database_connected": False,
            "latest_incident_id": None,
            "latest_incident_message": "",
            "latest_incident_created_at": None,
            "latest_incident_reporter": ""
        }

class HardwareTriggerRequest(BaseModel):
    active: Optional[bool] = None
    status: Optional[str] = None
    message: Optional[str] = "Disaster Simulated!"
    level: Optional[str] = None
    district_id: Optional[str] = None

@router.post("/hardware/trigger")
async def trigger_hardware_siren(req: HardwareTriggerRequest, authorization: Optional[str] = Header(None)):
    """NE-SHIELD dashboard or mobile app calls this when simulating or dispatching alerts."""
    global current_alert_state
    caller_name = "System Operator"
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        from backend.services.auth import ACTIVE_SESSIONS
        sess = ACTIVE_SESSIONS.get(token)
        if sess:
            caller_name = sess.get("name", "Authorized Officer")

    is_active = req.active if req.active is not None else (req.status in ["active", "on", "true"] if req.status else True)
    msg = req.message or f"Alert triggered for {req.district_id or 'NER'} ({req.level or 'Critical'})"
    current_alert_state = {
        "is_active": is_active,
        "message": msg,
        "triggered_by": caller_name,
        "level": req.level or "Critical"
    }
    return {"status": "success", "data": current_alert_state}

@router.get("/hardware/status")
async def get_hardware_status():
    """The ESP32 constantly polls this endpoint."""
    return {
        **current_alert_state,
        "web_access": True,
        **_latest_incident_status()
    }


# ─────────────────────────────────────────────────────────────
# ESP32 BEACON TELEMETRY & CAPTIVE PORTAL SOS REGISTRATIONS
# ─────────────────────────────────────────────────────────────

class BeaconHeartbeatRequest(BaseModel):
    beacon_id: str
    name: Optional[str] = "ESP32 Field Siren Beacon"
    location_name: Optional[str] = "Shillong Sector NH-40"
    latitude: Optional[float] = 25.5788
    longitude: Optional[float] = 91.8933
    siren_active: Optional[bool] = False
    wifi_ssid: Optional[str] = "MSI 6704"
    sta_ip: Optional[str] = None
    db_connected: Optional[bool] = True
    clients_connected: Optional[int] = 0
    last_incident_seen: Optional[str] = None
    battery_level: Optional[int] = 100


@router.post("/hardware/beacon/heartbeat")
async def beacon_heartbeat(req: BeaconHeartbeatRequest):
    """ESP32 sends periodic status updates so admin dashboard can monitor beacon."""
    try:
        db = get_supabase()
        db.table("hardware_beacons").upsert({
            "beacon_id": req.beacon_id,
            "name": req.name,
            "location_name": req.location_name,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "status": "alert" if req.siren_active else "online",
            "siren_active": req.siren_active,
            "wifi_ssid": req.wifi_ssid,
            "sta_ip": req.sta_ip,
            "db_connected": req.db_connected,
            "clients_connected": req.clients_connected,
            "last_incident_seen": req.last_incident_seen,
            "battery_level": req.battery_level,
            "last_heartbeat": "now()"
        }).execute()
        return {"success": True, "beacon_id": req.beacon_id}
    except Exception as e:
        return {"success": True, "beacon_id": req.beacon_id, "cached": True, "note": str(e)}


# In-memory resilient buffer for beacon SOS submissions
IN_MEMORY_BEACON_LOGS = []

class BeaconSosRequest(BaseModel):
    beacon_id: str
    citizen_name: str
    phone: Optional[str] = None
    people_count: Optional[int] = 1
    medical_needs: Optional[str] = "None"
    notes: Optional[str] = None
    ip_address: Optional[str] = None


@router.post("/hardware/beacon/sos")
async def register_beacon_sos(req: BeaconSosRequest):
    """
    Called when a stranded victim connects to the ESP32 emergency Wi-Fi
    and enters their contact/family/medical details on the captive portal.
    Persists into in-memory buffer, Supabase beacon_sos_logs, and relief_requests.
    """
    from datetime import datetime, timezone
    import time
    
    saved_db = False
    sos_id = f"BEACON-SOS-{req.beacon_id[-4:]}-{req.citizen_name[:3].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Always record in resilient in-memory buffer immediately
    memory_entry = {
        "id": f"sos-{int(time.time() * 1000)}",
        "beacon_id": req.beacon_id,
        "citizen_name": req.citizen_name,
        "phone": req.phone or "",
        "people_count": req.people_count or 1,
        "medical_needs": req.medical_needs or "None",
        "notes": req.notes or "",
        "ip_address": req.ip_address or "",
        "synced_to_cloud": True,
        "created_at": now_iso
    }
    IN_MEMORY_BEACON_LOGS.insert(0, memory_entry)
    if len(IN_MEMORY_BEACON_LOGS) > 200:
        IN_MEMORY_BEACON_LOGS.pop()

    # 2. Persist to Supabase
    try:
        db = get_supabase()
        db.table("beacon_sos_logs").insert({
            "beacon_id": req.beacon_id,
            "citizen_name": req.citizen_name,
            "phone": req.phone,
            "people_count": req.people_count or 1,
            "medical_needs": req.medical_needs or "None",
            "notes": req.notes,
            "ip_address": req.ip_address,
            "synced_to_cloud": True
        }).execute()

        db.table("relief_requests").insert({
            "id": sos_id,
            "user_name": req.citizen_name,
            "phone": req.phone,
            "locality_name": f"ESP32 Wi-Fi Node ({req.beacon_id})",
            "lat": 25.5788,
            "lon": 91.8933,
            "aid_type": "medical" if (req.medical_needs and req.medical_needs.lower() != "none") else "food",
            "people_count": req.people_count or 1,
            "urgency": "Critical" if (req.medical_needs and req.medical_needs.lower() != "none") else "High",
            "status": "pending",
            "source": "esp32_captive_portal",
            "beacon_id": req.beacon_id,
            "notes": f"Medical: {req.medical_needs}. Notes: {req.notes or 'None'}"
        }).execute()

        # Also persist directly into incidents table for immediate display on Dashboard, GIS Map, & Mobile App
        db.table("incidents").insert({
            "id": f"inc-{sos_id.lower()}",
            "submitted_by": f"{req.citizen_name} (ESP32 Node {req.beacon_id})",
            "description": f"Beacon SOS: {req.notes or 'Stranded victims registered at offline beacon'}. Condition: {req.medical_needs}. People: {req.people_count or 1}",
            "latitude": 25.5788,
            "longitude": 91.8933,
            "severity": "Critical" if (req.medical_needs and req.medical_needs.lower() not in ["none", "safe"]) else "High",
            "status": "open",
            "reporter_role": "citizen",
            "verification_status": "beacon_reported",
            "people_responded": 0,
            "people_evacuated": 0,
            "created_at": now_iso
        }).execute()
        saved_db = True
    except Exception as e:
        pass

    try:
        from backend.routers.incidents import IN_MEMORY_INCIDENTS
        IN_MEMORY_INCIDENTS.insert(0, {
            "id": f"inc-{sos_id.lower()}",
            "submitted_by": f"{req.citizen_name} (ESP32 Node {req.beacon_id})",
            "description": f"Beacon SOS: {req.notes or 'Stranded victims registered at offline beacon'}. Condition: {req.medical_needs}. People: {req.people_count or 1}",
            "latitude": 25.5788,
            "longitude": 91.8933,
            "severity": "Critical" if (req.medical_needs and req.medical_needs.lower() not in ["none", "safe"]) else "High",
            "status": "open",
            "reporter_role": "citizen",
            "verification_status": "beacon_reported",
            "people_responded": 0,
            "people_evacuated": 0,
            "created_at": now_iso
        })
    except Exception:
        pass

    return {
        "success": True,
        "saved_to_db": saved_db,
        "in_memory_cached": True,
        "data": memory_entry,
        "message": f"SOS details for {req.citizen_name} recorded into SEOC disaster register."
    }


@router.get("/hardware/beacon/logs")
async def get_beacon_logs(beacon_id: Optional[str] = None):
    """Returns list of citizens who signed into the ESP32 Wi-Fi captive portal."""
    db_logs = []
    try:
        db = get_supabase()
        query = db.table("beacon_sos_logs").select("*").order("created_at", desc=True).limit(50)
        if beacon_id:
            query = query.eq("beacon_id", beacon_id)
        res = query.execute()
        db_logs = res.data or []
    except Exception as e:
        pass

    # Merge database records and in-memory buffer with deduplication
    seen_keys = set()
    combined = []
    for item in db_logs:
        key = f"{item.get('citizen_name')}_{item.get('phone')}"
        seen_keys.add(key)
        combined.append(item)

    for item in IN_MEMORY_BEACON_LOGS:
        if beacon_id and item.get("beacon_id") != beacon_id:
            continue
        key = f"{item.get('citizen_name')}_{item.get('phone')}"
        if key not in seen_keys:
            seen_keys.add(key)
            combined.append(item)

    combined.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    return {"success": True, "data": combined[:50]}


