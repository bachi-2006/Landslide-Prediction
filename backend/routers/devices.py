import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase

router = APIRouter(prefix="/api/devices", tags=["Devices"])


class DeviceTokenRequest(BaseModel):
    token: str
    district_id: str | None = None


@router.post("/token")
async def register_device_token(req: DeviceTokenRequest):
    try:
        response = await asyncio.to_thread(
            lambda: get_supabase().table("fcm_tokens").upsert(
                {"token": req.token, "district_id": req.district_id},
                on_conflict="token",
            ).execute()
        )
        return {"success": True, "data": response.data, "error": None}
    except SupabaseNotConfiguredError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except Exception as error:
        return {"success": False, "data": None, "error": str(error)}