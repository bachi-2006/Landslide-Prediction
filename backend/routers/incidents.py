"""
Incidents API Router
Handles user-submitted incident reports, field officer responses, and resolution.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
from backend.services.auth import require_officer, require_admin
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

from datetime import datetime

# Seed data for when Supabase is unavailable (read-only fallback)
IN_MEMORY_INCIDENTS = [
    {
        "id": "inc-officer-1",
        "submitted_by": "Inspector H. Lyngdoh (SDRF Patrol Alpha)",
        "reporter_role": "field_officer",
        "verification_status": "verified",
        "severity": "Critical",
        "status": "in_progress",
        "assigned_officer": "Inspector H. Lyngdoh (SDRF Patrol Alpha)",
        "people_responded": 3,
        "people_evacuated": 1,
        "description": "FIELD VERIFIED: Severe tension cracks (width 12cm) developing along NH-40 cutting slope. Saturated talus shifting towards highway.",
        "latitude": 25.5890,
        "longitude": 91.8980,
        "photo_url": None,
        "created_at": "2026-09-07T05:30:00Z"
    },
    {
        "id": "inc-citizen-1",
        "submitted_by": "Citizen: Rajesh Roy",
        "reporter_role": "citizen",
        "verification_status": "community_reported",
        "severity": "Moderate",
        "status": "open",
        "assigned_officer": None,
        "people_responded": 1,
        "people_evacuated": 0,
        "description": "Small rockfall observed near roadside culvert after heavy morning showers. Mud overflow on outer shoulder.",
        "latitude": 25.6120,
        "longitude": 91.8740,
        "photo_url": None,
        "created_at": "2026-09-07T05:45:00Z"
    }
]

@router.get("")
@router.get("/")
async def get_incidents():
    """Returns all submitted incidents from Supabase, merged with seed fallback."""
    try:
        response = get_supabase().table("incidents").select("*").order("created_at", desc=True).execute()
        supabase_ids = {r["id"] for r in (response.data or []) if "id" in r}
        merged = []
        for r in (response.data or []):
            item = dict(r)
            if not item.get("reporter_role"):
                s_by = (item.get("submitted_by") or "").lower()
                if any(k in s_by for k in ["officer", "patrol", "sdrf", "inspector"]):
                    item["reporter_role"] = "field_officer"
                    item["verification_status"] = "verified"
                else:
                    item["reporter_role"] = "citizen"
                    item["verification_status"] = "community_reported"
            merged.append(item)
        # Append in-memory seeds not yet in DB
        for inc in IN_MEMORY_INCIDENTS:
            if inc["id"] not in supabase_ids:
                merged.append(inc)
        return {"success": True, "data": merged, "error": None}
    except Exception as e:
        logger.info(f"Supabase offline, returning seed incidents: {e}")
        return {"success": True, "data": IN_MEMORY_INCIDENTS, "error": None}


@router.post("")
@router.post("/")
async def create_incident(
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    submitted_by: str = Form(...),
    reporter_role: str = Form("citizen"),
    severity: str = Form("Moderate"),
    photo: UploadFile | None = File(None)
):
    """Submit a new incident report. Writes to Supabase first; falls back to memory."""
    # Input validation
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates.")
    if len(description.strip()) < 3:
        raise HTTPException(status_code=400, detail="Description must be at least 3 characters.")

    is_officer = reporter_role.lower() in ["field_officer", "officer", "inspector", "sdrf"]
    verification_status = "verified" if is_officer else "community_reported"

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
                    logger.warning(f"Photo upload skipped: {upload_err}")

    new_record = {
        "id": str(uuid.uuid4()),
        "submitted_by": submitted_by,
        "reporter_role": "field_officer" if is_officer else "citizen",
        "verification_status": verification_status,
        "severity": severity,
        "status": "in_progress" if is_officer else "open",
        "assigned_officer": submitted_by if is_officer else None,
        "people_responded": 1 if is_officer else 0,
        "people_evacuated": 0,
        "description": description,
        "latitude": latitude,
        "longitude": longitude,
        "photo_url": photo_url,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    # PRIMARY: Write to Supabase first
    saved = False
    try:
        resp = get_supabase().table("incidents").insert(new_record).execute()
        if resp.data:
            new_record = resp.data[0]  # use DB-assigned values
            saved = True
            logger.info(f"Incident {new_record['id']} persisted to Supabase.")
    except Exception as db_err:
        logger.warning(f"Supabase write failed — using in-memory fallback: {db_err}")

    # FALLBACK: cache in memory if DB was unavailable
    if not saved:
        IN_MEMORY_INCIDENTS.insert(0, new_record)

    return {"success": True, "data": new_record, "error": None}


class AssignOfficerRequest(BaseModel):
    officer_name: str
    officer_unit: Optional[str] = "SDRF Rapid Response"
    dispatched_personnel: Optional[int] = 4


@router.post("/{incident_id}/assign")
async def assign_incident(
    incident_id: str,
    req: AssignOfficerRequest,
    _: str = Depends(require_admin)  # Admin only
):
    """Admin assigns a field officer to an incident. Writes to Supabase."""
    update_data = {
        "assigned_officer": f"{req.officer_name} ({req.officer_unit})",
        "status": "assigned",
        "dispatched_personnel": req.dispatched_personnel,
        "assigned_at": datetime.utcnow().isoformat() + "Z"
    }
    # PRIMARY: update in Supabase
    try:
        resp = get_supabase().table("incidents") \
            .update(update_data).eq("id", incident_id).execute()
        if resp.data:
            return {"success": True, "data": resp.data[0], "error": None}
    except Exception as db_err:
        logger.warning(f"Supabase assign update failed: {db_err}")

    # FALLBACK: update in memory
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc.update(update_data)
            return {"success": True, "data": inc, "error": None}

    # Create placeholder if not found (handles legacy IDs)
    placeholder = {"id": incident_id, **update_data}
    IN_MEMORY_INCIDENTS.insert(0, placeholder)
    return {"success": True, "data": placeholder, "error": None}


class RespondIncidentRequest(BaseModel):
    response_type: str = "safe"  # "safe" | "evacuated" | "needs_help"
    citizen_name: Optional[str] = "Community Resident"


@router.post("/{incident_id}/respond")
async def register_community_response(incident_id: str, req: RespondIncidentRequest):
    """Citizen or Field Officer registers a safety check-in for an active incident."""
    delta = {"people_responded": 1}
    if req.response_type == "evacuated":
        delta["people_evacuated"] = 1

    # Try Supabase RPC-style increment
    try:
        db = get_supabase()
        current = db.table("incidents").select("people_responded,people_evacuated") \
            .eq("id", incident_id).execute()
        if current.data:
            row = current.data[0]
            new_responded = (row.get("people_responded") or 0) + 1
            new_evacuated = (row.get("people_evacuated") or 0) + (1 if req.response_type == "evacuated" else 0)
            resp = db.table("incidents").update({
                "people_responded": new_responded,
                "people_evacuated": new_evacuated
            }).eq("id", incident_id).execute()
            if resp.data:
                return {"success": True, "data": resp.data[0], "error": None}
    except Exception as db_err:
        logger.warning(f"Supabase respond update failed: {db_err}")

    # Memory fallback
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc["people_responded"] = inc.get("people_responded", 0) + 1
            if req.response_type == "evacuated":
                inc["people_evacuated"] = inc.get("people_evacuated", 0) + 1
            return {"success": True, "data": inc, "error": None}

    updated = {"id": incident_id, "people_responded": 1,
               "people_evacuated": 1 if req.response_type == "evacuated" else 0}
    IN_MEMORY_INCIDENTS.append(updated)
    return {"success": True, "data": updated, "error": None}


class ResolveIncidentRequest(BaseModel):
    officer_name: str
    resolution_summary: str
    road_cleared: bool = True


@router.post("/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    req: ResolveIncidentRequest,
    _: str = Depends(require_officer)  # Field Officer or Admin
):
    """Field officer closes an issue and confirms ground clearance. Writes to Supabase."""
    resolve_data = {
        "status": "resolved",
        "resolved_by": req.officer_name,
        "resolution_summary": req.resolution_summary,
        "road_cleared": req.road_cleared,
        "resolved_at": datetime.utcnow().isoformat() + "Z"
    }
    # PRIMARY: Supabase
    try:
        resp = get_supabase().table("incidents") \
            .update(resolve_data).eq("id", incident_id).execute()
        if resp.data:
            return {"success": True, "data": resp.data[0], "error": None}
    except Exception as db_err:
        logger.warning(f"Supabase resolve update failed: {db_err}")

    # FALLBACK: memory
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc.update(resolve_data)
            return {"success": True, "data": inc, "error": None}

    placeholder = {"id": incident_id, **resolve_data}
    IN_MEMORY_INCIDENTS.append(placeholder)
    return {"success": True, "data": placeholder, "error": None}


@router.get("")
@router.get("/")
async def get_incidents():
    """Returns all submitted incidents."""
    try:
        response = get_supabase().table("incidents").select("*").order("created_at", desc=True).execute()
        # Merge Supabase records with any locally submitted ones
        supabase_ids = {r["id"] for r in (response.data or []) if "id" in r}
        merged = []
        for r in (response.data or []):
            item = dict(r)
            if not item.get("reporter_role"):
                s_by = (item.get("submitted_by") or "").lower()
                if "officer" in s_by or "patrol" in s_by or "sdrf" in s_by or "inspector" in s_by:
                    item["reporter_role"] = "field_officer"
                    item["verification_status"] = "verified"
                else:
                    item["reporter_role"] = "citizen"
                    item["verification_status"] = "community_reported"
            merged.append(item)

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
    reporter_role: str = Form("citizen"),
    severity: str = Form("Moderate"),
    photo: UploadFile | None = File(None)
):
    # Input bounds validation for geospatial coordinates
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates. Latitude must be [-90, 90] and Longitude [-180, 180].")

    if len(description.strip()) < 3:
        raise HTTPException(status_code=400, detail="Incident description must be at least 3 characters long.")

    # Role validation and verification flag
    is_officer = reporter_role.lower() in ["field_officer", "officer", "inspector", "sdrf"]
    verification_status = "verified" if is_officer else "community_reported"

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
        "reporter_role": "field_officer" if is_officer else "citizen",
        "verification_status": verification_status,
        "severity": severity,
        "status": "in_progress" if is_officer else "open",
        "assigned_officer": submitted_by if is_officer else None,
        "people_responded": 1 if is_officer else 0,
        "people_evacuated": 0,
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

class AssignOfficerRequest(BaseModel):
    officer_name: str
    officer_unit: Optional[str] = "SDRF Rapid Response"
    dispatched_personnel: Optional[int] = 4

@router.post("/{incident_id}/assign")
async def assign_incident(incident_id: str, req: AssignOfficerRequest):
    """Admin assigns field officer to an incident."""
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc["assigned_officer"] = f"{req.officer_name} ({req.officer_unit})"
            inc["status"] = "assigned"
            inc["dispatched_personnel"] = req.dispatched_personnel
            inc["assigned_at"] = datetime.utcnow().isoformat() + "Z"
            return {"success": True, "data": inc, "error": None}

    # Create / update in memory if legacy ID
    updated = {
        "id": incident_id,
        "assigned_officer": f"{req.officer_name} ({req.officer_unit})",
        "status": "assigned",
        "dispatched_personnel": req.dispatched_personnel,
        "assigned_at": datetime.utcnow().isoformat() + "Z"
    }
    IN_MEMORY_INCIDENTS.insert(0, updated)
    return {"success": True, "data": updated, "error": None}

class RespondIncidentRequest(BaseModel):
    response_type: str = "safe" # "safe" | "evacuated" | "needs_help"
    citizen_name: Optional[str] = "Community Resident"

@router.post("/{incident_id}/respond")
async def register_community_response(incident_id: str, req: RespondIncidentRequest):
    """
    Citizen or Field Officer registers response to an active incident
    ('I Am Safe', 'Evacuated to Shelter', 'Assistance Needed').
    """
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc["people_responded"] = inc.get("people_responded", 0) + 1
            if req.response_type == "evacuated":
                inc["people_evacuated"] = inc.get("people_evacuated", 0) + 1
            return {"success": True, "data": inc, "error": None}

    # If legacy record not in memory
    updated = {
        "id": incident_id,
        "people_responded": 1,
        "people_evacuated": 1 if req.response_type == "evacuated" else 0
    }
    IN_MEMORY_INCIDENTS.append(updated)
    return {"success": True, "data": updated, "error": None}

class ResolveIncidentRequest(BaseModel):
    officer_name: str
    resolution_summary: str
    road_cleared: bool = True

@router.post("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, req: ResolveIncidentRequest):
    """Field officer closes an issue and confirms ground clearance."""
    for inc in IN_MEMORY_INCIDENTS:
        if inc["id"] == incident_id:
            inc["status"] = "resolved"
            inc["resolved_by"] = req.officer_name
            inc["resolution_summary"] = req.resolution_summary
            inc["road_cleared"] = req.road_cleared
            inc["resolved_at"] = datetime.utcnow().isoformat() + "Z"
            return {"success": True, "data": inc, "error": None}

    updated = {
        "id": incident_id,
        "status": "resolved",
        "resolved_by": req.officer_name,
        "resolution_summary": req.resolution_summary,
        "road_cleared": req.road_cleared,
        "resolved_at": datetime.utcnow().isoformat() + "Z"
    }
    IN_MEMORY_INCIDENTS.append(updated)
    return {"success": True, "data": updated, "error": None}
