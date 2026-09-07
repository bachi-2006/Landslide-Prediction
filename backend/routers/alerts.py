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
    return current_alert_state
