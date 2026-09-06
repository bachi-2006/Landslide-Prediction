"""
Incidents API Router
Handles user-submitted incident reports and photo uploads.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Dict, Any
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

@router.get("")
@router.get("/")
async def get_incidents():
    """Returns all submitted incidents."""
    try:
        # Return both verified and unverified for the demo map
        response = get_supabase().table("incidents").select("*").order("created_at", desc=True).execute()
        return {"success": True, "data": response.data, "error": None}
    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.post("")
@router.post("/")
async def create_incident(
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    submitted_by: str = Form(...),
    photo: UploadFile | None = File(None)
):
    # Input bounds validation for geospatial coordinates
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates. Latitude must be [-90, 90] and Longitude [-180, 180].")

    if len(description.strip()) < 3:
        raise HTTPException(status_code=400, detail="Incident description must be at least 3 characters long.")

    try:
        # 1. Upload Photo to Supabase Storage
        photo_url = None
        if photo:
            file_ext = (photo.filename or "image.jpg").split(".")[-1].lower()
            if file_ext not in ["jpg", "jpeg", "png", "webp"]:
                raise HTTPException(status_code=400, detail="Unsupported photo format. Allowed formats: JPG, PNG, WEBP.")
            file_path = f"incidents/{uuid.uuid4()}.{file_ext}"
            content = await photo.read()
            db = get_supabase()
            db.storage.from_("incidents").upload(
                path=file_path,
                file=content,
                options={"content-type": photo.content_type or "image/jpeg"},
            )
            photo_url = db.storage.from_("incidents").get_public_url(file_path)

        # 2. Insert into Database
        payload = {
            "submitted_by": submitted_by,
            "description": description,
            "latitude": latitude,
            "longitude": longitude,
            "photo_url": photo_url
        }

        response = get_supabase().table("incidents").insert(payload).execute()

        return {"success": True, "data": response.data[0], "error": None}

    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Incident creation failed: {e}")
        return {"success": False, "data": None, "error": str(e)}
