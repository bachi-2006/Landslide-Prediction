"""
Incidents API Router
Handles user-submitted incident reports, field officer responses, and resolution.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Header
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
from backend.services.auth import require_officer, require_admin, verify_session, _extract_token
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
    submitted_by: str = Form("Citizen (Field Report)"),
    reporter_role: str = Form("citizen"),
    severity: str = Form("Moderate"),
    photo: UploadFile | None = File(None),
    authorization: Optional[str] = Header(None)
):
    """Submit a new incident report. Enforces server-verified officer credentials."""
    # Input validation
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=400, detail="Invalid GPS coordinates.")
    if len(description.strip()) < 3:
        raise HTTPException(status_code=400, detail="Description must be at least 3 characters.")

    # Secure role determination: client cannot self-claim officer status without a valid session token
    token = _extract_token(authorization)
    session = verify_session(token, required_role="officer") if token else None
    is_verified_officer = bool(session and session.get("role") in ["field_officer", "officer", "admin"])

    actual_role = "admin" if (is_verified_officer and session and session.get("role") == "admin") else ("field_officer" if is_verified_officer else "citizen")
    verification_status = "verified" if is_verified_officer else "community_reported"
    verified_assignee = session.get("name", submitted_by) if is_verified_officer else None

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
        "reporter_role": actual_role,
        "verification_status": verification_status,
        "severity": severity,
        "status": "in_progress" if is_verified_officer else "open",
        "assigned_officer": verified_assignee,
        "people_responded": 1 if is_verified_officer else 0,
        "people_evacuated": 0,
        "description": description,
        "latitude": latitude,
        "longitude": longitude,
        "photo_url": photo_url,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    # PRIMARY: Write to Supabase using columns present in schema
    saved = False
    db_error = None
    try:
        db_payload = {
            "id": new_record["id"],
            "submitted_by": submitted_by,
            "description": description,
            "latitude": latitude,
            "longitude": longitude,
            "photo_url": photo_url,
            "verified": is_verified_officer,
            "created_at": new_record["created_at"]
        }
        resp = get_supabase().table("incidents").insert(db_payload).execute()
        if resp.data:
            saved = True
            logger.info(f"Incident {new_record['id']} persisted to Supabase.")
    except Exception as db_err:
        db_error = str(db_err)
        logger.warning(f"Supabase write failed — using in-memory fallback: {db_err}")

    # FALLBACK: cache in memory if DB was unavailable
    if not saved:
        IN_MEMORY_INCIDENTS.insert(0, new_record)

    new_record["db_persisted"] = saved
    return {
        "success": True,
        "db_persisted": saved,
        "data": new_record,
        "warning": None if saved else "Incident queued in fallback memory; not yet committed to central database.",
        "error": db_error
    }


class AssignOfficerRequest(BaseModel):
    officer_name: str
    officer_unit: Optional[str] = "SDRF Rapid Response"
    dispatched_personnel: Optional[int] = 4


@router.post("/{incident_id}/assign")
async def assign_incident(
    incident_id: str,
    req: AssignOfficerRequest,
    caller = Depends(require_admin)  # Admin only
):
    """Admin assigns a field officer to an incident. Writes to Supabase."""
    admin_callsign = getattr(caller, 'name', 'SEOC Admin')
    update_data = {
        "assigned_officer": f"{req.officer_name} ({req.officer_unit})",
        "assigned_by": admin_callsign,
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
    caller = Depends(require_officer)  # Field Officer or Admin
):
    """Field officer closes an issue and confirms ground clearance. Writes to Supabase."""
    verified_name = getattr(caller, 'name', req.officer_name)
    verified_role = getattr(caller, 'role', 'field_officer')
    resolve_data = {
        "status": "resolved",
        "resolved_by": req.officer_name,
        "resolved_by_account": verified_name,
        "resolved_role": verified_role,
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


# ─────────────────────────────────────────────────────────────
# ADMIN: Delete Incident
# ─────────────────────────────────────────────────────────────

@router.delete("/{incident_id}")
async def delete_incident(
    incident_id: str,
    caller=Depends(require_admin),
):
    """Admin only: permanently delete a false / duplicate / test incident."""
    deleted_from_db = False
    try:
        get_supabase().table("incidents").delete().eq("id", incident_id).execute()
        deleted_from_db = True
        logger.info(f"Admin {caller.name} deleted incident {incident_id} from Supabase.")
    except Exception as db_err:
        logger.warning(f"Supabase delete failed: {db_err}")

    # Remove from in-memory fallback too
    global IN_MEMORY_INCIDENTS
    before = len(IN_MEMORY_INCIDENTS)
    IN_MEMORY_INCIDENTS = [i for i in IN_MEMORY_INCIDENTS if i.get("id") != incident_id]
    deleted_from_memory = len(IN_MEMORY_INCIDENTS) < before

    if not deleted_from_db and not deleted_from_memory:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found.")

    return {
        "success": True,
        "deleted_id": incident_id,
        "deleted_by": caller.name,
        "db_deleted": deleted_from_db,
    }


# ─────────────────────────────────────────────────────────────
# ADMIN: Force-Create a Verified Incident
# ─────────────────────────────────────────────────────────────

class AdminIncidentRequest(BaseModel):
    description: str
    latitude: float
    longitude: float
    severity: Optional[str] = "High"
    assigned_officer: Optional[str] = None
    officer_unit: Optional[str] = None
    dispatched_personnel: Optional[int] = 4
    notes: Optional[str] = None


@router.post("/admin/create")
async def admin_create_incident(
    req: AdminIncidentRequest,
    caller=Depends(require_admin),
):
    """
    Admin creates a pre-verified incident directly from HQ.
    Status is 'in_progress' if officer assigned, else 'open'. Marked verified=True.
    """
    admin_name = getattr(caller, "name", "SEOC Admin")
    new_record = {
        "id": str(uuid.uuid4()),
        "submitted_by": f"HQ Admin: {admin_name}",
        "reporter_role": "admin",
        "verification_status": "admin_verified",
        "severity": req.severity or "High",
        "status": "in_progress" if req.assigned_officer else "open",
        "assigned_officer": f"{req.assigned_officer} ({req.officer_unit})" if req.assigned_officer and req.officer_unit else req.assigned_officer,
        "assigned_by": admin_name,
        "officer_unit": req.officer_unit,
        "dispatched_personnel": req.dispatched_personnel or 4,
        "people_responded": req.dispatched_personnel or 0,
        "people_evacuated": 0,
        "description": req.description,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "photo_url": None,
        "resolution_notes": req.notes,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    saved = False
    try:
        db_payload = {
            "id": new_record["id"],
            "submitted_by": new_record["submitted_by"],
            "description": new_record["description"],
            "latitude": new_record["latitude"],
            "longitude": new_record["longitude"],
            "photo_url": None,
            "verified": True,
            "status": new_record["status"],
            "reporter_role": "admin",
            "verification_status": "admin_verified",
            "severity": new_record["severity"],
            "assigned_officer": new_record["assigned_officer"],
            "assigned_by": admin_name,
            "officer_unit": req.officer_unit,
            "dispatched_personnel": req.dispatched_personnel,
            "people_responded": new_record["people_responded"],
            "people_evacuated": 0,
            "created_at": new_record["created_at"],
        }
        resp = get_supabase().table("incidents").insert(db_payload).execute()
        if resp.data:
            saved = True
            logger.info(f"Admin {admin_name} created incident {new_record['id']} in Supabase.")
    except Exception as db_err:
        logger.warning(f"Supabase admin-create failed — using in-memory: {db_err}")

    if not saved:
        IN_MEMORY_INCIDENTS.insert(0, new_record)

    new_record["db_persisted"] = saved
    return {
        "success": True,
        "db_persisted": saved,
        "data": new_record,
        "created_by": admin_name,
    }
