"""
Alerts API Router
Handles triggering and recording system alerts.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.db.supabase_client import supabase
from backend.services.notify import send_push_notification

router = APIRouter(prefix="/api/alert", tags=["Alerts"])

class AlertTestRequest(BaseModel):
    district_id: str
    level: str
    message: Optional[str] = "High landslide risk detected in your area!"

@router.post("/test")
async def test_alert(req: AlertTestRequest):
    """
    Manual trigger to send a test push notification to all tokens for a district.
    """
    try:
        # 1. Fetch tokens for this district
        response = supabase.table("fcm_tokens").select("token").eq("district_id", req.district_id).execute()
        tokens = [row["token"] for row in response.data]

        if not tokens:
            # Fallback: send to all tokens for demo purposes if district specific not found
            response = supabase.table("fcm_tokens").select("token").execute()
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
        supabase.table("alerts").insert({
            "district_id": req.district_id,
            "level": req.level,
            "message": req.message,
        }).execute()

        return {"success": sent, "data": {"tokens_notified": len(tokens)}, "error": None}

    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
