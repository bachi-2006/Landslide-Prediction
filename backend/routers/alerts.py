"""
Alerts API Router
Handles triggering and recording system alerts.
"""

import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
from backend.services.notify import send_push_notification, send_sms_alert

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
    Requires authority authorization token if configured in production.
    """
    expected_token = os.getenv("AUTHORITY_BROADCAST_KEY")
    if expected_token and expected_token != "your_broadcast_key":
        if not authorization or authorization.replace("Bearer ", "").strip() != expected_token:
            raise HTTPException(status_code=403, detail="Unauthorized: Emergency broadcast requires valid authority credentials.")
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

            push_sent = await send_push_notification(
                tokens=tokens,
                title=f"NE-SHIELD {req.level} Alert",
                body=req.message
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
