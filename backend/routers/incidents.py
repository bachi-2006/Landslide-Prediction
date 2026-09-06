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

from datetime import datetime

IN_MEMORY_INCIDENTS = [
    {
        "id": "inc-demo-1",
        "submitted_by": "Mawlai Field Patrol",
        "description": "Rockfall: Tension cracks developing along NH-40 cutting slope",
        "latitude": 25.5890,
        "longitude": 91.8980,
        "photo_url": None,
        "created_at": "2026-09-06T12:00:00Z"
    }
]

@router.get("")
@router.get("/")
async def get_incidents():
    """Returns all submitted incidents."""
    try:
        response = get_supabase().table("incidents").select("*").order("created_at", desc=True).execute()
        # Merge Supabase records with any locally submitted ones
        supabase_ids = {r["id"] for r in (response.data or []) if "id" in r}
        merged = list(response.data or [])
        for inc in IN_MEMORY_INCIDENTS:
            if inc["id"] not in supabase_ids:
                merged.append(inc)
        return {"success": True, "data": merged, "error": None}
    except Exception as e:
        logger.info(f"Supabase offline, returning in-memory incidents: {e}")
        return {"success": True, "data": IN_MEMORY_INCIDENTS, "error": None}

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

    photo_url = None
    if photo:
        file_ext = (photo.filename or "image.jpg").split(".")[-1].lower()
        if file_ext in ["jpg", "jpeg", "png", "webp"]:
            content = await photo.read()
            if len(content) <= 5 * 1024 * 1024:
                try:
                    file_path = f"incidents/{uuid.uuid4()}.{file_ext}"
                    db = get_supabase()
                    db.storage.from_("incidents").upload(
                        path=file_path,
                        file=content,
                        options={"content-type": photo.content_type or "image/jpeg"},
                    )
                    photo_url = db.storage.from_("incidents").get_public_url(file_path)
                except Exception as upload_err:
                    logger.warning(f"Photo upload to Supabase storage skipped: {upload_err}")

    new_record = {
        "id": str(uuid.uuid4()),
        "submitted_by": submitted_by,
        "description": description,
        "latitude": latitude,
        "longitude": longitude,
        "photo_url": photo_url,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    # Store in memory immediately so desktop sees it instantly
    IN_MEMORY_INCIDENTS.insert(0, new_record)

    # Also persist to Supabase if configured
    try:
        get_supabase().table("incidents").insert(new_record).execute()
    except Exception as db_err:
        logger.info(f"Supabase DB insert skipped: {db_err}")

    return {"success": True, "data": new_record, "error": None}
