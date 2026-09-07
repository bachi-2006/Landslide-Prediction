"""
NE-SHIELD API Key Authentication Service
=========================================
Provides FastAPI Depends() guards for sensitive endpoints.

Roles enforced at backend:
  - require_officer : Field Officer or Admin
  - require_admin   : Admin (HQ) only

Keys are loaded from environment variables.
Production path: replace with Supabase JWT verification
(verify_jwt -> decode with SUPABASE_JWT_SECRET).
"""

import os
import hmac
import time
import secrets
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

# Master server API keys (never sent to clients; used for server-to-server and tests)
OFFICER_KEY: str = os.getenv("OFFICER_API_KEY", "ne-shield-officer-key-2026")
ADMIN_KEY: str   = os.getenv("ADMIN_API_KEY",   "ne-shield-admin-key-2026")

# Dynamic In-Memory Session Store: token -> session metadata
ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = 86400  # 24 hours


class AuthUser(str):
    """Token string with attached authenticated user profile for audit trails."""
    def __new__(cls, token: str, session: Optional[Dict[str, Any]] = None):
        obj = str.__new__(cls, token)
        obj.session = session or {}
        obj.name = obj.session.get("name", "Authorized User")
        obj.role = obj.session.get("role", "officer")
        obj.district = obj.session.get("district", "")
        obj.unit = obj.session.get("unit", "")
        return obj


def create_session(role: str, user_name: str = "", district: str = "", unit: str = "") -> str:
    """Generates an ephemeral, cryptographically random per-session token."""
    prefix = "adm" if role == "admin" else "off" if role in ["field_officer", "officer", "sdrf"] else "usr"
    token = f"neshield_{prefix}_{secrets.token_urlsafe(32)}"
    ACTIVE_SESSIONS[token] = {
        "role": "admin" if role == "admin" else "field_officer" if role in ["field_officer", "officer", "sdrf"] else "citizen",
        "name": user_name or ("SEOC Admin Commander" if role == "admin" else "Field Officer"),
        "district": district,
        "unit": unit,
        "created_at": time.time(),
        "expires_at": time.time() + SESSION_TTL_SECONDS
    }
    return token


def verify_session(token: str, required_role: str = "officer") -> Optional[Dict[str, Any]]:
    """Validates session token and enforces role hierarchy (Admin supersedes Officer)."""
    now = time.time()

    # 1. Dynamic Ephemeral Session Check
    if token in ACTIVE_SESSIONS:
        session = ACTIVE_SESSIONS[token]
        if session.get("expires_at", 0) > now:
            role = session.get("role")
            if required_role == "officer" and role in ["field_officer", "officer", "admin"]:
                return session
            if required_role == "admin" and role == "admin":
                return session
        else:
            del ACTIVE_SESSIONS[token]

    # 2. Master Key Fallback (for backend integration tests and emergency automation)
    if required_role == "officer":
        if hmac.compare_digest(token, OFFICER_KEY) or hmac.compare_digest(token, ADMIN_KEY):
            return {"role": "officer", "name": "System Officer / Service Account"}
    elif required_role == "admin":
        if hmac.compare_digest(token, ADMIN_KEY):
            return {"role": "admin", "name": "System Admin / Service Account"}

    return None


def _extract_token(authorization: Optional[str]) -> str:
    """Strips 'Bearer ' prefix and returns the raw token string."""
    return (authorization or "").replace("Bearer ", "").strip()


def require_officer(authorization: Optional[str] = Header(None)) -> AuthUser:
    """
    Dependency: allows authenticated Field Officers and Admins.
    Returns AuthUser (compatible with str) containing user audit metadata.
    """
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Please log in via RBAC."
        )

    session = verify_session(token, required_role="officer")
    if not session:
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired Field Officer / Admin session."
        )
    return AuthUser(token, session)


def require_admin(authorization: Optional[str] = Header(None)) -> AuthUser:
    """
    Dependency: allows authenticated Admins only.
    Returns AuthUser (compatible with str) containing admin audit metadata.
    """
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Please log in via Admin RBAC."
        )

    session = verify_session(token, required_role="admin")
    if not session:
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired Admin session."
        )
    return AuthUser(token, session)
