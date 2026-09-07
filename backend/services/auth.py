"""
NE-SHIELD API Authentication Service
=====================================
Self-verifying HMAC session tokens — restart-safe.

Token format:  neshield_{prefix}_{payload_b64}_{hmac_sig}
  prefix:  adm | off | usr
  payload: base64url(role|name|district|unit|expires_at)
  hmac:    HMAC-SHA256(prefix + "." + payload, SECRET_KEY)

Roles enforced at backend:
  - require_officer : Field Officer or Admin
  - require_admin   : Admin (HQ) only
"""

import os
import hmac
import time
import base64
import hashlib
import secrets
import json
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

# Secret key used for HMAC token signing — never expose to clients
SECRET_KEY: str = os.getenv("NE_SHIELD_SECRET_KEY", "ne-shield-default-secret-2026-sih")

# Master server API keys (used for tests and server-to-server)
OFFICER_KEY: str = os.getenv("OFFICER_API_KEY", "ne-shield-officer-key-2026")
ADMIN_KEY: str   = os.getenv("ADMIN_API_KEY",   "ne-shield-admin-key-2026")

# In-memory fast-lookup cache (populated on create, not required for verification)
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


def _sign(payload: str) -> str:
    """Generate HMAC-SHA256 hex signature for a payload string."""
    return hmac.new(
        SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def create_session(role: str, user_name: str = "", district: str = "", unit: str = "") -> str:
    """
    Generates an HMAC-signed, self-verifying session token.
    Token is valid across server restarts — no session store required for verification.
    """
    prefix = "adm" if role == "admin" else "off" if role in ["field_officer", "officer", "sdrf"] else "usr"
    normalized_role = "admin" if role == "admin" else "field_officer" if role in ["field_officer", "officer", "sdrf"] else "citizen"
    expires_at = time.time() + SESSION_TTL_SECONDS

    session_data = {
        "role": normalized_role,
        "name": user_name or ("SEOC Admin Commander" if role == "admin" else "Field Officer"),
        "district": district,
        "unit": unit,
        "expires_at": expires_at,
    }

    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(session_data).encode("utf-8")
    ).decode("utf-8").rstrip("=")

    sign_input = f"{prefix}.{payload_b64}"
    sig = _sign(sign_input)

    token = f"neshield_{prefix}_{payload_b64}.{sig}"

    # Also cache in memory for O(1) fast lookup
    ACTIVE_SESSIONS[token] = session_data

    return token


def verify_session(token: str, required_role: str = "officer") -> Optional[Dict[str, Any]]:
    """
    Validates a session token using HMAC verification.
    Works even after server restart — no in-memory dict required.
    """
    now = time.time()

    # 1. Master Key Check (for backend integration tests and emergency automation)
    if required_role == "officer":
        if hmac.compare_digest(token, OFFICER_KEY) or hmac.compare_digest(token, ADMIN_KEY):
            return {"role": "officer", "name": "System Officer / Service Account"}
    elif required_role == "admin":
        if hmac.compare_digest(token, ADMIN_KEY):
            return {"role": "admin", "name": "System Admin / Service Account"}

    # 2. Fast-path: check in-memory cache
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

    # 3. HMAC self-verification path (restart-safe)
    if token.startswith("neshield_") and "." in token:
        try:
            parts = token.split("_")
            if len(parts) >= 3:
                prefix = parts[1]
                rest = "_".join(parts[2:])
                payload_b64, sig = rest.rsplit(".", 1)

                sign_input = f"{prefix}.{payload_b64}"
                expected_sig = _sign(sign_input)

                if hmac.compare_digest(sig, expected_sig):
                    # Add padding back for base64 decoding
                    padding = 4 - len(payload_b64) % 4
                    if padding != 4:
                        payload_b64 += "=" * padding

                    session_data = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))

                    if session_data.get("expires_at", 0) > now:
                        role = session_data.get("role")
                        if required_role == "officer" and role in ["field_officer", "officer", "admin"]:
                            ACTIVE_SESSIONS[token] = session_data
                            return session_data
                        if required_role == "admin" and role == "admin":
                            ACTIVE_SESSIONS[token] = session_data
                            return session_data
        except Exception:
            pass

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
            detail="Invalid or expired Field Officer / Admin session. Please re-login."
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
            detail="Invalid or expired Admin session. Please re-login."
        )
    return AuthUser(token, session)
