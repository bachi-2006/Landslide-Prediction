"""
Incidents API Router
Handles user-submitted incident reports and photo uploads.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Dict, Any
from backend.db.supabase_client import supabase
import uuid

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

@router.get("/")
async def get_incidents():
    """Returns all submitted incidents."""
    try:
        # Return both verified and unverified for the demo map
        response = supabase.table("incidents").select("*").order("created_at", desc=True).execute()
        return {"success": True, "data": response.data, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.post("/")
async def create_incident(
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    submitted_by: str = Form(...),
    photo: UploadFile = File(...)
):
    """
    Creates a new incident report and uploads the photo to Supabase Storage.
    """
    try:
        # 1. Upload Photo to Supabase Storage
        file_ext = photo.filename.split(".")[-1]
        file_path = f"incidents/{uuid.uuid4()}.{file_ext}"

        # Read file content
        content = await photo.read()

        # Upload to 'incidents' bucket
        # Note: Ensure 'incidents' bucket is created and public in Supabase
        supabase.storage.from_("incidents").upload(path=file_path, file=content, options={"content-type": f"image/{file_ext}"})

        # Get public URL
        photo_url = supabase.storage.from_("incidents").get_public_url(file_path)

        # 2. Insert into Database
        payload = {
            "submitted_by": submitted_by,
            "description": description,
            "latitude": latitude,
            "longitude": longitude,
            "photo_url": photo_url
        }

        response = supabase.table("incidents").insert(payload).execute()

        return {"success": True, "data": response.data[0], "error": None}

    except Exception as e:
        logger.error(f"Incident creation failed: {e}")
        return {"success": False, "data": None, "error": str(e)}

import logging
logger = logging.getLogger(__name__)
