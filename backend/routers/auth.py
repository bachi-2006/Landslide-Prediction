"""
Authentication & RBAC Router for NE-SHIELD
Provides authentication with dedicated passwords:
- Field Officer password: 9
- Admin password: 99
- Citizen: No password required; registers user name, phone (ICE), and district into database.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import uuid
import logging
from datetime import datetime, timezone

from backend.db.supabase_client import get_supabase
from backend.services.auth import ADMIN_KEY, OFFICER_KEY, create_session

logger = logging.getLogger("auth_router")

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])

# In-memory users store as fallback if Supabase users table is not yet created
IN_MEMORY_USERS = [
    {
        "id": "usr-01",
        "name": "Rohith (Resident)",
        "phone": "+91 98765 43210",
        "district": "East Khasi Hills",
        "role": "citizen",
        "created_at": "2026-09-07T08:00:00Z"
    },
    {
        "id": "usr-02",
        "name": "T. Jamir",
        "phone": "+91 94360 11223",
        "district": "Kohima",
        "role": "citizen",
        "created_at": "2026-09-07T08:30:00Z"
    }
]

class AuthRequest(BaseModel):
    role: str  # 'citizen' | 'field_officer' | 'admin'
    password: Optional[str] = ""
    name: Optional[str] = ""
    phone: Optional[str] = ""
    district: Optional[str] = "East Khasi Hills"
    unit: Optional[str] = ""


class UserProfile(BaseModel):
    id: str
    name: str
    phone: Optional[str] = ""
    district: Optional[str] = ""
    role: str
    unit: Optional[str] = ""
    token: str


@router.post("/login")
async def login_or_register(req: AuthRequest):
    """
    Authenticate user into the requested RBAC role:
    - field_officer: requires password '9', generates dynamic session token
    - admin: requires password '99', generates dynamic session token
    - citizen: registers user record directly into Supabase (or in-memory cache) with no password.
    """
    requested_role = req.role.strip().lower()

    user_pass = str(req.password or "").strip()

    if requested_role == "admin":
        if user_pass != "99":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Admin Password. Access Denied."
            )
        admin_name = req.name.strip() or "SEOC State Commander"
        admin_district = req.district or "Meghalaya State HQ"
        admin_unit = "NDMA / State Emergency Operations Center"

        user_record = {
            "id": str(uuid.uuid4()),
            "name": admin_name,
            "role": "admin",
            "unit": admin_unit,
            "district": admin_district,
            "phone": req.phone.strip() if req.phone else "",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        try:
            db = get_supabase()
            existing = await asyncio.to_thread(
                lambda: db.table("users").select("*").eq("name", admin_name).eq("role", "admin").execute()
            )
            if existing.data and len(existing.data) > 0:
                user_record = existing.data[0]
            else:
                resp = await asyncio.to_thread(
                    lambda: db.table("users").insert(user_record).execute()
                )
                if resp.data:
                    user_record = resp.data[0]
        except Exception as e:
            logger.warning(f"Supabase admin user save note: {e}")

        token = create_session(role="admin", user_name=admin_name, district=admin_district)
        return {
            "success": True,
            "role": "admin",
            "token": token,
            "user": user_record
        }

    elif requested_role in ["field_officer", "officer", "sdrf"]:
        if user_pass != "9":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Field Officer Password. Access Denied."
            )
        officer_name = req.name.strip() or "Insp. K. Sangma"
        officer_district = req.district or "East Khasi Hills"
        officer_unit = req.unit.strip() if req.unit else "SDRF Rapid Response Team 1"

        user_record = {
            "id": str(uuid.uuid4()),
            "name": officer_name,
            "role": "field_officer",
            "unit": officer_unit,
            "district": officer_district,
            "phone": req.phone.strip() if req.phone else "",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        try:
            db = get_supabase()
            existing = await asyncio.to_thread(
                lambda: db.table("users").select("*").eq("name", officer_name).in_("role", ["field_officer", "officer"]).execute()
            )
            if existing.data and len(existing.data) > 0:
                user_record = existing.data[0]
            else:
                resp = await asyncio.to_thread(
                    lambda: db.table("users").insert(user_record).execute()
                )
                if resp.data:
                    user_record = resp.data[0]
        except Exception as e:
            logger.warning(f"Supabase officer user save note: {e}")

        token = create_session(
            role="field_officer", 
            user_name=officer_name, 
            district=officer_district,
            unit=officer_unit
        )
        return {
            "success": True,
            "role": "field_officer",
            "token": token,
            "user": user_record
        }

    elif requested_role == "citizen":
        # Citizen registration: store name, ICE phone, and district in DB
        citizen_name = req.name.strip() or "Citizen Resident"
        user_record = {
            "id": str(uuid.uuid4()),
            "name": citizen_name,
            "phone": req.phone.strip() if req.phone else "",
            "district": req.district.strip() if req.district else "East Khasi Hills",
            "unit": "Citizen Community",
            "role": "citizen",
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        # Attempt to insert into Supabase users table
        saved_db = False
        try:
            db = get_supabase()
            resp = await asyncio.to_thread(
                lambda: db.table("users").insert(user_record).execute()
            )
            if resp.data:
                user_record = resp.data[0]
                saved_db = True
                logger.info(f"Citizen {citizen_name} persisted into Supabase users table.")
        except Exception as e:
            logger.warning(f"Supabase users table insert note: {e} — stored in memory")

        if not saved_db:
            IN_MEMORY_USERS.insert(0, user_record)

        token = create_session(role="citizen", user_name=citizen_name, district=user_record["district"])
        return {
            "success": True,
            "role": "citizen",
            "token": token,
            "user": user_record
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role '{req.role}'. Choose 'citizen', 'field_officer', or 'admin'."
        )


@router.get("/users")
async def get_registered_users(role: Optional[str] = None):
    """Returns list of registered users/officers from Supabase (or memory), optionally filtered by role."""
    try:
        db = get_supabase()
        query = db.table("users").select("*").order("created_at", desc=True)
        if role:
            if role in ["field_officer", "officer"]:
                query = query.in_("role", ["field_officer", "officer"])
            else:
                query = query.eq("role", role)
        resp = await asyncio.to_thread(lambda: query.execute())
        if resp.data:
            return {"success": True, "data": resp.data, "source": "supabase"}
    except Exception as e:
        logger.warning(f"Supabase users fetch note: {e}")

    filtered = IN_MEMORY_USERS
    if role:
        filtered = [u for u in IN_MEMORY_USERS if u.get("role") == role or (role in ["field_officer", "officer"] and u.get("role") in ["field_officer", "officer"])]
    return {"success": True, "data": filtered, "source": "in_memory"}
